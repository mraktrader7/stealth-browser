'use strict';

const vm = require('vm');
const { v4: uuidv4 } = require('uuid');

const db = require('../db');
const browserService = require('./browser.service');

// We import io lazily to avoid circular require at module load time
function getIo() {
  return require('../index').io;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ─── RunnerContext ────────────────────────────────────────────────────────────

/**
 * Builds the sandbox context that scripts run in.
 * Injects: page, browser (raw playwright), log(), fetch, console helpers.
 */
function buildContext(taskId, page, browser, browserId) {
  const io = getIo();

  /**
   * Emit a log line in real-time via Socket.IO and persist it to DB.
   */
  function emitLog(level, message) {
    const entry = {
      task_id: taskId,
      level,
      message: String(message),
    };

    // Persist
    db.logs.insert(entry);

    // Broadcast to subscribers
    const payload = { ...entry, timestamp: new Date().toISOString() };
    io.to(`task:${taskId}`).emit('log', payload);
    io.emit('log:global', payload); // also broadcast globally for dashboards
  }

  const log = (message) => emitLog('info', message);
  log.info    = (msg) => emitLog('info', msg);
  log.warn    = (msg) => emitLog('warn', msg);
  log.error   = (msg) => emitLog('error', msg);
  log.success = (msg) => emitLog('success', msg);

  // Wrap common playwright page helpers to auto-log errors
  const safePage = new Proxy(page, {
    get(target, prop) {
      const val = target[prop];
      if (typeof val === 'function') {
        return function (...args) {
          return val.apply(target, args);
        };
      }
      return val;
    },
  });

  // Provide a lightweight sleep helper
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Provide a randomInt helper
  const randomInt = (min, max) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

  // Safe console (routes to log)
  const safeConsole = {
    log:   (...args) => log.info(args.join(' ')),
    info:  (...args) => log.info(args.join(' ')),
    warn:  (...args) => log.warn(args.join(' ')),
    error: (...args) => log.error(args.join(' ')),
  };

  return {
    page: safePage,
    browser,
    log,
    sleep,
    randomInt,
    console: safeConsole,
    // Allow scripts to use fetch (Node 18+)
    fetch: (...args) => fetch(...args),
    // Expose URL for convenience
    URL,
    // Expose task ID so scripts can reference themselves
    __taskId: taskId,
    __browserId: browserId,
  };
}

// ─── ExecutorService ──────────────────────────────────────────────────────────

class ExecutorService {
  constructor() {
    /** @type {Map<string, { abortController: AbortController, browserId: string, pageId: string }>} */
    this.running = new Map();
  }

  /**
   * Execute a script string for the given task.
   *
   * @param {object}  opts
   * @param {string}  opts.taskId       Task UUID
   * @param {string}  opts.scriptCode   Raw JS code to execute
   * @param {boolean} [opts.headless]   Browser headless mode
   * @param {string}  [opts.proxy]      Proxy URL
   * @param {number}  [opts.timeoutMs]  Execution timeout in ms
   * @returns {Promise<{ success: boolean, result: any, error: string|null }>}
   */
  async execute({ taskId, scriptCode, headless = true, proxy, profileId, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    if (this.running.has(taskId)) {
      throw new Error(`Task ${taskId} is already running`);
    }

    let browserId = null;
    let pageId = null;

    const io = getIo();

    function emitLog(level, message) {
      const entry = { task_id: taskId, level, message: String(message) };
      db.logs.insert(entry);
      const payload = { ...entry, timestamp: new Date().toISOString() };
      io.to(`task:${taskId}`).emit('log', payload);
      io.emit('log:global', payload);
    }

    // Update task to 'running'
    db.tasks.updateStatus(taskId, 'running');
    io.to(`task:${taskId}`).emit('task:status', { taskId, status: 'running' });

    emitLog('info', 'Task started');

    const abortController = new AbortController();
    this.running.set(taskId, { abortController, browserId: null, pageId: null });

    let timeoutHandle;

    try {
      // Launch browser — pass profileId to enable persistent sessions
      const { browserId: bid } = await browserService.launch({ headless, proxy, profileId });
      browserId = bid;
      this.running.get(taskId).browserId = browserId;

      // Open page
      const { pageId: pid, page } = await browserService.newPage(browserId);
      pageId = pid;
      this.running.get(taskId).pageId = pageId;

      emitLog('info', `Browser launched (session: ${browserId})`);

      // Build sandboxed context
      const context = buildContext(taskId, page, browserService.browsers.get(browserId).browser, browserId);
      const sandbox = vm.createContext(context);

      // Wrap the user script in an async IIFE
      const wrappedCode = `(async function __script__() {\n${scriptCode}\n})();`;

      // Compile
      const script = new vm.Script(wrappedCode, {
        filename: `task-${taskId}.js`,
        lineOffset: -1,
      });

      // Execute with timeout
      const executePromise = script.runInContext(sandbox, {
        timeout: timeoutMs,
        breakOnSigint: true,
      });

      // Timeout race
      const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`Script execution timed out after ${timeoutMs / 1000}s`));
        }, timeoutMs);
      });

      // Abort signal race
      const abortPromise = new Promise((_, reject) => {
        abortController.signal.addEventListener('abort', () => {
          reject(new Error('Task was stopped by user'));
        });
      });

      const result = await Promise.race([executePromise, timeoutPromise, abortPromise]);

      clearTimeout(timeoutHandle);

      emitLog('success', 'Task completed successfully');
      db.tasks.updateStatus(taskId, 'completed', result ?? null);
      io.to(`task:${taskId}`).emit('task:status', { taskId, status: 'completed', result });

      return { success: true, result: result ?? null, error: null };
    } catch (err) {
      clearTimeout(timeoutHandle);

      const isStopped = err.message.includes('stopped by user');
      const status = isStopped ? 'stopped' : 'failed';

      emitLog(isStopped ? 'warn' : 'error', `Task ${status}: ${err.message}`);
      db.tasks.updateStatus(taskId, status, { error: err.message });
      io.to(`task:${taskId}`).emit('task:status', { taskId, status, error: err.message });

      return { success: false, result: null, error: err.message };
    } finally {
      clearTimeout(timeoutHandle);
      this.running.delete(taskId);

      // Always clean up browser
      if (browserId) {
        try {
          await browserService.closeBrowser(browserId);
        } catch (cleanupErr) {
          console.warn('[ExecutorService] Cleanup error:', cleanupErr.message);
        }
      }
    }
  }

  /**
   * Stop a currently running task by ID.
   * @param {string} taskId
   */
  stop(taskId) {
    const session = this.running.get(taskId);
    if (!session) {
      throw new Error(`Task ${taskId} is not currently running`);
    }
    session.abortController.abort();
    console.log(`[ExecutorService] Abort signal sent to task ${taskId}`);
  }

  /**
   * Returns true if the task is currently executing.
   * @param {string} taskId
   */
  isRunning(taskId) {
    return this.running.has(taskId);
  }

  /**
   * List all currently running task IDs.
   */
  listRunning() {
    return [...this.running.keys()];
  }
}

const executorService = new ExecutorService();
module.exports = executorService;
