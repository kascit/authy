import { createClient } from "@libsql/client";

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
      // --- Users ---
      {
        sql: `CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE,
          name TEXT,
          avatar_url TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )`,
        args: [],
      },
      // --- OAuth Accounts ---
      {
        sql: `CREATE TABLE IF NOT EXISTS accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id),
          provider TEXT NOT NULL,
          provider_account_id TEXT NOT NULL,
          access_token TEXT,
          refresh_token TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(provider, provider_account_id)
        )`,
        args: [],
      },
      // --- Sessions ---
      {
        sql: `CREATE TABLE IF NOT EXISTS sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          token TEXT NOT NULL UNIQUE,
          user_id INTEGER REFERENCES users(id),
          ip TEXT,
          user_agent TEXT,
          admin_until TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          expires_at TEXT NOT NULL
        )`,
        args: [],
      },
      // --- Activity Log ---
      {
        sql: `CREATE TABLE IF NOT EXISTS activity_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          action TEXT NOT NULL,
          user_id INTEGER,
          ip TEXT,
          user_agent TEXT,
          success INTEGER NOT NULL DEFAULT 0,
          details TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )`,
        args: [],
      },
      // --- Used Codes (replay protection) ---
      {
        sql: `CREATE TABLE IF NOT EXISTS used_codes (
          code TEXT NOT NULL,
          used_at TEXT DEFAULT (datetime('now'))
        )`,
        args: [],
      },
      // --- Indexes ---
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
        args: [],
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_accounts_provider ON accounts(provider, provider_account_id)`,
        args: [],
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id)`,
        args: [],
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)`,
        args: [],
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
        args: [],
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`,
        args: [],
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_used_codes_used_at ON used_codes(used_at)`,
        args: [],
      },
      // --- Credits ---
      {
        sql: `CREATE TABLE IF NOT EXISTS credits (
          user_id INTEGER PRIMARY KEY REFERENCES users(id),
          balance INTEGER NOT NULL DEFAULT 100,
          period_start TEXT NOT NULL DEFAULT (datetime('now', 'start of month')),
          updated_at TEXT DEFAULT (datetime('now'))
        )`,
        args: [],
      },
    ],
    "write",
  );

  // Migration: add columns to existing tables if missing
  try {
    const sessionCols = await client.execute("PRAGMA table_info(sessions)");
    const hasUserId = sessionCols.rows.some((r) => r.name === "user_id");
    if (!hasUserId) {
      await client.execute("ALTER TABLE sessions ADD COLUMN user_id INTEGER");
      await client.execute("ALTER TABLE sessions ADD COLUMN admin_until TEXT");
      // Clear old sessions without user_id
      await client.execute("DELETE FROM sessions");
      console.log("  Migrated sessions table (added user_id, admin_until)");
    }

    const activityCols = await client.execute(
      "PRAGMA table_info(activity_log)",
    );
    const hasActivityUserId = activityCols.rows.some(
      (r) => r.name === "user_id",
    );
    if (!hasActivityUserId) {
      await client.execute(
        "ALTER TABLE activity_log ADD COLUMN user_id INTEGER",
      );
      console.log("  Migrated activity_log table (added user_id)");
    }
  } catch (err) {
    // Migration errors are non-fatal for fresh installs
    console.warn("  Migration check:", err.message);
  }

  console.log("✓ Database tables initialized");
}

// ==================== Users ====================

export async function findUserByEmail(email) {
  const client = getDb();
  const result = await client.execute({
    sql: `SELECT * FROM users WHERE email = ?`,
    args: [email],
  });
  return result.rows[0] || null;
}

export async function findUserById(id) {
  const client = getDb();
  const result = await client.execute({
    sql: `SELECT * FROM users WHERE id = ?`,
    args: [id],
  });
  return result.rows[0] || null;
}

export async function createUser(email, name, avatarUrl) {
  const client = getDb();
  const result = await client.execute({
    sql: `INSERT INTO users (email, name, avatar_url) VALUES (?, ?, ?)`,
    args: [email, name, avatarUrl],
  });
  return Number(result.lastInsertRowid);
}

export async function updateUser(id, { name, avatarUrl }) {
  const client = getDb();
  await client.execute({
    sql: `UPDATE users SET name = ?, avatar_url = ?, updated_at = datetime('now') WHERE id = ?`,
    args: [name, avatarUrl, id],
  });
}

// ==================== Accounts (OAuth) ====================

export async function findAccountByProvider(provider, providerAccountId) {
  const client = getDb();
  const result = await client.execute({
    sql: `SELECT * FROM accounts WHERE provider = ? AND provider_account_id = ?`,
    args: [provider, providerAccountId],
  });
  return result.rows[0] || null;
}

export async function linkAccount(
  userId,
  provider,
  providerAccountId,
  accessToken,
  refreshToken,
) {
  const client = getDb();
  await client.execute({
    sql: `INSERT OR IGNORE INTO accounts (user_id, provider, provider_account_id, access_token, refresh_token) VALUES (?, ?, ?, ?, ?)`,
    args: [userId, provider, providerAccountId, accessToken, refreshToken],
  });
}

export async function getUserAccounts(userId) {
  const client = getDb();
  const result = await client.execute({
    sql: `SELECT provider, provider_account_id, created_at FROM accounts WHERE user_id = ?`,
    args: [userId],
  });
  return result.rows;
}

export async function unlinkAccount(userId, provider) {
  const client = getDb();
  const result = await client.execute({
    sql: `DELETE FROM accounts WHERE user_id = ? AND provider = ?`,
    args: [userId, provider],
  });
  return result.rowsAffected;
}

// ==================== Sessions ====================

export async function createSession(
  tokenHash,
  userId,
  ip,
  userAgent,
  expiresAt,
) {
  const client = getDb();
  await client.execute({
    sql: `INSERT INTO sessions (token, user_id, ip, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)`,
    args: [tokenHash, userId, ip, userAgent, expiresAt],
  });
}

export async function findSessionWithUser(tokenHash) {
  const client = getDb();
  const result = await client.execute({
    sql: `SELECT s.*, u.id as uid, u.email, u.name, u.avatar_url
          FROM sessions s
          LEFT JOIN users u ON s.user_id = u.id
          WHERE s.token = ? AND s.expires_at > datetime('now')`,
    args: [tokenHash],
  });
  return result.rows[0] || null;
}

export async function setAdminUntil(tokenHash, adminUntil) {
  const client = getDb();
  await client.execute({
    sql: `UPDATE sessions SET admin_until = ? WHERE token = ?`,
    args: [adminUntil, tokenHash],
  });
}

export async function destroySession(tokenHash) {
  const client = getDb();
  await client.execute({
    sql: `DELETE FROM sessions WHERE token = ?`,
    args: [tokenHash],
  });
}

export async function deleteExpiredSessions() {
  const client = getDb();
  const result = await client.execute(
    `DELETE FROM sessions WHERE expires_at <= datetime('now')`,
  );
  return result.rowsAffected;
}

export async function getActiveSessionSummary() {
  const client = getDb();
  const result = await client.execute({
    sql: `SELECT
            COUNT(DISTINCT CASE
              WHEN user_id IS NOT NULL AND expires_at > datetime('now')
              THEN user_id
            END) AS logged_in_users,
            COUNT(DISTINCT CASE
              WHEN user_id IS NOT NULL
               AND expires_at > datetime('now')
               AND admin_until IS NOT NULL
               AND admin_until > datetime('now')
              THEN user_id
            END) AS active_admins
          FROM sessions`,
    args: [],
  });

  const row = result.rows[0] || {};
  return {
    loggedInUsers: Number(row.logged_in_users || 0),
    activeAdmins: Number(row.active_admins || 0),
  };
}

// ==================== Activity Log ====================

export async function logActivity(
  action,
  ip,
  userAgent,
  success,
  details = null,
  userId = null,
) {
  const client = getDb();
  await client.execute({
    sql: `INSERT INTO activity_log (action, user_id, ip, user_agent, success, details) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [action, userId, ip, userAgent, success ? 1 : 0, details],
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

// ==================== Used Codes ====================

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
    `DELETE FROM used_codes WHERE used_at <= datetime('now', '-5 minutes')`,
  );
}

// ==================== Credits ====================

/**
 * Ensure a credits row exists for a user, creating one with 100 if missing.
 */
export async function initCreditsForUser(userId) {
  const client = getDb();
  await client.execute({
    sql: `INSERT OR IGNORE INTO credits (user_id, balance, period_start)
          VALUES (?, 100, datetime('now', 'start of month'))`,
    args: [userId],
  });
}

/**
 * Get credits for a user, auto-resetting if a new month has started.
 * Returns { balance, periodStart, periodEnd }.
 */
export async function getCredits(userId) {
  const client = getDb();
  await initCreditsForUser(userId);

  // Check if we need to reset (new month)
  const row = await client.execute({
    sql: `SELECT balance, period_start FROM credits WHERE user_id = ?`,
    args: [userId],
  });
  const credit = row.rows[0];
  if (!credit) return { balance: 100, periodStart: null, periodEnd: null };

  const periodStart = new Date(credit.period_start + "Z");
  const currentMonthStart = new Date();
  currentMonthStart.setUTCDate(1);
  currentMonthStart.setUTCHours(0, 0, 0, 0);

  // If the stored period is before the current month, reset
  if (periodStart < currentMonthStart) {
    await client.execute({
      sql: `UPDATE credits SET balance = 100, period_start = datetime('now', 'start of month'), updated_at = datetime('now') WHERE user_id = ?`,
      args: [userId],
    });
    const nextMonth = new Date(currentMonthStart);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    return {
      balance: 100,
      periodStart: currentMonthStart.toISOString(),
      periodEnd: nextMonth.toISOString(),
    };
  }

  const periodEnd = new Date(periodStart);
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

  return {
    balance: Number(credit.balance),
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  };
}

/**
 * Atomically deduct credits. Returns { success, balance } or { success: false, balance, error }.
 */
export async function useCredits(userId, service, amount = 1, description = null) {
  const client = getDb();
  await initCreditsForUser(userId);

  // First check for month reset
  await getCredits(userId);

  // Atomic deduction — only succeeds if balance >= amount
  const result = await client.execute({
    sql: `UPDATE credits SET balance = balance - ?, updated_at = datetime('now')
          WHERE user_id = ? AND balance >= ?`,
    args: [amount, userId, amount],
  });

  if (result.rowsAffected === 0) {
    // Not enough credits
    const current = await getCredits(userId);
    return { success: false, balance: current.balance, error: "Insufficient credits" };
  }

  // Log the usage
  await client.execute({
    sql: `INSERT INTO activity_log (action, user_id, success, details)
          VALUES ('credit_use', ?, 1, ?)`,
    args: [userId, JSON.stringify({ service, amount, description })],
  });

  const current = await getCredits(userId);
  return { success: true, balance: current.balance };
}

/**
 * Refund credits (for failed operations).
 */
export async function refundCredits(userId, service, amount = 1) {
  const client = getDb();
  await client.execute({
    sql: `UPDATE credits SET balance = balance + ?, updated_at = datetime('now') WHERE user_id = ?`,
    args: [amount, userId],
  });

  await client.execute({
    sql: `INSERT INTO activity_log (action, user_id, success, details)
          VALUES ('credit_refund', ?, 1, ?)`,
    args: [userId, JSON.stringify({ service, amount })],
  });

  const current = await getCredits(userId);
  return { success: true, balance: current.balance };
}
