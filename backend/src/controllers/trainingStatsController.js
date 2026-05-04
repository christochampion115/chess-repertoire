const { updateBestScore, getBestScore } = require('../models/trainingStatsModel');

async function postTrainingStat(req, res, next) {
  try {
    const { variantKey, score, repertoireId } = req.body;
    if (!variantKey || typeof score !== 'number') {
      return res.status(400).json({ error: 'variantKey and score are required' });
    }
    await updateBestScore(req.user.id, repertoireId || null, variantKey, Math.floor(score));
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

async function getTrainingStat(req, res, next) {
  try {
    const { variantKey } = req.query;
    if (!variantKey) {
      return res.status(400).json({ error: 'variantKey is required' });
    }
    const best = await getBestScore(req.user.id, variantKey);
    res.json({ bestSurvivalScore: best });
  } catch (error) {
    next(error);
  }
}

module.exports = { postTrainingStat, getTrainingStat };
