'use strict';

const jwt = require('jsonwebtoken');

const JWT_SECRET  = process.env.JWT_SECRET  || 'stealth-browser-dev-secret-change-in-production';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '24h';
const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';

// Default admin credentials (override via env)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

/**
 * Generate a JWT token for the given username.
 */
function generateToken(username) {
  return jwt.sign({ username, iat: Math.floor(Date.now() / 1000) }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES,
  });
}

/**
 * Verify credentials and return { token } or throw.
 */
function login(username, password) {
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    const err = new Error('Invalid username or password');
    err.status = 401;
    throw err;
  }
  const token = generateToken(username);
  return { token, expiresIn: JWT_EXPIRES, username };
}

/**
 * Express middleware: validate Bearer JWT token.
 * Skipped entirely when AUTH_ENABLED !== 'true'.
 */
function requireAuth(req, res, next) {
  // If auth is disabled (development default), skip
  if (!AUTH_ENABLED) return next();

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing or invalid' });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { generateToken, login, requireAuth, AUTH_ENABLED };
