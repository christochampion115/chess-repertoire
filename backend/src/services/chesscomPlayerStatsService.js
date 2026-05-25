'use strict';

const { Chess } = require('chess.js');

const CHESS_COM_API = 'https://api.chess.com/pub';
const GAME_LIMIT    = 5000;   // max parties analysées par session
const ARCHIVE_LIMIT = 24;     // max mois récupérés
const CACHE_TTL_MS  = 20 * 60 * 1000; // 20 min
const GAMES_CACHE_MAX  = 5;   // entrées max dans gamesCache (LRU simple)
const RESULT_CACHE_MAX = 500; // entrées max dans resultCache

// ── HTTP (même pattern que lichessStatsService) ───────────────────────────────

function buildChesscomHeaders() {
  return {
    Accept: 'application/json',
    'User-Agent': 'AlphaChess/1.0 (contact: christophe)'
  };
}

function fetchWithTimeout(url, timeoutMs = 12000) {
  if (typeof fetch === 'undefined') {
    throw new Error('Fetch API non disponible sur ce runtime Node.js');
  }
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const signal = controller ? controller.signal : undefined;
  let timer;
  const fetchPromise = fetch(url, { method: 'GET', headers: buildChesscomHeaders(), signal });
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      if (controller) controller.abort();
      reject(new Error('Timeout requête Chess.com'));
    }, timeoutMs);
  });
  return Promise.race([fetchPromise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function fetchChesscomJson(url) {
  let response = await fetchWithTimeout(url);

  // Retry unique sur 429
  if (response.status === 429) {
    await new Promise(r => setTimeout(r, 2500));
    response = await fetchWithTimeout(url);
  }

  if (response.status === 404) {
    const err = new Error('Joueur introuvable sur Chess.com');
    err.status = 404;
    throw err;
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const err = new Error(`Chess.com API erreur ${response.status}${text ? `: ${text}` : ''}`);
    err.status = response.status;
    throw err;
  }
  return response.json();
}

// ── FEN ───────────────────────────────────────────────────────────────────────
// Garde 3 champs (pièces + trait + roque), ignore en passant + compteurs.
// Évite les faux-miss causés par les différences de normalisation en passant
// entre Chess.com PGN et le FEN affiché dans l'app.
function normalizeFen(fen) {
  return fen.split(' ').slice(0, 3).join(' ');
}

// ── Appels API Chess.com ──────────────────────────────────────────────────────

async function getPlayerArchives(username) {
  const data = await fetchChesscomJson(
    `${CHESS_COM_API}/player/${encodeURIComponent(username)}/games/archives`
  );
  return Array.isArray(data.archives) ? data.archives : [];
}

// Archives format : "…/games/2024/03" → filtre sur YYYY/MM
function filterArchiveUrls(archives, dateFrom, dateTo) {
  return archives.filter(url => {
    const m = url.match(/\/(\d{4})\/(\d{2})$/);
    if (!m) return false;
    const d = `${m[1]}/${m[2]}`;
    if (dateFrom && d < dateFrom) return false;
    if (dateTo   && d > dateTo)   return false;
    return true;
  });
}

async function fetchMonthlyGames(archiveUrl) {
  const data = await fetchChesscomJson(archiveUrl);
  return Array.isArray(data.games) ? data.games : [];
}

// ── Filtrage local (sans réseau) ──────────────────────────────────────────────

function getOpponentRating(game, usernameLower) {
  if (game.white && game.white.username && game.white.username.toLowerCase() === usernameLower) {
    return (game.black && game.black.rating) || 0;
  }
  return (game.white && game.white.rating) || 0;
}

function filterGames(games, { playerUsername, playerColor, playerTimeClass, playerEloMin, playerEloMax }) {
  const lc = playerUsername.toLowerCase();
  return games.filter(game => {
    if (game.rules && game.rules !== 'chess') return false;
    if (playerTimeClass !== 'all' && game.time_class !== playerTimeClass) return false;

    if (playerColor === 'white') {
      if (!game.white || game.white.username.toLowerCase() !== lc) return false;
    } else {
      if (!game.black || game.black.username.toLowerCase() !== lc) return false;
    }

    const oppRating = getOpponentRating(game, lc);
    if (oppRating > 0) {
      if (playerEloMin > 0   && oppRating < playerEloMin) return false;
      if (playerEloMax < 3000 && oppRating > playerEloMax) return false;
    }
    return true;
  });
}

// ── Parsing PGN : pré-parse une partie en tableau de positions ────────────────
// Chaque entrée = { fenNorm, san, uci } du coup joué depuis cette position.
// Résultat pré-calculé une seule fois pour éviter tout appel chess.js lors
// des requêtes FEN suivantes (navigation instantanée entre positions).
function parseGameToPositions(pgn, playerColor) {
  try {
    const game = new Chess();
    if (!game.load_pgn(pgn, { sloppy: true })) return null;
    const headers = game.header();
    const result = (headers && headers['Result']) || '*';
    if (result === '*') return null; // partie en cours
    const opponentElo = playerColor === 'white'
      ? parseInt(headers['BlackElo'] || '0', 10) || 0
      : parseInt(headers['WhiteElo'] || '0', 10) || 0;
    const history = game.history({ verbose: true });
    if (!history.length) return null;
    const replay = new Chess();
    const positions = [];
    for (const move of history) {
      positions.push({
        fenNorm: normalizeFen(replay.fen()),
        san: move.san,
        uci: move.from + move.to + (move.promotion || '')
      });
      try {
        replay.move({ from: move.from, to: move.to, promotion: move.promotion });
      } catch (_) {
        return null; // PGN corrompu
      }
    }
    return { positions, result, opponentElo };
  } catch (_) {
    return null;
  }
}

// ── Agrégation ────────────────────────────────────────────────────────────────
// Convention : white/black = victoires des blancs/noirs (même que Lichess).
// averageRating = elo moyen de l'adversaire sur les parties où ce coup a été joué.
function aggregateMoves(matches) {
  const map = new Map();
  for (const m of matches) {
    let e = map.get(m.uci);
    if (!e) {
      e = { san: m.san, uci: m.uci, white: 0, black: 0, draws: 0, ratingSum: 0, ratingCount: 0 };
      map.set(m.uci, e);
    }
    if (m.result === '1-0')      e.white++;
    else if (m.result === '0-1') e.black++;
    else                         e.draws++;
    if (m.oppRating > 0) { e.ratingSum += m.oppRating; e.ratingCount++; }
  }
  return Array.from(map.values())
    .map(e => ({
      san: e.san,
      uci: e.uci,
      white: e.white,
      black: e.black,
      draws: e.draws,
      frequency: e.white + e.black + e.draws,
      averageRating: e.ratingCount > 0 ? Math.round(e.ratingSum / e.ratingCount) : 0
    }))
    .sort((a, b) => b.frequency - a.frequency);
}

// ── Cache deux niveaux (in-memory, session seulement) ─────────────────────────
// gamesCache  : clé filtres sans FEN → parties filtrées pré-chargées
// resultCache : clé filtres + FEN    → moves agrégés (réponse finale)
const gamesCache  = new Map();
const resultCache = new Map();

function cacheGet(cache, key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { cache.delete(key); return null; }
  return entry;
}

function cacheSet(cache, key, data, maxSize) {
  if (cache.size >= maxSize) cache.delete(cache.keys().next().value); // LRU : retire le plus ancien
  cache.set(key, { ...data, ts: Date.now() });
}

function makeGamesCacheKey(filters) {
  const { playerUsername, playerColor, playerTimeClass = 'all',
          playerDateFrom = '', playerDateTo = '',
          playerEloMin = 0, playerEloMax = 3000 } = filters;
  return [
    playerUsername.toLowerCase(), playerColor, playerTimeClass,
    `${playerDateFrom}-${playerDateTo}`, `${playerEloMin}-${playerEloMax}`
  ].join('|');
}

// ── Orchestrateur principal ───────────────────────────────────────────────────

async function getChesscomPlayerStats(fen, filters) {
  const { playerUsername, playerColor } = filters;
  if (!playerUsername || !playerColor) {
    throw Object.assign(new Error('username et color requis'), { status: 400 });
  }

  const targetFenNorm  = normalizeFen(fen);
  const gamesCacheKey  = makeGamesCacheKey(filters);
  const resultCacheKey = `${gamesCacheKey}|${targetFenNorm}`;

  // ── Niveau 2 : résultat déjà calculé pour ce FEN exact ────────────────────
  const cachedResult = cacheGet(resultCache, resultCacheKey);
  if (cachedResult) {
    return {
      moves: cachedResult.moves,
      totalGames: cachedResult.totalGames,
      truncated: cachedResult.truncated,
      fallback: false,
      message: cachedResult.message
    };
  }

  // ── Niveau 1 : parties déjà chargées, seulement re-parse pour ce FEN ──────
  let gamesData;
  const cachedGames = cacheGet(gamesCache, gamesCacheKey);
  if (cachedGames) {
    gamesData = cachedGames;
  } else {
    // ── Fetch complet depuis Chess.com ────────────────────────────────────
    const archives = await getPlayerArchives(playerUsername);
    const toFetch  = filterArchiveUrls(
      archives,
      filters.playerDateFrom || '',
      filters.playerDateTo   || ''
    ).slice(-ARCHIVE_LIMIT); // N mois les plus récents dans la plage

    const parsedGames = [];
    let totalFiltered = 0;
    let truncated = false;

    for (const archiveUrl of toFetch) { // série — anti-429
      const monthGames = await fetchMonthlyGames(archiveUrl);
      const valid = filterGames(monthGames, filters);
      for (const g of valid) {
        if (totalFiltered >= GAME_LIMIT) { truncated = true; break; }
        totalFiltered++;
        if (!g.pgn) continue;
        const parsed = parseGameToPositions(g.pgn, playerColor);
        if (parsed) parsedGames.push(parsed);
      }
      if (truncated) break;
    }

    gamesData = { parsedGames, totalGames: parsedGames.length, truncated };
    cacheSet(gamesCache, gamesCacheKey, gamesData, GAMES_CACHE_MAX);
  }

  const { parsedGames, totalGames, truncated } = gamesData;

  // ── Recherche rapide du FEN cible dans les positions pré-parsées ───────────
  // O(n*m) scan en mémoire uniquement — aucun appel chess.js, ~1ms pour 400 parties
  const matches = [];
  for (const pg of parsedGames) {
    const pos = pg.positions.find(p => p.fenNorm === targetFenNorm);
    if (pos) matches.push({ san: pos.san, uci: pos.uci, result: pg.result, oppRating: pg.opponentElo });
  }

  const moves   = aggregateMoves(matches);
  const message = truncated
    ? `Analyse limitée à ${GAME_LIMIT} parties. Affinez la période ou la cadence pour plus de précision.`
    : '';

  cacheSet(resultCache, resultCacheKey, { moves, totalGames, truncated, message }, RESULT_CACHE_MAX);

  return { moves, totalGames, truncated: truncated || false, fallback: false, message };
}

module.exports = { getChesscomPlayerStats };
