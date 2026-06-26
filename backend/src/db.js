const path = require('path');
const fs = require('fs');

// ─── Detection ─────────────────────────────────────────────────────────────
const USE_PG = !!process.env.DATABASE_URL;

let db; // Pool (PG) or Database (SQLite)

// ─── PostgreSQL ─────────────────────────────────────────────────────────────
async function initPg() {
  const { Pool } = require('pg');
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await db.query('SELECT NOW()');
  console.log('DB OK (PostgreSQL)');

  for (const ddl of PG_DDLS) {
    await db.query(ddl);
  }

  await db.query('DELETE FROM revoked_tokens WHERE "expiresAt" < $1', [new Date().toISOString()]);
}

const PG_DDLS = [
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS repertoires (
    id SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    fen TEXT NOT NULL,
    san TEXT NOT NULL,
    comment TEXT,
    payload TEXT,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS revoked_tokens (
    token TEXT PRIMARY KEY NOT NULL,
    "expiresAt" TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS training_stats (
    id SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "repertoireId" INTEGER REFERENCES repertoires(id) ON DELETE CASCADE,
    "variantKey" TEXT NOT NULL,
    "bestSurvivalScore" INTEGER DEFAULT 0,
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    UNIQUE("userId", "variantKey")
  )`,
  `CREATE TABLE IF NOT EXISTS user_settings (
    "userId" INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    settings TEXT NOT NULL DEFAULT '{}',
    "updatedAt" TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS player_stats_cache (
    id SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "cacheKey" TEXT NOT NULL,
    "fen" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    UNIQUE("userId", "cacheKey", "fen")
  )`,
  `CREATE INDEX IF NOT EXISTS idx_player_stats_cache ON player_stats_cache("userId", "cacheKey", "fen")`,
  `CREATE TABLE IF NOT EXISTS saved_reports (
    id SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    params TEXT NOT NULL,
    data TEXT NOT NULL,
    "createdAt" TIMESTAMP DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_saved_reports_userId ON saved_reports("userId")`,
];

function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// ─── SQLite ─────────────────────────────────────────────────────────────────
async function initSqlite() {
  const Database = require('sqlite3').Database;
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);
  await sqliteRun('PRAGMA journal_mode=WAL');
  console.log('DB OK (SQLite) —', dbPath);

  for (const ddl of SQLITE_DDLS) {
    await sqliteRun(ddl);
  }

  await sqliteRun('DELETE FROM revoked_tokens WHERE "expiresAt" < ?', [new Date().toISOString()]);
}

const { dbPath } = require('./config');

const SQLITE_DDLS = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS repertoires (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    fen TEXT NOT NULL,
    san TEXT NOT NULL,
    comment TEXT,
    payload TEXT,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS revoked_tokens (
    token TEXT PRIMARY KEY NOT NULL,
    "expiresAt" TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS training_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "repertoireId" INTEGER REFERENCES repertoires(id) ON DELETE CASCADE,
    "variantKey" TEXT NOT NULL,
    "bestSurvivalScore" INTEGER DEFAULT 0,
    "updatedAt" TEXT DEFAULT (datetime('now')),
    UNIQUE("userId", "variantKey")
  )`,
  `CREATE TABLE IF NOT EXISTS user_settings (
    "userId" INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    settings TEXT NOT NULL DEFAULT '{}',
    "updatedAt" TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS player_stats_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "cacheKey" TEXT NOT NULL,
    "fen" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" TEXT DEFAULT (datetime('now')),
    UNIQUE("userId", "cacheKey", "fen")
  )`,
  `CREATE INDEX IF NOT EXISTS idx_player_stats_cache ON player_stats_cache("userId", "cacheKey", "fen")`,
  `CREATE TABLE IF NOT EXISTS saved_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    params TEXT NOT NULL,
    data TEXT NOT NULL,
    "createdAt" TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_saved_reports_userId ON saved_reports("userId")`,
];

function sqliteRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function sqliteGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

function sqliteAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function sqliteExec(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Strip RETURNING clause — SQLite < 3.35 doesn't support it, and lastID works anyway
function stripReturning(sql) {
  return sql.replace(/\s+RETURNING\s+\S+/gi, '');
}

async function sqliteTransaction(fn) {
  await sqliteExec('BEGIN');
  try {
    const result = await fn(db);
    await sqliteExec('COMMIT');
    return result;
  } catch (error) {
    await sqliteExec('ROLLBACK');
    throw error;
  }
}

// ─── initDb ─────────────────────────────────────────────────────────────────
async function initDb() {
  if (USE_PG) {
    db = null;
    await initPg();
  } else {
    db = null;
    await initSqlite();
  }
}

// ─── getDb ─────────────────────────────────────────────────────────────────
function getDb() {
  if (!db) throw new Error('Database is not initialized');
  return db;
}

// ─── run ────────────────────────────────────────────────────────────────────
async function run(_dbInstance, sql, params = []) {
  if (USE_PG) {
    const pgSql = convertPlaceholders(sql);
    const res = await db.query(pgSql, params);
    return { lastID: res.rows[0]?.id, changes: res.rowCount };
  }
  return sqliteRun(stripReturning(sql), params);
}

// ─── get ────────────────────────────────────────────────────────────────────
async function get(_dbInstance, sql, params = []) {
  if (USE_PG) {
    const pgSql = convertPlaceholders(sql);
    const res = await db.query(pgSql, params);
    return res.rows[0] || null;
  }
  return sqliteGet(sql, params);
}

// ─── all ────────────────────────────────────────────────────────────────────
async function all(_dbInstance, sql, params = []) {
  if (USE_PG) {
    const pgSql = convertPlaceholders(sql);
    const res = await db.query(pgSql, params);
    return res.rows;
  }
  return sqliteAll(sql, params);
}

// ─── withTransaction ────────────────────────────────────────────────────────
async function withTransaction(fn) {
  if (USE_PG) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  return sqliteTransaction(fn);
}

// ─── Player stats cache helpers ─────────────────────────────────────────────

async function getPlayerStatFromCache(userId, cacheKey, fen) {
  return get(null, `SELECT "data" FROM player_stats_cache WHERE "userId" = ? AND "cacheKey" = ? AND "fen" = ?`, [userId, cacheKey, fen]);
}

async function deletePlayerStatsForUser(userId) {
  await run(null, `DELETE FROM player_stats_cache WHERE "userId" = ?`, [userId]);
}

async function bulkInsertPlayerStats(userId, cacheKey, rows) {
  if (!rows || rows.length === 0) return;
  await withTransaction(async (client) => {
    if (USE_PG) {
      // unnest : une seule requête réseau pour toutes les lignes
      // évite N aller-retours réseau × latence (~50 ms/req sur DB distante)
      await client.query(
        `INSERT INTO player_stats_cache ("userId", "cacheKey", "fen", "data")
         SELECT $1, $2, unnest($3::text[]), unnest($4::text[])
         ON CONFLICT ("userId", "cacheKey", "fen")
         DO UPDATE SET "data" = EXCLUDED."data", "createdAt" = NOW()`,
        [userId, cacheKey, rows.map(r => r.fen), rows.map(r => r.data)]
      );
    } else {
      // SQLite : multi-row INSERT, 200 lignes/statement (800 params < limite 999)
      // réduit les round-trips node→SQLite de N_rows à ceil(N_rows/200)
      const ROWS_PER_STMT = 200;
      for (let i = 0; i < rows.length; i += ROWS_PER_STMT) {
        const chunk = rows.slice(i, i + ROWS_PER_STMT);
        const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(', ');
        const params = chunk.flatMap(({ fen, data }) => [userId, cacheKey, fen, data]);
        await sqliteRun(
          `INSERT OR REPLACE INTO player_stats_cache ("userId", "cacheKey", "fen", "data") VALUES ${placeholders}`,
          params
        );
      }
    }
  });
}

async function getSavedPlayerStatsMeta(userId) {
  return get(null, `SELECT "cacheKey", "createdAt" FROM player_stats_cache WHERE "userId" = ? ORDER BY "createdAt" DESC LIMIT 1`, [userId]);
}

// ─── Saved reports helpers ──────────────────────────────────────────────────

async function saveReport(userId, params, data, maxReports = 3) {
  const res = await run(null,
    `INSERT INTO saved_reports ("userId", params, data) VALUES (?, ?, ?) RETURNING id, "createdAt"`,
    [userId, params, data]
  );
  await run(null,
    `DELETE FROM saved_reports WHERE "userId" = ? AND id NOT IN (
      SELECT id FROM saved_reports WHERE "userId" = ? ORDER BY "createdAt" DESC LIMIT ?
    )`,
    [userId, userId, maxReports]
  );
  return res.lastID
    ? get(null, `SELECT id, "createdAt" FROM saved_reports WHERE id = ?`, [res.lastID])
    : { id: res.id, createdAt: res.createdAt };
}

async function getSavedReportsList(userId) {
  return all(null,
    `SELECT id, params, data, "createdAt" FROM saved_reports WHERE "userId" = ? ORDER BY "createdAt" DESC`,
    [userId]
  );
}

async function getSavedReportById(userId, id) {
  return get(null,
    `SELECT * FROM saved_reports WHERE "userId" = ? AND id = ?`,
    [userId, id]
  );
}

async function deleteSavedReport(userId, id) {
  await run(null,
    `DELETE FROM saved_reports WHERE "userId" = ? AND id = ?`,
    [userId, id]
  );
}

module.exports = {
  initDb,
  getDb,
  run,
  get,
  all,
  withTransaction,
  getPlayerStatFromCache,
  deletePlayerStatsForUser,
  bulkInsertPlayerStats,
  getSavedPlayerStatsMeta,
  saveReport,
  getSavedReportsList,
  getSavedReportById,
  deleteSavedReport,
};
