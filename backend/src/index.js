'use strict';

require('dotenv').config();
require('express-async-errors');

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');

const db           = require('./db');
const browserService = require('./services/browser.service');
const queueService   = require('./services/queue.service');

const scriptsRouter = require('./routes/scripts');
const tasksRouter = require('./routes/tasks');
const browserRouter = require('./routes/browser');
const logsRouter = require('./routes/logs');
const profilesRouter = require('./routes/profiles');

const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

// ─── App setup ───────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
});

// Export io so services can emit to clients
module.exports.io = io;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logger (lightweight)
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/scripts', scriptsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/browser', browserRouter);
app.use('/api/logs', logsRouter);
app.use('/api/profiles', profilesRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), queue: queueService.isReady() });
});

// Queue metrics endpoint
app.get('/api/queue/metrics', async (_req, res) => {
  const metrics = await queueService.getMetrics();
  res.json({ data: metrics, ready: queueService.isReady() });
});

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Global error handler ────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

// ─── Socket.IO ───────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);

  socket.on('subscribe:task', (taskId) => {
    socket.join(`task:${taskId}`);
    console.log(`[WS] ${socket.id} subscribed to task:${taskId}`);
  });

  socket.on('unsubscribe:task', (taskId) => {
    socket.leave(`task:${taskId}`);
  });

  socket.on('disconnect', () => {
    console.log(`[WS] Client disconnected: ${socket.id}`);
  });
});

// ─── Startup ──────────────────────────────────────────────────────────────────
async function start() {
  try {
    // Initialize database (creates tables if not exist)
    db.initialize();
    console.log('[DB] Database initialized');

    // Initialize BullMQ queue (non-fatal if Redis is down)
    await queueService.init();

    server.listen(PORT, () => {
      console.log(`[SERVER] StealthBrowser backend running on http://localhost:${PORT}`);
      console.log(`[SERVER] CORS origin: ${CORS_ORIGIN}`);
    });
  } catch (err) {
    console.error('[STARTUP] Fatal error:', err);
    process.exit(1);
  }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal) {
  console.log(`\n[SHUTDOWN] Received ${signal}, shutting down gracefully…`);

  try {
    await browserService.closeAll();
    console.log('[SHUTDOWN] All browser sessions closed');
  } catch (err) {
    console.error('[SHUTDOWN] Error closing browsers:', err);
  }

  try {
    await queueService.shutdown();
  } catch (err) {
    console.error('[SHUTDOWN] Error shutting down queue:', err);
  }

  server.close(() => {
    console.log('[SHUTDOWN] HTTP server closed');
    db.close();
    console.log('[SHUTDOWN] Database connection closed');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('[SHUTDOWN] Forced exit after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT]', err);
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

start();
