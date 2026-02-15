import { createClient } from '@libsql/client';

let db;

export function getDb() {
  if (!db) {
    db = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return db;
}

export async function initDb() {
  const client = getDb();

  await client.batch(
    [
      {
        sql: `CREATE TABLE IF NOT EXISTS sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          token TEXT NOT NULL UNIQUE,
          ip TEXT,
          user_agent TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          expires_at TEXT NOT NULL
        )`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS activity_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          action TEXT NOT NULL,
          ip TEXT,
          user_agent TEXT,
          success INTEGER NOT NULL DEFAULT 0,
          details TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS used_codes (
          code TEXT NOT NULL,
          used_at TEXT DEFAULT (datetime('now'))
        )`,
      },
      { sql: `CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)` },
      { sql: `CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)` },
      { sql: `CREATE INDEX IF NOT EXISTS idx_used_codes_used_at ON used_codes(used_at)` },
    ],
    'write'
  );

  console.log('✓ Database tables initialized');
}

// --- Sessions ---

export async function createSession(tokenHash, ip, userAgent, expiresAt) {
  const client = getDb();
  await client.execute({
    sql: `INSERT INTO sessions (token, ip, user_agent, expires_at) VALUES (?, ?, ?, ?)`,
    args: [tokenHash, ip, userAgent, expiresAt],
  });
}

export async function findSession(tokenHash) {
  const client = getDb();
  const result = await client.execute({
    sql: `SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')`,
    args: [tokenHash],
  });
  return result.rows[0] || null;
}

export async function deleteExpiredSessions() {
  const client = getDb();
  const result = await client.execute(
    `DELETE FROM sessions WHERE expires_at <= datetime('now')`
  );
  return result.rowsAffected;
}

// --- Activity Log ---

export async function logActivity(action, ip, userAgent, success, details = null) {
  const client = getDb();
  await client.execute({
    sql: `INSERT INTO activity_log (action, ip, user_agent, success, details) VALUES (?, ?, ?, ?, ?)`,
    args: [action, ip, userAgent, success ? 1 : 0, details],
  });
}

export async function getRecentActivity(limit = 50) {
  const client = getDb();
  const result = await client.execute({
    sql: `SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?`,
    args: [limit],
  });
  return result.rows;
}

// --- Used Codes ---

export async function isCodeUsed(code) {
  const client = getDb();
  const result = await client.execute({
    sql: `SELECT code FROM used_codes WHERE code = ? AND used_at > datetime('now', '-2 minutes')`,
    args: [code],
  });
  return result.rows.length > 0;
}

export async function markCodeUsed(code) {
  const client = getDb();
  await client.execute({
    sql: `INSERT INTO used_codes (code) VALUES (?)`,
    args: [code],
  });
}

export async function cleanupUsedCodes() {
  const client = getDb();
  await client.execute(
    `DELETE FROM used_codes WHERE used_at <= datetime('now', '-5 minutes')`
  );
}
