const sqlite3 = require('sqlite3').verbose();
const { dbPath } = require('./config');
const fs = require('fs');
const path = require('path');

let db;

function openDb() {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    const instance = new sqlite3.Database(dbPath, (err) => {
      if (err) return reject(err);
      resolve(instance);
    });
  });
}

function run(dbInstance, sql, params = []) {
  return new Promise((resolve, reject) => {
    dbInstance.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(dbInstance, sql, params = []) {
  return new Promise((resolve, reject) => {
    dbInstance.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(dbInstance, sql, params = []) {
  return new Promise((resolve, reject) => {
    dbInstance.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function initDb() {
  db = await openDb();
  await run(db, `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    passwordHash TEXT NOT NULL,
    createdAt TEXT NOT NULL
  )`);

  await run(db, `CREATE TABLE IF NOT EXISTS repertoires (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    fen TEXT NOT NULL,
    san TEXT NOT NULL,
    comment TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
  )`);

  const repertoireColumns = await all(db, 'PRAGMA table_info(repertoires)');
  if (!repertoireColumns.some((column) => column.name === 'payload')) {
    await run(db, 'ALTER TABLE repertoires ADD COLUMN payload TEXT');
  }

  await run(db, `CREATE TABLE IF NOT EXISTS revoked_tokens (
    token TEXT PRIMARY KEY NOT NULL,
    expiresAt TEXT NOT NULL
  )`);

  // Nettoyage des tokens expirés au démarrage
  await run(db, 'DELETE FROM revoked_tokens WHERE expiresAt < ?', [new Date().toISOString()]);
}

function getDb() {
  if (!db) {
    throw new Error('Database is not initialized');
  }
  return db;
}

module.exports = {
  initDb,
  getDb,
  run,
  get,
  all
};
