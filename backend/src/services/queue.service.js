'use strict';

/**
 * QueueService — BullMQ-backed task queue.
 *
 * Why BullMQ over bare node-cron execution?
 *  - Automatic retries with exponential back-off
 *  - Concurrency control (default: 3 parallel tasks max)
 *  - Job state persisted in Redis (survives restarts)
 *  - Built-in delayed jobs, job prioritisation, and dead-letter visibility
 *
 * Graceful degradation: if Redis is unavailable the service marks itself
 * as !ready and ExecutorService falls back to direct in-process execution.
 */

const { Queue, Worker, QueueEvents } = require('bullmq');
const IORedis                         = require('ioredis');

const REDIS_URL    = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const QUEUE_NAME   = 'stealth-tasks';
const CONCURRENCY  = parseInt(process.env.QUEUE_CONCURRENCY || '3', 10);

// Lazy references — populated in init()
let queue       = null;
let worker      = null;
let queueEvents = null;
let redisClient = null;
let _ready      = false;

// ─── Init ─────────────────────────────────────────────────────────────────────

/**
 * Connect to Redis and start the BullMQ worker.
 * Called once from index.js on startup.
 */
async function init() {
  try {
    // Use a shared Redis connection for the queue + worker
    redisClient = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null, // required by BullMQ
      enableReadyCheck: false,
    });

    await new Promise((resolve, reject) => {
      redisClient.once('ready', resolve);
      redisClient.once('error', reject);
      // Give Redis 3 seconds to connect
      setTimeout(() => reject(new Error('Redis connection timeout')), 3000);
    });

    queue = new Queue(QUEUE_NAME, { connection: redisClient });

    // Worker processes jobs one by one (or up to CONCURRENCY in parallel)
    worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        // Lazily require executor here to avoid circular dep at module load
        const executorService = require('./executor.service');
        const { taskId, scriptCode, headless, proxy, profileId, timeoutMs } = job.data;

        console.log(`[Queue] Processing job ${job.id} — task ${taskId} (attempt ${job.attemptsMade + 1})`);
        return executorService._run({ taskId, scriptCode, headless, proxy, profileId, timeoutMs });
      },
      {
        connection: redisClient,
        concurrency: CONCURRENCY,
      }
    );

    queueEvents = new QueueEvents(QUEUE_NAME, { connection: redisClient });

    queueEvents.on('completed', ({ jobId }) => {
      console.log(`[Queue] Job ${jobId} completed`);
    });

    queueEvents.on('failed', ({ jobId, failedReason }) => {
      console.error(`[Queue] Job ${jobId} failed: ${failedReason}`);
    });

    worker.on('error', (err) => {
      console.error('[Queue] Worker error:', err.message);
    });

    _ready = true;
    console.log(`[Queue] BullMQ ready (Redis: ${REDIS_URL}, concurrency: ${CONCURRENCY})`);
  } catch (err) {
    _ready = false;
    console.warn(`[Queue] BullMQ unavailable — falling back to direct execution. Reason: ${err.message}`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true if the queue is connected and ready.
 */
function isReady() {
  return _ready;
}

/**
 * Add a task job to the queue.
 *
 * @param {string} taskId
 * @param {object} data   - { taskId, scriptCode, headless, proxy, profileId, timeoutMs, retries }
 * @returns {Promise<{ jobId: string }>}
 */
async function enqueue(taskId, data) {
  if (!_ready) throw new Error('Queue is not ready');

  const { retries = 0, ...jobData } = data;

  const job = await queue.add(`task:${taskId}`, jobData, {
    jobId: `task-${taskId}-${Date.now()}`,
    attempts: retries + 1,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5 s, then 10 s, 20 s …
    },
    removeOnComplete: { count: 500 },
    removeOnFail:     { count: 200 },
  });

  console.log(`[Queue] Enqueued task ${taskId} as job ${job.id} (max attempts: ${retries + 1})`);
  return { jobId: job.id };
}

/**
 * Get queue metrics (job counts by state).
 */
async function getMetrics() {
  if (!_ready) return null;
  const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
  return counts;
}

/**
 * Gracefully shut down the worker + Redis connection.
 */
async function shutdown() {
  try {
    if (worker)      await worker.close();
    if (queueEvents) await queueEvents.close();
    if (queue)       await queue.close();
    if (redisClient) redisClient.disconnect();
    console.log('[Queue] Shutdown complete');
  } catch (err) {
    console.error('[Queue] Shutdown error:', err.message);
  }
}

module.exports = { init, isReady, enqueue, getMetrics, shutdown };
