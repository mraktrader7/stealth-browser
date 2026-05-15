'use strict';

const express = require('express');
const db      = require('../db');

const router = express.Router();

// ─── GET /api/logs ────────────────────────────────────────────────────────────
// Query params:
//   page     (default: 1)
//   limit    (default: 50, max: 200)
//   task_id  (optional) — filter by task UUID
//   level    (optional) — info | warn | error | success | debug
//   source   (optional) — filter by source file name (e.g. task-<id>.js)
//   date     (optional) — YYYY-MM-DD — filter by calendar date
//   search   (optional) — free-text search in message field
router.get('/', (req, res) => {
  let { page = 1, limit = 50, task_id, level, source, date, search } = req.query;

  page  = Math.max(1, parseInt(page, 10)  || 1);
  limit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

  // Validate level
  const validLevels = ['info', 'warn', 'error', 'success', 'debug'];
  if (level && level !== 'all' && !validLevels.includes(level)) {
    return res.status(400).json({
      error: `Invalid level. Must be one of: ${validLevels.join(', ')}`,
    });
  }

  // Validate date format
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
  }

  // If task_id filter is set, verify the task exists
  if (task_id) {
    const task = db.tasks.findById(task_id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
  }

  const result = db.logs.findAll({
    page, limit,
    task_id: task_id || undefined,
    level:   (level && level !== 'all') ? level : undefined,
    source:  source  || undefined,
    date:    date    || undefined,
    search:  search  || undefined,
  });

  res.json({
    data: result.rows,
    pagination: {
      page,
      limit,
      total:      result.total,
      totalPages: Math.ceil(result.total / limit),
      hasNext:    page * limit < result.total,
      hasPrev:    page > 1,
    },
    filters: {
      task_id: task_id  || null,
      level:   level    || null,
      source:  source   || null,
      date:    date     || null,
      search:  search   || null,
    },
  });
});

// ─── GET /api/logs/task/:taskId ───────────────────────────────────────────────
router.get('/task/:taskId', (req, res) => {
  const task = db.tasks.findById(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const logs = db.logs.findByTaskId(req.params.taskId);
  res.json({ data: logs, total: logs.length, taskId: req.params.taskId });
});

// ─── DELETE /api/logs ─────────────────────────────────────────────────────────
router.delete('/', (req, res) => {
  const { task_id } = req.query;

  if (task_id) {
    const task = db.tasks.findById(task_id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const result = db.logs.clearByTaskId(task_id);
    return res.json({ message: `Cleared logs for task ${task_id}`, deleted: result.changes });
  }

  const result = db.logs.clearAll();
  res.json({ message: 'All logs cleared', deleted: result.changes });
});

module.exports = router;
