'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

// ─── GET /api/logs ────────────────────────────────────────────────────────────
// Query params:
//   page     (default: 1)
//   limit    (default: 50, max: 200)
//   task_id  (optional filter)
//   level    (optional filter: info|warn|error|success)
router.get('/', (req, res) => {
  let { page = 1, limit = 50, task_id, level } = req.query;

  page  = Math.max(1, parseInt(page, 10) || 1);
  limit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

  // Validate level filter
  const validLevels = ['info', 'warn', 'error', 'success'];
  if (level && !validLevels.includes(level)) {
    return res.status(400).json({
      error: `Invalid level. Must be one of: ${validLevels.join(', ')}`,
    });
  }

  // If task_id filter is present, verify the task exists
  if (task_id) {
    const task = db.tasks.findById(task_id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
  }

  const result = db.logs.findAll({ page, limit, task_id });

  // Apply level filter in-memory (SQLite approach would require extending db.logs.findAll)
  let rows = result.rows;
  if (level) {
    rows = rows.filter((r) => r.level === level);
  }

  res.json({
    data: rows,
    pagination: {
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
      hasNext: page * limit < result.total,
      hasPrev: page > 1,
    },
    filters: {
      task_id: task_id || null,
      level: level || null,
    },
  });
});

// ─── GET /api/logs/task/:taskId ───────────────────────────────────────────────
// Convenience: all logs for a specific task (chronological order, no pagination)
router.get('/task/:taskId', (req, res) => {
  const task = db.tasks.findById(req.params.taskId);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const logs = db.logs.findByTaskId(req.params.taskId);
  res.json({
    data: logs,
    total: logs.length,
    taskId: req.params.taskId,
  });
});

// ─── DELETE /api/logs ─────────────────────────────────────────────────────────
// Clear all logs, or logs for a specific task if task_id query param is provided
router.delete('/', (req, res) => {
  const { task_id } = req.query;

  if (task_id) {
    const task = db.tasks.findById(task_id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const result = db.logs.clearByTaskId(task_id);
    return res.json({
      message: `Cleared logs for task ${task_id}`,
      deleted: result.changes,
    });
  }

  const result = db.logs.clearAll();
  res.json({
    message: 'All logs cleared',
    deleted: result.changes,
  });
});

module.exports = router;
