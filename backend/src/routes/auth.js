'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { login, AUTH_ENABLED } = require('../middleware/auth');

const router = express.Router();

// Strict rate limit for login attempts — 10 per minute per IP
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait.' },
});

/**
 * POST /api/auth/login
 * Body: { username, password }
 * Returns: { token, expiresIn, username }
 */
router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  try {
    const result = login(username, password);
    res.json({ data: result, message: 'Login successful' });
  } catch (err) {
    res.status(err.status || 401).json({ error: err.message });
  }
});

/**
 * GET /api/auth/status
 * Returns current auth configuration status.
 */
router.get('/status', (req, res) => {
  res.json({ data: { authEnabled: AUTH_ENABLED } });
});

module.exports = router;
