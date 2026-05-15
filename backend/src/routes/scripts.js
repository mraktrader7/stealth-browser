'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const db = require('../db');

const router = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validateScript(body, requireAll = false) {
  const errors = [];

  if (requireAll && !body.name) {
    errors.push('name is required');
  }
  if (body.name !== undefined && typeof body.name !== 'string') {
    errors.push('name must be a string');
  }
  if (body.name && body.name.trim().length === 0) {
    errors.push('name cannot be empty');
  }
  if (body.content !== undefined && typeof body.content !== 'string') {
    errors.push('content must be a string');
  }
  if (body.description !== undefined && typeof body.description !== 'string') {
    errors.push('description must be a string');
  }

  return errors;
}

// ─── GET /api/scripts ─────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const scripts = db.scripts.findAll();
  res.json({ data: scripts, total: scripts.length });
});

// ─── GET /api/scripts/:id ─────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const script = db.scripts.findById(req.params.id);
  if (!script) {
    return res.status(404).json({ error: 'Script not found' });
  }
  res.json({ data: script });
});

// ─── POST /api/scripts ───────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const errors = validateScript(req.body, true);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  const { name, content = '', description = '' } = req.body;

  const script = db.scripts.create({
    id: uuidv4(),
    name: name.trim(),
    content,
    description,
  });

  res.status(201).json({ data: script, message: 'Script created' });
});

// ─── PUT /api/scripts/:id ────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const existing = db.scripts.findById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Script not found' });
  }

  const errors = validateScript(req.body, false);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  const { name, content, description } = req.body;

  const updated = db.scripts.update(req.params.id, {
    name: name !== undefined ? name.trim() : undefined,
    content,
    description,
  });

  res.json({ data: updated, message: 'Script updated' });
});

// ─── DELETE /api/scripts/:id ─────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const existing = db.scripts.findById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Script not found' });
  }

  // Check if any tasks reference this script
  const tasks = db.tasks.findAll().filter((t) => t.script_id === req.params.id);
  if (tasks.length > 0) {
    return res.status(409).json({
      error: 'Cannot delete script: it is referenced by one or more tasks',
      tasks: tasks.map((t) => ({ id: t.id, name: t.name })),
    });
  }

  db.scripts.delete(req.params.id);
  res.json({ message: 'Script deleted', id: req.params.id });
});

module.exports = router;
