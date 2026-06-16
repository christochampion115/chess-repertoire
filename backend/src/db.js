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
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
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

module.exports = {
  initDb,
  getDb,
  run,
  get,
  all,
  withTransaction,
};
