'use strict';

const express = require('express');
const { getChesscomPlayerStats } = require('../services/chesscomPlayerStatsService');

const router = express.Router();

const ALLOWED_COLORS     = new Set(['white', 'black']);
const ALLOWED_TIMECLASSES = new Set(['all', 'bullet', 'blitz', 'rapid', 'daily']);

router.get('/stats', async (req, res) => {
  const fen      = typeof req.query.fen      === 'string' ? req.query.fen.trim()      : '';
  const username = typeof req.query.username === 'string' ? req.query.username.trim() : '';
  const color    = typeof req.query.color    === 'string' ? req.query.color.trim()    : '';

  if (!fen)      return res.status(400).json({ error: 'Paramètre fen requis' });
  if (!username) return res.status(400).json({ error: 'Paramètre username requis' });
  if (!ALLOWED_COLORS.has(color))
    return res.status(400).json({ error: 'Paramètre color invalide (white|black)' });

  const timeClass = ALLOWED_TIMECLASSES.has(req.query.timeClass) ? req.query.timeClass : 'all';
  const dateFrom  = typeof req.query.dateFrom === 'string' ? req.query.dateFrom.trim() : '';
  const dateTo    = typeof req.query.dateTo   === 'string' ? req.query.dateTo.trim()   : '';

  const eloMinRaw = Number.parseInt(req.query.eloMin, 10);
  const eloMaxRaw = Number.parseInt(req.query.eloMax, 10);
  const playerEloMin = Number.isFinite(eloMinRaw) ? Math.max(0,    Math.min(3000, eloMinRaw)) : 0;
  const playerEloMax = Number.isFinite(eloMaxRaw) ? Math.max(0,    Math.min(3000, eloMaxRaw)) : 3000;

  try {
    const stats = await getChesscomPlayerStats(fen, {
      playerUsername:  username,
      playerColor:     color,
      playerTimeClass: timeClass,
      playerDateFrom:  dateFrom,
      playerDateTo:    dateTo,
      playerEloMin,
      playerEloMax
    });
    res.json(stats);
  } catch (error) {
    console.error('[chesscom proxy] fetch error', error);
    const statusCode = error.status || 502;
    res.status(statusCode).json({ error: error.message || 'Erreur Chess.com proxy' });
  }
});

module.exports = router;
