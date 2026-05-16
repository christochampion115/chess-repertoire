const { getDb } = require('../db');

async function getSettings(userId) {
  const db = getDb();
  const res = await db.query(
    'SELECT settings FROM user_settings WHERE "userId" = $1',
    [userId]
  );
  if (!res.rows[0]) return {};
  try {
    return JSON.parse(res.rows[0].settings);
  } catch {
    return {};
  }
}

async function upsertSettings(userId, settings) {
  const db = getDb();
  const now = new Date().toISOString();
  await db.query(
    `INSERT INTO user_settings ("userId", settings, "updatedAt")
     VALUES ($1, $2, $3)
     ON CONFLICT ("userId") DO UPDATE
       SET settings = $2, "updatedAt" = $3`,
    [userId, JSON.stringify(settings), now]
  );
  return settings;
}

module.exports = { getSettings, upsertSettings };
