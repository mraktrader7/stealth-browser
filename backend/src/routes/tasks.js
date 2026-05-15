'use strict';

const express = require('express');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');

const db = require('../db');
const executorService = require('../services/executor.service');

const router = express.Router();

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
  return errors;
}

// ─── GET /api/tasks ───────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const tasks = db.tasks.findAll().map((t) => ({
    ...t,
    is_running: executorService.isRunning(t.id),
  }));
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

  const task = db.tasks.create({
    id: uuidv4(),
    name: req.body.name.trim(),
    script_id: req.body.script_id,
    cron_expression: req.body.cron_expression || null,
  });

  if (task.cron_expression) {
    scheduleCronTask(task);
  }

  res.status(201).json({ data: task, message: 'Task created' });
});

// ─── GET /api/tasks/:id ───────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const task = db.tasks.findById(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const logs = db.logs.findByTaskId(req.params.id);

  res.json({
    data: {
      ...task,
      is_running: executorService.isRunning(task.id),
      logs,
    },
  });
});

// ─── POST /api/tasks/:id/run ──────────────────────────────────────────────────
router.post('/:id/run', async (req, res) => {
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

  const { headless = true, proxy, profileId, timeoutMs } = req.body || {};

  // Respond immediately; execution happens in background
  res.json({ message: 'Task started', taskId: task.id });

  // Fire and forget
  executorService
    .execute({
      taskId: task.id,
      scriptCode: task.script_content,
      headless,
      proxy,
      profileId,   // ← persistent profile support
      timeoutMs,
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
    return res.status(404).json({ error: 'Task not found' });
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
