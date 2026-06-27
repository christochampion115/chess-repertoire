'use strict';

const express = require('express');
const {
  getChesscomPlayerStats,
  getChesscomPlayerStatsBatch,
  getChesscomReport,
  computeAndStoreAllPositions,
  makeGamesCacheKey,
  normalizeFen,
} = require('../services/chesscomPlayerStatsService');
const authMiddleware = require('../middleware/authMiddleware');
const { optionalAuthMiddleware } = require('../middleware/authMiddleware');
const db = require('../db');

const router = express.Router();

const ALLOWED_COLORS      = new Set(['white', 'black']);
const ALLOWED_TIMECLASSES = new Set(['all', 'bullet', 'blitz', 'rapid', 'daily', 'classical']);
const BATCH_MAX_FENS      = 500;

// Helper : parse les filtres communs depuis req.query (sans fen).
function parseFiltersFromQuery(query) {
  const username = typeof query.username === 'string' ? query.username.trim() : '';
  const color    = typeof query.color    === 'string' ? query.color.trim()    : '';
  if (!username)                        return { error: 'Paramètre username requis', status: 400 };
  if (!ALLOWED_COLORS.has(color))       return { error: 'Paramètre color invalide (white|black)', status: 400 };
  const timeClass    = ALLOWED_TIMECLASSES.has(query.timeClass) ? query.timeClass : 'all';
  const dateFrom     = typeof query.dateFrom === 'string' ? query.dateFrom.trim() : '';
  const dateTo       = typeof query.dateTo   === 'string' ? query.dateTo.trim()   : '';
  const eloMinRaw    = Number.parseInt(query.eloMin, 10);
  const eloMaxRaw    = Number.parseInt(query.eloMax, 10);
  const playerEloMin = Number.isFinite(eloMinRaw) ? Math.max(0, Math.min(3000, eloMinRaw)) : 0;
  const playerEloMax = Number.isFinite(eloMaxRaw) ? Math.max(0, Math.min(3000, eloMaxRaw)) : 3000;
  return {
    playerUsername:  username,
    playerColor:     color,
    playerTimeClass: timeClass,
    playerDateFrom:  dateFrom,
    playerDateTo:    dateTo,
    playerEloMin,
    playerEloMax,
  };
}

router.get('/stats', optionalAuthMiddleware, async (req, res) => {
  const fen = typeof req.query.fen === 'string' ? req.query.fen.trim() : '';
  if (!fen) return res.status(400).json({ error: 'Paramètre fen requis' });

  const filters = parseFiltersFromQuery(req.query);
  if (filters.error) return res.status(filters.status).json({ error: filters.error });

  try {
    // DB-first : si l'utilisateur est connecté, chercher en base avant tout
    if (req.user) {
      const cacheKey  = makeGamesCacheKey(filters);
      const fenNorm   = normalizeFen(fen);
      const cached    = await db.getPlayerStatFromCache(req.user.id, cacheKey, fenNorm);
      if (cached) return res.json(JSON.parse(cached.data));
    }
    const stats = await getChesscomPlayerStats(fen, filters);
    res.json(stats);
  } catch (error) {
    console.error('[chesscom proxy] fetch error', error);
    res.status(error.status || 502).json({ error: error.message || 'Erreur Chess.com proxy' });
  }
});

// SSE : progrès en temps réel pendant le chargement des archives Chess.com.
// Mêmes paramètres que GET /stats. Événements :
//   data: {"type":"archive","current":3,"total":15,"gamesInArchive":45}
//   data: {"type":"complete","data":{moves:[],totalGames:500,…}}
//   data: {"type":"error","error":"…"}
router.get('/stats/stream', optionalAuthMiddleware, async (req, res) => {
  const fen = typeof req.query.fen === 'string' ? req.query.fen.trim() : '';
  if (!fen) return res.status(400).json({ error: 'Paramètre fen requis' });

  const filters = parseFiltersFromQuery(req.query);
  if (filters.error) return res.status(filters.status).json({ error: filters.error });

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
    // DB-first : si l'utilisateur est connecté, retour immédiat depuis la base
    if (req.user) {
      const cacheKey = makeGamesCacheKey(filters);
      const fenNorm  = normalizeFen(fen);
      const cached   = await db.getPlayerStatFromCache(req.user.id, cacheKey, fenNorm);
      if (cached) {
        safeWrite(`data: ${JSON.stringify({ type: 'complete', data: JSON.parse(cached.data) })}\n\n`);
        if (!isClosed) res.end();
        return;
      }
    }
    const stats = await getChesscomPlayerStats(fen, filters, (progress) => {
      safeWrite(`data: ${JSON.stringify({ type: 'archive', ...progress })}\n\n`);
    });
    safeWrite(`data: ${JSON.stringify({ type: 'complete', data: stats })}\n\n`);
  } catch (error) {
    console.error('[chesscom stream] error', error);
    safeWrite(`data: ${JSON.stringify({ type: 'error', error: error.message || 'Erreur Chess.com proxy' })}\n\n`);
  }
  if (!isClosed) res.end();
});

// SSE : précalcul INTÉGRAL de toutes les positions d'un joueur + stockage DB.
// Requiert un compte connecté. Événements :
//   data: {"type":"archive","current":3,"total":15,"gamesInArchive":45}
//   data: {"type":"positions","current":200,"total":1000}
//   data: {"type":"complete","cacheKey":"…","totalPositions":1000,"totalGames":5000}
//   data: {"type":"error","error":"…"}
router.get('/stats/load/stream', authMiddleware, async (req, res) => {
  const filters = parseFiltersFromQuery(req.query);
  if (filters.error) return res.status(filters.status).json({ error: filters.error });

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
    const onArchiveProgress = (progress) => {
      safeWrite(`data: ${JSON.stringify({ type: 'archive', ...progress })}\n\n`);
    };
    const onPositionProgress = ({ current, total }) => {
      safeWrite(`data: ${JSON.stringify({ type: 'positions', current, total })}\n\n`);
    };

    // Injecter onArchiveProgress dans ensureGamesLoaded via les filtres
    // en surchargeant getChesscomPlayerStats avec le callback de progression.
    // On passe par computeAndStoreAllPositions qui appelle ensureGamesLoaded.
    const result = await computeAndStoreAllPositions(
      { ...filters, _onArchiveProgress: onArchiveProgress },
      req.user.id,
      onPositionProgress,
      db
    );
    safeWrite(`data: ${JSON.stringify({ type: 'complete', ...result })}\n\n`);
  } catch (error) {
    console.error('[chesscom load/stream] error', error);
    safeWrite(`data: ${JSON.stringify({ type: 'error', error: error.message || 'Erreur Chess.com load' })}\n\n`);
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

// ── POST /report/save — Sauvegarde un rapport en base ─────────────────────────
router.post('/report/save', authMiddleware, async (req, res) => {
  const { params, data } = req.body;
  if (!params || !data) return res.status(400).json({ error: 'params and data required' });
  try {
    const saved = await db.saveReport(req.user.id, JSON.stringify(params), JSON.stringify(data));
    res.json({ success: true, ...saved });
  } catch (error) {
    console.error('[chesscom report save] error', error);
    res.status(500).json({ error: error.message || 'Erreur sauvegarde rapport' });
  }
});

// ── GET /report/saved — Liste des rapports sauvegardés ────────────────────────
router.get('/report/saved', authMiddleware, async (req, res) => {
  try {
    const list = await db.getSavedReportsList(req.user.id);
    const enriched = list.map((r) => {
      const p = JSON.parse(r.params);
      const d = JSON.parse(r.data);
      return {
        id: r.id,
        params: p,
        totalGames: d.totalGames ?? d.parsedGames ?? 0,
        baselineScore: d.baselineScore ?? 0,
        createdAt: r.createdAt,
      };
    });
    res.json(enriched);
  } catch (error) {
    console.error('[chesscom report saved list] error', error);
    res.status(500).json({ error: error.message || 'Erreur liste rapports' });
  }
});

// ── GET /report/saved/:id — Charge un rapport sauvegardé ──────────────────────
router.get('/report/saved/:id', authMiddleware, async (req, res) => {
  try {
    const report = await db.getSavedReportById(req.user.id, req.params.id);
    if (!report) return res.status(404).json({ error: 'Rapport introuvable' });
    res.json({ params: JSON.parse(report.params), data: JSON.parse(report.data), createdAt: report.createdAt });
  } catch (error) {
    console.error('[chesscom report saved get] error', error);
    res.status(500).json({ error: error.message || 'Erreur chargement rapport' });
  }
});

// ── DELETE /report/saved/:id — Supprime un rapport sauvegardé ─────────────────
router.delete('/report/saved/:id', authMiddleware, async (req, res) => {
  try {
    await db.deleteSavedReport(req.user.id, req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('[chesscom report saved delete] error', error);
    res.status(500).json({ error: error.message || 'Erreur suppression rapport' });
  }
});

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

  const minFreqRaw  = Number.parseInt(req.query.minFreq,  10);
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
      { minFreq }
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

  const minFreqRaw  = Number.parseInt(req.query.minFreq,  10);
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
      { minFreq },
      (progress) => safeWrite(`data: ${JSON.stringify({ type: 'archive', ...progress })}\n\n`)
    );
    safeWrite(`data: ${JSON.stringify({ type: 'complete', data: report })}\n\n`);
  } catch (error) {
    console.error('[chesscom report stream] error', error);
    safeWrite(`data: ${JSON.stringify({ type: 'error', error: error.message || 'Erreur rapport Chess.com' })}\n\n`);
  }
  if (!isClosed) res.end();
});

module.exports = router;
