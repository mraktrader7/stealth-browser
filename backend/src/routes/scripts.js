'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Apply auth to all script routes
router.use(requireAuth);

// ─── Script Import Validation ─────────────────────────────────────────────────
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

// ─── Version History Endpoints ────────────────────────────────────────────────

// GET /api/scripts/:id/versions — list all versions (lightweight, no content)
router.get('/:id/versions', (req, res) => {
  const script = db.scripts.findById(req.params.id);
  if (!script) return res.status(404).json({ error: 'Script not found' });

  const versions = db.scriptVersions.list(req.params.id);
  res.json({ data: versions, total: versions.length });
});

// GET /api/scripts/:id/versions/:versionId — get one version with content
router.get('/:id/versions/:versionId', (req, res) => {
  const version = db.scriptVersions.get(req.params.versionId);
  if (!version || version.script_id !== req.params.id) {
    return res.status(404).json({ error: 'Version not found' });
  }
  res.json({ data: version });
});

// DELETE /api/scripts/:id/versions/:versionId — delete a version
router.delete('/:id/versions/:versionId', (req, res) => {
  const version = db.scriptVersions.get(req.params.versionId);
  if (!version || version.script_id !== req.params.id) {
    return res.status(404).json({ error: 'Version not found' });
  }
  db.scriptVersions.delete(req.params.versionId);
  res.json({ message: 'Version deleted', id: req.params.versionId });
});

// GET /api/scripts/:id/export — download script as .js file
router.get('/:id/export', (req, res) => {
  const script = db.scripts.findById(req.params.id);
  if (!script) return res.status(404).json({ error: 'Script not found' });

  const filename = `${script.name.replace(/[^a-z0-9_-]/gi, '_')}.js`;
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(script.content);
});

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

  const { name, content = '', description = '', skipValidation = false } = req.body;

  // Validate script content for dangerous patterns (can be skipped for trusted imports)
  if (!skipValidation && content.trim()) {
    const issues = validateScriptContent(content);
    if (issues.length > 0) {
      return res.status(422).json({
        error: 'Script contains potentially unsafe patterns',
        details: issues,
        hint: 'Pass skipValidation: true if you trust this script content.',
      });
    }
  }

  const script = db.scripts.create({
    id: uuidv4(),
    name: name.trim(),
    content,
    description,
  });

  // Save initial version
  if (content.trim()) {
    db.scriptVersions.save(script.id, content, 'Initial version');
  }

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

  const { name, content, description, versionLabel } = req.body;

  // Auto-snapshot: if content changed, save old version before overwriting
  if (content !== undefined && content !== existing.content) {
    db.scriptVersions.save(
      existing.id,
      existing.content,
      versionLabel || `Saved at ${new Date().toLocaleTimeString()}`
    );
    // Keep at most 20 versions per script
    db.scriptVersions.prune(existing.id, 20);
  }

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
