'use strict';

const express = require('express');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');

const db = require('../db');
const executorService = require('../services/executor.service');
const { requireAuth } = require('../middleware/auth');
const { runLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// Apply auth to all task routes
router.use(requireAuth);

// ─── In-memory cron job registry ─────────────────────────────────────────────
// Maps taskId → node-cron ScheduledTask
const cronJobs = new Map();

function scheduleCronTask(task) {
  if (!task.cron_expression) return;
  if (!cron.validate(task.cron_expression)) {
    console.warn(`[Tasks] Invalid cron expression for task ${task.id}: ${task.cron_expression}`);
    return;
  }

  // Stop any existing job
  if (cronJobs.has(task.id)) {
    cronJobs.get(task.id).stop();
  }

  const job = cron.schedule(task.cron_expression, async () => {
    console.log(`[Tasks] Cron triggered task ${task.id}`);
    const fullTask = db.tasks.findById(task.id);
    if (!fullTask) return;

    // Check run limit
    if (fullTask.run_limit !== null && fullTask.run_count >= fullTask.run_limit) {
      console.log(`[Tasks] Task ${task.id} has reached run limit ${fullTask.run_limit}, stopping cron`);
      if (cronJobs.has(task.id)) {
        cronJobs.get(task.id).stop();
        cronJobs.delete(task.id);
      }
      return;
    }

    if (executorService.isRunning(task.id)) {
      console.warn(`[Tasks] Task ${task.id} is already running; skipping cron trigger`);
      return;
    }
    try {
      await executorService.execute({
        taskId: fullTask.id,
        scriptCode: fullTask.script_content,
      });
    } catch (err) {
      console.error(`[Tasks] Cron execution error for task ${task.id}:`, err.message);
    }
  });

  cronJobs.set(task.id, job);
  console.log(`[Tasks] Scheduled cron for task ${task.id}: ${task.cron_expression}`);
}

// Re-schedule any tasks with cron expressions on startup
function initCronJobs() {
  const tasks = db.tasks.findAll();
  for (const t of tasks) {
    if (t.cron_expression && t.status !== 'stopped') {
      scheduleCronTask(t);
    }
  }
}
// Called from index.js after db.initialize()
setTimeout(initCronJobs, 500);

// ─── Script Validation ────────────────────────────────────────────────────────
// Reject scripts containing dangerous patterns
const DANGEROUS_PATTERNS = [
  /\beval\s*\(/,
  /\bFunction\s*\(/,
  /\brequire\s*\(/,
  /\bprocess\s*\./,
  /\bchild_process\b/,
  /\bfs\s*\./,
  /\b__dirname\b/,
  /\b__filename\b/,
  /\bglobal\s*\./,
  /new\s+Function\s*\(/,
];

function validateScriptContent(content) {
  if (!content || typeof content !== 'string') return [];
  const issues = [];
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(content)) {
      issues.push(`Dangerous pattern detected: ${pattern.toString()}`);
    }
  }
  return issues;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function validateTask(body, requireAll = false) {
  const errors = [];
  if (requireAll && !body.name) errors.push('name is required');
  if (requireAll && !body.script_id) errors.push('script_id is required');
  if (body.name !== undefined && typeof body.name !== 'string') errors.push('name must be a string');
  if (body.script_id !== undefined && typeof body.script_id !== 'string') {
    errors.push('script_id must be a string');
  }
  if (body.cron_expression !== undefined && body.cron_expression !== null) {
    if (typeof body.cron_expression !== 'string') {
      errors.push('cron_expression must be a string or null');
    } else if (!cron.validate(body.cron_expression)) {
      errors.push(`cron_expression "${body.cron_expression}" is not a valid cron pattern`);
    }
  }
  if (body.tags !== undefined && !Array.isArray(body.tags)) {
    errors.push('tags must be an array of strings');
  }
  if (body.run_limit !== undefined && body.run_limit !== null) {
    const n = parseInt(body.run_limit, 10);
    if (isNaN(n) || n < 1) errors.push('run_limit must be a positive integer or null');
  }
  return errors;
}

// Parse tags from DB (stored as JSON string)
function parseTags(raw) {
  try { return JSON.parse(raw || '[]'); } catch (_) { return []; }
}

function normalizeTask(t) {
  return { ...t, tags: parseTags(t.tags) };
}

// ─── GET /api/tasks ───────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { tag } = req.query;
  let tasks = db.tasks.findAll().map(normalizeTask).map((t) => ({
    ...t,
    is_running: executorService.isRunning(t.id),
  }));

  if (tag) {
    tasks = tasks.filter((t) => t.tags.includes(tag));
  }

  res.json({ data: tasks, total: tasks.length });
});

// ─── POST /api/tasks ──────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const errors = validateTask(req.body, true);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  const script = db.scripts.findById(req.body.script_id);
  if (!script) {
    return res.status(404).json({ error: 'Script not found' });
  }

  // Validate script content for dangerous patterns
  const scriptIssues = validateScriptContent(script.content);
  if (scriptIssues.length > 0) {
    return res.status(422).json({
      error: 'Script contains potentially unsafe patterns',
      details: scriptIssues,
    });
  }

  const run_limit = req.body.run_limit ? parseInt(req.body.run_limit, 10) : null;

  const task = db.tasks.create({
    id: uuidv4(),
    name: req.body.name.trim(),
    script_id: req.body.script_id,
    cron_expression: req.body.cron_expression || null,
    tags: req.body.tags || [],
    run_limit,
  });

  if (task.cron_expression) {
    scheduleCronTask(task);
  }

  res.status(201).json({ data: normalizeTask(task), message: 'Task created' });
});

// ─── GET /api/tasks/:id ───────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const task = db.tasks.findById(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const logs = db.logs.findByTaskId(req.params.id);
  const stats = db.taskRuns.getStats(req.params.id);

  res.json({
    data: {
      ...normalizeTask(task),
      is_running: executorService.isRunning(task.id),
      logs,
      run_stats: stats,
    },
  });
});

// ─── GET /api/tasks/:id/runs ──────────────────────────────────────────────────
router.get('/:id/runs', (req, res) => {
  const task = db.tasks.findById(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const page  = parseInt(req.query.page  || '1',  10);
  const limit = parseInt(req.query.limit || '20', 10);

  const result = db.taskRuns.findByTaskId(req.params.id, { page, limit });
  const stats  = db.taskRuns.getStats(req.params.id);

  res.json({ data: result, stats });
});

// ─── PUT /api/tasks/:id ───────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const task = db.tasks.findById(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const errors = validateTask(req.body, false);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  const run_limit = req.body.run_limit !== undefined
    ? (req.body.run_limit ? parseInt(req.body.run_limit, 10) : null)
    : undefined;

  const updated = db.tasks.update(req.params.id, {
    name: req.body.name,
    cron_expression: req.body.cron_expression,
    tags: req.body.tags,
    run_limit,
  });

  // Re-schedule cron if changed
  if (req.body.cron_expression !== undefined) {
    if (cronJobs.has(task.id)) {
      cronJobs.get(task.id).stop();
      cronJobs.delete(task.id);
    }
    if (updated.cron_expression) {
      scheduleCronTask(updated);
    }
  }

  res.json({ data: normalizeTask(updated), message: 'Task updated' });
});

// ─── POST /api/tasks/:id/run ──────────────────────────────────────────────────
router.post('/:id/run', runLimiter, async (req, res) => {
  const task = db.tasks.findById(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  if (executorService.isRunning(task.id)) {
    return res.status(409).json({ error: 'Task is already running' });
  }

  if (!task.script_content) {
    return res.status(422).json({ error: 'Script has no content to execute' });
  }

  // Check run limit
  if (task.run_limit !== null && task.run_count >= task.run_limit) {
    return res.status(422).json({
      error: `Run limit reached (${task.run_limit} runs). Reset the counter or increase the limit.`,
    });
  }

  // Validate script content
  const scriptIssues = validateScriptContent(task.script_content);
  if (scriptIssues.length > 0) {
    return res.status(422).json({
      error: 'Script contains potentially unsafe patterns',
      details: scriptIssues,
    });
  }

  const { headless = true, proxy, profileId, timeoutMs, retries = 0 } = req.body || {};

  // Respond immediately; execution happens in background
  res.json({ message: 'Task started', taskId: task.id });

  // Fire and forget — supports BullMQ retries when retries > 0
  executorService
    .execute({
      taskId:     task.id,
      scriptCode: task.script_content,
      headless,
      proxy,
      profileId,
      timeoutMs,
      retries: Math.max(0, parseInt(retries, 10) || 0),
    })
    .catch((err) => {
      console.error(`[Tasks] Execution error for ${task.id}:`, err.message);
    });
});

// ─── POST /api/tasks/:id/stop ─────────────────────────────────────────────────
router.post('/:id/stop', (req, res) => {
  const task = db.tasks.findById(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  if (!executorService.isRunning(task.id)) {
    return res.status(409).json({ error: 'Task is not currently running' });
  }

  executorService.stop(task.id);
  res.json({ message: 'Stop signal sent', taskId: task.id });
});

// ─── DELETE /api/tasks/:id ────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const task = db.tasks.findById(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });;
  }

  if (executorService.isRunning(task.id)) {
    return res.status(409).json({ error: 'Cannot delete a running task. Stop it first.' });
  }

  // Stop cron job if exists
  if (cronJobs.has(task.id)) {
    cronJobs.get(task.id).stop();
    cronJobs.delete(task.id);
  }

  db.tasks.delete(req.params.id);
  res.json({ message: 'Task deleted', id: req.params.id });
});

module.exports = router;
