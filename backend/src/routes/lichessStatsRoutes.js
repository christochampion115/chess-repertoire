const express = require('express');
const { fetchLichessStats } = require('../services/lichessStatsService');
const { statsLimiter } = require('../middleware/rateLimiters');
const { handleError } = require('../utils/errorHandler');

const router = express.Router();
const ALLOWED_DATABASES = new Set(['lichess', 'masters']);

router.get('/stats', statsLimiter, async (req, res, next) => {
  const fen = typeof req.query.fen === 'string' ? req.query.fen.trim() : '';
  const ratings = typeof req.query.ratings === 'string' ? req.query.ratings : undefined;
  const database = typeof req.query.database === 'string' ? req.query.database : 'lichess';
  if (!fen) {
    return res.status(400).json({ error: 'Paramètre fen requis' });
  }
  if (!ALLOWED_DATABASES.has(database)) {
    return res.status(400).json({ error: 'Paramètre database invalide' });
  }

  try {
    const stats = await fetchLichessStats(fen, ratings, database);
    res.json(stats);
  } catch (error) {
    handleError(res, error, 'Erreur de proxy Lichess');
  }
});

module.exports = router;
