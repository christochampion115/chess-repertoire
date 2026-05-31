'use strict';

const express = require('express');
const { getChesscomPlayerStats, getChesscomPlayerStatsBatch, getChesscomReport } = require('../services/chesscomPlayerStatsService');

const router = express.Router();

const ALLOWED_COLORS      = new Set(['white', 'black']);
const ALLOWED_TIMECLASSES = new Set(['all', 'bullet', 'blitz', 'rapid', 'daily', 'classical']);
const BATCH_MAX_FENS      = 500;

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

// SSE : progrès en temps réel pendant le chargement des archives Chess.com.
// Mêmes paramètres que GET /stats. Événements :
//   data: {"type":"archive","current":3,"total":15,"gamesInArchive":45}
//   data: {"type":"complete","data":{moves:[],totalGames:500,…}}
//   data: {"type":"error","error":"…"}
router.get('/stats/stream', async (req, res) => {
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
  const playerEloMin = Number.isFinite(eloMinRaw) ? Math.max(0, Math.min(3000, eloMinRaw)) : 0;
  const playerEloMax = Number.isFinite(eloMaxRaw) ? Math.max(0, Math.min(3000, eloMaxRaw)) : 3000;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  let isClosed = false;
  req.on('close', () => { isClosed = true; });

  const safeWrite = (data) => { if (!isClosed) res.write(data); };

  try {
    const stats = await getChesscomPlayerStats(fen, {
      playerUsername:  username,
      playerColor:     color,
      playerTimeClass: timeClass,
      playerDateFrom:  dateFrom,
      playerDateTo:    dateTo,
      playerEloMin,
      playerEloMax
    }, (progress) => {
      safeWrite(`data: ${JSON.stringify({ type: 'archive', ...progress })}\n\n`);
    });
    safeWrite(`data: ${JSON.stringify({ type: 'complete', data: stats })}\n\n`);
  } catch (error) {
    console.error('[chesscom stream] error', error);
    safeWrite(`data: ${JSON.stringify({ type: 'error', error: error.message || 'Erreur Chess.com proxy' })}\n\n`);
  }
  if (!isClosed) res.end();
});

// Batch : reçoit un tableau de FENs, retourne { [fen]: stats } en une seule passe mémoire.
// Les parties doivent être déjà en cache côté backend (appelé après /stats).
router.post('/batchstats', async (req, res) => {
  const { fens, username, color, timeClass, dateFrom, dateTo, eloMin, eloMax } = req.body || {};

  if (!Array.isArray(fens) || fens.length === 0)
    return res.status(400).json({ error: 'fens array requis' });
  if (typeof username !== 'string' || !username.trim())
    return res.status(400).json({ error: 'username requis' });
  if (!ALLOWED_COLORS.has(color))
    return res.status(400).json({ error: 'color invalide (white|black)' });

  const safeUsername  = username.trim();
  const safeTimeClass = ALLOWED_TIMECLASSES.has(timeClass) ? timeClass : 'all';
  const safeDateFrom  = typeof dateFrom === 'string' ? dateFrom.trim() : '';
  const safeDateTo    = typeof dateTo   === 'string' ? dateTo.trim()   : '';
  const safeFens      = fens.slice(0, BATCH_MAX_FENS).filter(f => typeof f === 'string' && f.length > 0);

  const eloMinRaw = Number.parseInt(eloMin, 10);
  const eloMaxRaw = Number.parseInt(eloMax, 10);
  const playerEloMin = Number.isFinite(eloMinRaw) ? Math.max(0, Math.min(3000, eloMinRaw)) : 0;
  const playerEloMax = Number.isFinite(eloMaxRaw) ? Math.max(0, Math.min(3000, eloMaxRaw)) : 3000;

  try {
    const results = await getChesscomPlayerStatsBatch(safeFens, {
      playerUsername:  safeUsername,
      playerColor:     color,
      playerTimeClass: safeTimeClass,
      playerDateFrom:  safeDateFrom,
      playerDateTo:    safeDateTo,
      playerEloMin,
      playerEloMax
    });
    res.json(results);
  } catch (error) {
    console.error('[chesscom batch] error', error);
    res.status(error.status || 502).json({ error: error.message || 'Erreur batch Chess.com' });
  }
});

module.exports = router;

// ── GET /report — Rapport de priorités d'entraînement ────────────────────────
router.get('/report', async (req, res) => {
  const username = typeof req.query.username === 'string' ? req.query.username.trim() : '';
  const color    = typeof req.query.color    === 'string' ? req.query.color.trim()    : '';

  if (!username) return res.status(400).json({ error: 'Paramètre username requis' });
  if (!ALLOWED_COLORS.has(color))
    return res.status(400).json({ error: 'Paramètre color invalide (white|black)' });

  const timeClass  = ALLOWED_TIMECLASSES.has(req.query.timeClass) ? req.query.timeClass : 'all';
  const dateFrom   = typeof req.query.dateFrom === 'string' ? req.query.dateFrom.trim() : '';
  const dateTo     = typeof req.query.dateTo   === 'string' ? req.query.dateTo.trim()   : '';
  const startFen   = typeof req.query.startFen === 'string' ? req.query.startFen.trim() : '';

  const eloMinRaw  = Number.parseInt(req.query.eloMin, 10);
  const eloMaxRaw  = Number.parseInt(req.query.eloMax, 10);
  const playerEloMin = Number.isFinite(eloMinRaw) ? Math.max(0, Math.min(3000, eloMinRaw)) : 0;
  const playerEloMax = Number.isFinite(eloMaxRaw) ? Math.max(0, Math.min(3000, eloMaxRaw)) : 3000;

  const maxDepthRaw = Number.parseInt(req.query.maxDepth, 10);
  const minFreqRaw  = Number.parseInt(req.query.minFreq,  10);
  const maxDepth    = Number.isFinite(maxDepthRaw) ? Math.max(4, Math.min(14, maxDepthRaw)) : 10;
  const minFreq     = Number.isFinite(minFreqRaw)  ? Math.max(2, Math.min(30, minFreqRaw))  : 5;

  try {
    const report = await getChesscomReport(
      {
        playerUsername: username,
        playerColor: color,
        playerTimeClass: timeClass,
        playerDateFrom: dateFrom,
        playerDateTo: dateTo,
        playerEloMin,
        playerEloMax,
        playerStartFen: startFen,
      },
      { maxDepth, minFreq }
    );
    res.json(report);
  } catch (error) {
    console.error('[chesscom report] error', error);
    res.status(error.status || 502).json({ error: error.message || 'Erreur rapport Chess.com' });
  }
});

// SSE : résultat du rapport de priorités d'entraînement (sans progression temps réel).
router.get('/report/stream', async (req, res) => {
  const username = typeof req.query.username === 'string' ? req.query.username.trim() : '';
  const color    = typeof req.query.color    === 'string' ? req.query.color.trim()    : '';

  if (!username) return res.status(400).json({ error: 'Paramètre username requis' });
  if (!ALLOWED_COLORS.has(color))
    return res.status(400).json({ error: 'Paramètre color invalide (white|black)' });

  const timeClass  = ALLOWED_TIMECLASSES.has(req.query.timeClass) ? req.query.timeClass : 'all';
  const dateFrom   = typeof req.query.dateFrom === 'string' ? req.query.dateFrom.trim() : '';
  const dateTo     = typeof req.query.dateTo   === 'string' ? req.query.dateTo.trim()   : '';
  const startFen   = typeof req.query.startFen === 'string' ? req.query.startFen.trim() : '';

  const eloMinRaw  = Number.parseInt(req.query.eloMin, 10);
  const eloMaxRaw  = Number.parseInt(req.query.eloMax, 10);
  const playerEloMin = Number.isFinite(eloMinRaw) ? Math.max(0, Math.min(3000, eloMinRaw)) : 0;
  const playerEloMax = Number.isFinite(eloMaxRaw) ? Math.max(0, Math.min(3000, eloMaxRaw)) : 3000;

  const maxDepthRaw = Number.parseInt(req.query.maxDepth, 10);
  const minFreqRaw  = Number.parseInt(req.query.minFreq,  10);
  const maxDepth    = Number.isFinite(maxDepthRaw) ? Math.max(4, Math.min(14, maxDepthRaw)) : 10;
  const minFreq     = Number.isFinite(minFreqRaw)  ? Math.max(2, Math.min(30, minFreqRaw))  : 5;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  let isClosed = false;
  req.on('close', () => { isClosed = true; });

  const safeWrite = (data) => { if (!isClosed) res.write(data); };

  try {
    const report = await getChesscomReport(
      {
        playerUsername: username,
        playerColor: color,
        playerTimeClass: timeClass,
        playerDateFrom: dateFrom,
        playerDateTo: dateTo,
        playerEloMin,
        playerEloMax,
        playerStartFen: startFen,
      },
      { maxDepth, minFreq }
    );
    safeWrite(`data: ${JSON.stringify({ type: 'complete', data: report })}\n\n`);
  } catch (error) {
    console.error('[chesscom report stream] error', error);
    safeWrite(`data: ${JSON.stringify({ type: 'error', error: error.message || 'Erreur rapport Chess.com' })}\n\n`);
  }
  if (!isClosed) res.end();
});

module.exports = router;
