'use strict';

/**
 * /api/profiles — Manage persistent browser profiles
 *
 * A profile is a folder on disk that stores cookies, localStorage, IndexedDB,
 * and session tokens. By assigning a profileId to a task, the browser reuses
 * the same saved state across runs — so you stay logged in automatically.
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const browserService = require('../services/browser.service');

const router = express.Router();

// GET /api/profiles — list all profiles
router.get('/', (_req, res) => {
  const profiles = browserService.listProfiles();
  res.json({ data: profiles, total: profiles.length });
});

// POST /api/profiles — create a new profile
router.post('/', (req, res) => {
  const { name, description } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });

  const id = uuidv4();
  browserService.createProfile(id, { name: name.trim(), description: description || '' });

  res.status(201).json({
    data: { id, name: name.trim(), description: description || '' },
    message: 'Profile created. Use this profileId in your tasks to stay logged in.',
  });
});

// DELETE /api/profiles/:id — delete a profile (clears all saved sessions)
router.delete('/:id', (req, res) => {
  try {
    browserService.deleteProfile(req.params.id);
    res.json({ message: 'Profile deleted', id: req.params.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
