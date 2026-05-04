const { Pool } = require('pg');

let pool;

// Converts SQLite-style ? placeholders to PostgreSQL $1, $2, ... style
function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function initDb() {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  // Test connection and log
  const testRes = await pool.query('SELECT NOW()');
  console.log('DB OK :', testRes.rows);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      "passwordHash" TEXT NOT NULL,
      "createdAt" TEXT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS repertoires (
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
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS revoked_tokens (
      token TEXT PRIMARY KEY NOT NULL,
      "expiresAt" TEXT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS training_stats (
      id SERIAL PRIMARY KEY,
      "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      "repertoireId" INTEGER REFERENCES repertoires(id) ON DELETE CASCADE,
      "variantKey" TEXT NOT NULL,
      "bestSurvivalScore" INTEGER DEFAULT 0,
      "updatedAt" TIMESTAMP DEFAULT NOW(),
      UNIQUE("userId", "variantKey")
    )
  `);

  // Nettoyage des tokens expirés au démarrage
  await pool.query('DELETE FROM revoked_tokens WHERE "expiresAt" < $1', [new Date().toISOString()]);
}

function getDb() {
  if (!pool) {
    throw new Error('Database is not initialized');
  }
  return pool;
}

async function run(dbInstance, sql, params = []) {
  const pgSql = convertPlaceholders(sql);
  const res = await pool.query(pgSql, params);
  return { lastID: res.rows[0]?.id, changes: res.rowCount };
}

async function get(dbInstance, sql, params = []) {
  const pgSql = convertPlaceholders(sql);
  const res = await pool.query(pgSql, params);
  return res.rows[0] || null;
}

async function all(dbInstance, sql, params = []) {
  const pgSql = convertPlaceholders(sql);
  const res = await pool.query(pgSql, params);
  return res.rows;
}

// Runs a function inside a pg transaction using a dedicated client
async function withTransaction(fn) {
  const client = await pool.connect();
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

module.exports = {
  initDb,
  getDb,
  run,
  get,
  all,
  withTransaction
};
