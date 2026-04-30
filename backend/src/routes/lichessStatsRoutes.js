const express = require('express');
const { fetchLichessStats } = require('../services/lichessStatsService');

const router = express.Router();
const ALLOWED_DATABASES = new Set(['lichess', 'masters']);

router.get('/stats', async (req, res, next) => {
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
    console.error('[lichess proxy] fetch error', error);
    const statusCode = error.status || 502;
    res.status(statusCode).json({ error: error.message || 'Erreur de proxy Lichess' });
  }
});

module.exports = router;
