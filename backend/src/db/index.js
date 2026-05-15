'use strict';

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/stealth.db');

// Ensure data directory exists
const fs = require('fs');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    // Enable WAL mode for better concurrent read performance
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');
  }
  return db;
}

// ─── Schema ───────────────────────────────────────────────────────────────────
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS scripts (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    content     TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Version history: every save creates a new row here
  CREATE TABLE IF NOT EXISTS script_versions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    script_id  TEXT NOT NULL,
    content    TEXT NOT NULL DEFAULT '',
    label      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_script_versions_script_id ON script_versions(script_id);
  CREATE INDEX IF NOT EXISTS idx_script_versions_created_at ON script_versions(created_at);

  CREATE TABLE IF NOT EXISTS tasks (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    script_id       TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending','running','completed','failed','stopped')),
    cron_expression TEXT,
    last_run        TEXT,
    next_run        TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    result          TEXT,
    FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS logs (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id   TEXT NOT NULL,
    level     TEXT NOT NULL DEFAULT 'info'
                  CHECK(level IN ('info','warn','error','success','debug')),
    message   TEXT NOT NULL,
    line      INTEGER,
    source    TEXT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_status      ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_script_id   ON tasks(script_id);
  CREATE INDEX IF NOT EXISTS idx_logs_task_id      ON logs(task_id);
  CREATE INDEX IF NOT EXISTS idx_logs_timestamp    ON logs(timestamp);
  CREATE INDEX IF NOT EXISTS idx_logs_level        ON logs(level);
  CREATE INDEX IF NOT EXISTS idx_logs_source       ON logs(source);
`;

// ─── Migrations ───────────────────────────────────────────────────────────────
// Add new columns to existing tables without data loss.
const MIGRATIONS = [
  // v1 – add structured log columns (line, source) if they don't exist
  `ALTER TABLE logs ADD COLUMN line INTEGER`,
  `ALTER TABLE logs ADD COLUMN source TEXT`,
];

function runMigrations(database) {
  for (const sql of MIGRATIONS) {
    try {
      database.prepare(sql).run();
    } catch (e) {
      // Column already exists — safe to ignore
      if (!e.message.includes('duplicate column')) {
        // Only re-throw unexpected errors
      }
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
function initialize() {
  const database = getDb();
  // Execute each statement individually
  const statements = SCHEMA
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const runAll = database.transaction(() => {
    for (const stmt of statements) {
      database.prepare(stmt).run();
    }
  });
  runAll();

  // Run migrations for existing databases
  runMigrations(database);
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

// ─── Scripts ─────────────────────────────────────────────────────────────────
const scripts = {
  findAll() {
    return getDb()
      .prepare('SELECT * FROM scripts ORDER BY created_at DESC')
      .all();
  },

  findById(id) {
    return getDb()
      .prepare('SELECT * FROM scripts WHERE id = ?')
      .get(id);
  },

  create({ id, name, content, description }) {
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO scripts (id, name, content, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, name, content || '', description || '', now, now);
    return scripts.findById(id);
  },

  update(id, { name, content, description }) {
    const now = new Date().toISOString();
    const fields = [];
    const values = [];

    if (name !== undefined)        { fields.push('name = ?');        values.push(name); }
    if (content !== undefined)     { fields.push('content = ?');     values.push(content); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);

    getDb()
      .prepare(`UPDATE scripts SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values);
    return scripts.findById(id);
  },

  delete(id) {
    return getDb()
      .prepare('DELETE FROM scripts WHERE id = ?')
      .run(id);
  },
};

// ─── Script Versions ──────────────────────────────────────────────────────────
const scriptVersions = {
  /**
   * List all versions for a script (newest first).
   * Returns lightweight rows (no content) for the list view.
   */
  list(scriptId) {
    return getDb()
      .prepare(
        `SELECT id, script_id, label, created_at
         FROM script_versions
         WHERE script_id = ?
         ORDER BY created_at DESC`
      )
      .all(scriptId);
  },

  /**
   * Get a single version including its content.
   */
  get(id) {
    return getDb()
      .prepare('SELECT * FROM script_versions WHERE id = ?')
      .get(id);
  },

  /**
   * Save a new version snapshot.
   */
  save(scriptId, content, label = '') {
    const now = new Date().toISOString();
    const result = getDb()
      .prepare(
        `INSERT INTO script_versions (script_id, content, label, created_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(scriptId, content, label, now);
    return scriptVersions.get(result.lastInsertRowid);
  },

  /**
   * Delete a single version.
   */
  delete(id) {
    return getDb()
      .prepare('DELETE FROM script_versions WHERE id = ?')
      .run(id);
  },

  /**
   * Keep only the N most recent versions for a script (prune old ones).
   */
  prune(scriptId, keepCount = 20) {
    return getDb()
      .prepare(
        `DELETE FROM script_versions
         WHERE script_id = ? AND id NOT IN (
           SELECT id FROM script_versions
           WHERE script_id = ?
           ORDER BY created_at DESC
           LIMIT ?
         )`
      )
      .run(scriptId, scriptId, keepCount);
  },
};

// ─── Tasks ───────────────────────────────────────────────────────────────────
const tasks = {
  findAll() {
    return getDb()
      .prepare(
        `SELECT t.*, s.name AS script_name
         FROM tasks t
         LEFT JOIN scripts s ON t.script_id = s.id
         ORDER BY t.created_at DESC`
      )
      .all();
  },

  findById(id) {
    return getDb()
      .prepare(
        `SELECT t.*, s.name AS script_name, s.content AS script_content
         FROM tasks t
         LEFT JOIN scripts s ON t.script_id = s.id
         WHERE t.id = ?`
      )
      .get(id);
  },

  findByStatus(status) {
    return getDb()
      .prepare('SELECT * FROM tasks WHERE status = ?')
      .all(status);
  },

  create({ id, name, script_id, cron_expression }) {
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO tasks (id, name, script_id, status, cron_expression, created_at)
         VALUES (?, ?, ?, 'pending', ?, ?)`
      )
      .run(id, name, script_id, cron_expression || null, now);
    return tasks.findById(id);
  },

  updateStatus(id, status, result = null) {
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `UPDATE tasks SET status = ?, last_run = ?, result = ? WHERE id = ?`
      )
      .run(status, now, result !== null ? JSON.stringify(result) : null, id);
    return tasks.findById(id);
  },

  setNextRun(id, nextRun) {
    getDb()
      .prepare('UPDATE tasks SET next_run = ? WHERE id = ?')
      .run(nextRun ? nextRun.toISOString() : null, id);
  },

  delete(id) {
    return getDb()
      .prepare('DELETE FROM tasks WHERE id = ?')
      .run(id);
  },
};

// ─── Logs ─────────────────────────────────────────────────────────────────────
const logsDb = {
  /**
   * Paginated log query with optional filters.
   * Supports: task_id, level, source, date (YYYY-MM-DD), search (message LIKE)
   */
  findAll({ page = 1, limit = 50, task_id, level, source, date, search } = {}) {
    const offset = (page - 1) * limit;
    const database = getDb();

    // Build WHERE clause dynamically
    const conditions = [];
    const params     = [];

    if (task_id) { conditions.push('task_id = ?'); params.push(task_id); }
    if (level && level !== 'all') { conditions.push('level = ?'); params.push(level); }
    if (source) { conditions.push('source = ?'); params.push(source); }
    if (date)   { conditions.push("date(timestamp) = ?"); params.push(date); }
    if (search) { conditions.push('message LIKE ?'); params.push(`%${search}%`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { total } = database
      .prepare(`SELECT COUNT(*) AS total FROM logs ${where}`)
      .get(...params);

    const rows = database
      .prepare(`SELECT * FROM logs ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset);

    return { total, page, limit, rows };
  },

  findByTaskId(taskId) {
    return getDb()
      .prepare('SELECT * FROM logs WHERE task_id = ? ORDER BY timestamp ASC')
      .all(taskId);
  },

  /**
   * Insert a structured log entry.
   * @param {{ task_id, level?, message, line?, source? }} entry
   */
  insert({ task_id, level = 'info', message, line = null, source = null }) {
    const now = new Date().toISOString();
    return getDb()
      .prepare(
        'INSERT INTO logs (task_id, level, message, line, source, timestamp) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(task_id, level, message, line, source, now);
  },

  clearAll() {
    return getDb().prepare('DELETE FROM logs').run();
  },

  clearByTaskId(taskId) {
    return getDb().prepare('DELETE FROM logs WHERE task_id = ?').run(taskId);
  },
};

module.exports = {
  initialize,
  close,
  getDb,
  scripts,
  scriptVersions,
  tasks,
  logs: logsDb,
};
