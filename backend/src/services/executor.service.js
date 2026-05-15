'use strict';

/**
 * ExecutorService — runs user scripts in an isolated-vm sandbox.
 *
 * Key improvements over the old vm-module approach:
 *   1. isolated-vm  — each script runs in a V8 Isolate; host memory is
 *      unreachable, infinite loops don't freeze the event loop.
 *   2. BullMQ queue — tasks are enqueued and executed with automatic retries,
 *      concurrency limits, and persistent job state backed by Redis.
 *   3. Structured log entries carry { task_id, level, message, line, source }
 *      so the log viewer can filter by source file and show line numbers.
 */

const ivm = require('isolated-vm');
const { v4: uuidv4 } = require('uuid');

const db             = require('../db');
const browserService = require('./browser.service');
const queueService   = require('./queue.service');

// Lazy require to avoid circular dependency at startup
function getIo() {
  return require('../index').io;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ─── Structured log emitter ───────────────────────────────────────────────────

/**
 * Emit a structured log entry (persists to DB + broadcasts via Socket.IO).
 *
 * @param {string} taskId
 * @param {string} level   - 'info' | 'warn' | 'error' | 'success' | 'debug'
 * @param {string} message
 * @param {object} [meta]  - optional { line, source }
 */
function emitLog(taskId, level, message, meta = {}) {
  const io = getIo();
  const entry = {
    task_id: taskId,
    level,
    message: String(message),
    line:    meta.line   ?? null,
    source:  meta.source ?? null,
  };

  db.logs.insert(entry);

  const payload = { ...entry, timestamp: new Date().toISOString() };
  io.to(`task:${taskId}`).emit('log', payload);
  io.emit('log:global', payload);
}

// ─── isolated-vm script runner ────────────────────────────────────────────────

/**
 * Run `scriptCode` inside a fresh V8 Isolate.
 * The Playwright `page` object is bridged via Reference callbacks so user
 * code can call it asynchronously without touching Node's heap directly.
 *
 * @returns {Promise<any>} resolved value returned by the script
 */
async function runInIsolate({ taskId, scriptCode, page, browser, browserId, timeoutMs, abortSignal }) {
  const isolate = new ivm.Isolate({ memoryLimit: 128 }); // 128 MB cap
  const ctx     = await isolate.createContext();
  const jail    = ctx.global;

  // ── Expose log helpers ──────────────────────────────────────────────────────
  await jail.set('__log', new ivm.Reference(function (level, msg, line) {
    emitLog(taskId, level, String(msg), { line, source: `task-${taskId}.js` });
  }));

  // ── Expose sleep ────────────────────────────────────────────────────────────
  await jail.set('__sleep', new ivm.Reference(function (ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }));

  // ── Expose page methods via a bridge reference ───────────────────────────────
  // We expose an async __callPage(method, ...args) that delegates to Playwright.
  await jail.set('__callPage', new ivm.Reference(async function (method, ...args) {
    if (typeof page[method] !== 'function') {
      throw new Error(`page.${method} is not a function`);
    }
    const result = await page[method](...args);
    // Return primitives only; objects become JSON strings
    if (result === null || result === undefined) return null;
    if (typeof result === 'string' || typeof result === 'number' || typeof result === 'boolean') {
      return result;
    }
    try { return JSON.stringify(result); } catch (_) { return String(result); }
  }));

  // ── Expose fetch ──────────────────────────────────────────────────────────
  await jail.set('__fetch', new ivm.Reference(async function (url, options) {
    const res  = await fetch(url, options ? JSON.parse(options) : undefined);
    const text = await res.text();
    return JSON.stringify({ status: res.status, ok: res.ok, body: text });
  }));

  // ── Bootstrap: define log, sleep, page, fetch, console inside the isolate ──
  const bootstrap = `
    (function() {
      // log helpers
      const log = (msg) => __log.applySync(undefined, ['info', String(msg), null]);
      log.info    = (msg, line) => __log.applySync(undefined, ['info',    String(msg), line ?? null]);
      log.warn    = (msg, line) => __log.applySync(undefined, ['warn',    String(msg), line ?? null]);
      log.error   = (msg, line) => __log.applySync(undefined, ['error',   String(msg), line ?? null]);
      log.success = (msg, line) => __log.applySync(undefined, ['success', String(msg), line ?? null]);
      log.debug   = (msg, line) => __log.applySync(undefined, ['debug',   String(msg), line ?? null]);
      globalThis.log = log;

      // sleep
      globalThis.sleep = (ms) => __sleep.applySyncPromise(undefined, [ms]);

      // page proxy — supports await page.goto(...) etc.
      const _makePage = () => new Proxy({}, {
        get(_, method) {
          return (...args) => __callPage.applySyncPromise(undefined, [method, ...args]);
        }
      });
      globalThis.page = _makePage();

      // fetch
      globalThis.fetch = async (url, opts) => {
        const raw  = await __fetch.applySyncPromise(undefined, [url, opts ? JSON.stringify(opts) : null]);
        const data = JSON.parse(raw);
        return {
          status: data.status,
          ok:     data.ok,
          text:   () => Promise.resolve(data.body),
          json:   () => Promise.resolve(JSON.parse(data.body)),
        };
      };

      // console → log
      globalThis.console = {
        log:   (...a) => log.info(a.join(' ')),
        info:  (...a) => log.info(a.join(' ')),
        warn:  (...a) => log.warn(a.join(' ')),
        error: (...a) => log.error(a.join(' ')),
        debug: (...a) => log.debug(a.join(' ')),
      };

      // randomInt helper
      globalThis.randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    })();
  `;

  const bootstrapScript = await isolate.compileScript(bootstrap);
  await bootstrapScript.run(ctx);

  // ── Wrap user code in async IIFE ──────────────────────────────────────────
  const wrappedCode = `(async function __script__() {\n${scriptCode}\n})();`;
  const userScript  = await isolate.compileScript(wrappedCode, { filename: `task-${taskId}.js` });

  // ── Execute with timeout + abort race ────────────────────────────────────
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Script timed out after ${timeoutMs / 1000}s`)), timeoutMs)
  );

  const abortPromise = new Promise((_, reject) => {
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => reject(new Error('Task was stopped by user')));
    }
  });

  const runPromise = userScript.run(ctx, { timeout: timeoutMs });

  try {
    const result = await Promise.race([runPromise, timeoutPromise, abortPromise]);
    return result;
  } finally {
    // Dispose the isolate to free V8 resources
    try { isolate.dispose(); } catch (_) {}
  }
}

// ─── ExecutorService ──────────────────────────────────────────────────────────

class ExecutorService {
  constructor() {
    /** @type {Map<string, { abortController: AbortController, browserId: string }>} */
    this.running = new Map();
  }

  /**
   * Execute a script for the given task.
   * If Redis is available, delegates to BullMQ queue; otherwise runs directly.
   *
   * @param {object} opts
   * @param {string} opts.taskId
   * @param {string} opts.scriptCode
   * @param {boolean} [opts.headless]
   * @param {string}  [opts.proxy]
   * @param {string}  [opts.profileId]
   * @param {number}  [opts.timeoutMs]
   * @param {number}  [opts.retries]    - BullMQ retry count (default 0)
   * @returns {Promise<{ success: boolean, result: any, error: string|null }>}
   */
  async execute(opts) {
    const { taskId, retries = 0, ...rest } = opts;

    // If queue is ready, enqueue via BullMQ for retries + visibility
    if (queueService.isReady() && retries > 0) {
      return queueService.enqueue(taskId, { taskId, retries, ...rest });
    }

    // Fallback: run directly in-process
    return this._run({ taskId, ...rest });
  }

  /**
   * Internal: actually run the script in an isolated-vm sandbox.
   */
  async _run({ taskId, scriptCode, headless = true, proxy, profileId, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    if (this.running.has(taskId)) {
      throw new Error(`Task ${taskId} is already running`);
    }

    const io = getIo();
    let browserId = null;

    // ── Check run limit ──────────────────────────────────────────────────────
    const taskRow = db.tasks.findById(taskId);
    if (taskRow && taskRow.run_limit !== null && taskRow.run_count >= taskRow.run_limit) {
      emitLog(taskId, 'warn', `Run limit reached (${taskRow.run_limit} runs). Task will not execute.`);
      return { success: false, result: null, error: 'Run limit reached' };
    }

    // ── Start run record ─────────────────────────────────────────────────────
    const runId = db.taskRuns.start(taskId);
    db.tasks.incrementRunCount(taskId);

    db.tasks.updateStatus(taskId, 'running');
    io.to(`task:${taskId}`).emit('task:status', { taskId, status: 'running' });
    emitLog(taskId, 'info', 'Task started');

    const abortController = new AbortController();
    this.running.set(taskId, { abortController, browserId: null });

    try {
      // Launch browser
      const { browserId: bid } = await browserService.launch({ headless, proxy, profileId });
      browserId = bid;
      this.running.get(taskId).browserId = browserId;

      const { page } = await browserService.newPage(browserId);
      const browserObj = browserService.browsers.get(browserId).browser;

      emitLog(taskId, 'info', `Browser launched (session: ${browserId})`);

      // Run script in isolated-vm
      const result = await runInIsolate({
        taskId,
        scriptCode,
        page,
        browser:    browserObj,
        browserId,
        timeoutMs,
        abortSignal: abortController.signal,
      });

      emitLog(taskId, 'success', 'Task completed successfully');
      db.tasks.updateStatus(taskId, 'completed', result ?? null);
      db.taskRuns.finish(runId, { status: 'completed' });
      io.to(`task:${taskId}`).emit('task:status', { taskId, status: 'completed', result });

      return { success: true, result: result ?? null, error: null };

    } catch (err) {
      const isStopped = err.message.includes('stopped by user');
      const status    = isStopped ? 'stopped' : 'failed';

      emitLog(taskId, isStopped ? 'warn' : 'error', `Task ${status}: ${err.message}`);
      db.tasks.updateStatus(taskId, status, { error: err.message });
      db.taskRuns.finish(runId, { status, error: err.message });
      io.to(`task:${taskId}`).emit('task:status', { taskId, status, error: err.message });

      return { success: false, result: null, error: err.message };

    } finally {
      this.running.delete(taskId);

      if (browserId) {
        try { await browserService.closeBrowser(browserId); }
        catch (e) { console.warn('[ExecutorService] Cleanup error:', e.message); }
      }
    }
  }

  stop(taskId) {
    const session = this.running.get(taskId);
    if (!session) throw new Error(`Task ${taskId} is not currently running`);
    session.abortController.abort();
    console.log(`[ExecutorService] Abort signal sent to task ${taskId}`);
  }

  isRunning(taskId) {
    return this.running.has(taskId);
  }

  listRunning() {
    return [...this.running.keys()];
  }
}

const executorService = new ExecutorService();
module.exports = executorService;
