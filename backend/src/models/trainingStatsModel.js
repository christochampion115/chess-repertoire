const { getDb } = require('../db');

async function updateBestScore(userId, repertoireId, variantKey, score) {
  const db = getDb();
  await db.query(
    `INSERT INTO training_stats ("userId", "repertoireId", "variantKey", "bestSurvivalScore", "updatedAt")
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT ("userId", "variantKey") DO UPDATE
       SET "bestSurvivalScore" = GREATEST(training_stats."bestSurvivalScore", EXCLUDED."bestSurvivalScore"),
           "updatedAt" = NOW()`,
    [userId, repertoireId || null, variantKey, score]
  );
}

async function getBestScore(userId, variantKey) {
  const db = getDb();
  const res = await db.query(
    `SELECT "bestSurvivalScore" FROM training_stats WHERE "userId" = $1 AND "variantKey" = $2`,
    [userId, variantKey]
  );
  return res.rows[0]?.bestSurvivalScore ?? 0;
}

module.exports = { updateBestScore, getBestScore };
