'use strict';

const rateLimit = require('express-rate-limit');

/**
 * Rate limiter for task run endpoint — prevents abuse.
 * 30 runs per minute per IP by default.
 */
const runLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 minute
  max: parseInt(process.env.RATE_LIMIT_RUNS || '30', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many run requests. Please wait before trying again.' },
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * General API rate limiter — 300 requests per minute per IP.
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_API || '300', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
  skip: () => process.env.NODE_ENV === 'test',
});

module.exports = { runLimiter, apiLimiter };
