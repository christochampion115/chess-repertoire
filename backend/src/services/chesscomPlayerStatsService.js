'use strict';

const { Chess } = require('chess.js');

const CHESS_COM_API = 'https://api.chess.com/pub';
const GAME_LIMIT             = 10000; // max parties filtrées (garde-fou)
const ARCHIVE_FETCH_DELAY_MS = 80;    // délai inter-archive pour éviter les 429
const CACHE_TTL_MS  = 20 * 60 * 1000; // 20 min
const GAMES_CACHE_MAX  = 30;  // entrées max dans gamesCache (LRU)
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

// ── Nettoyage PGN avant parsing ─────────────────────────────────────────────
// Chess.com inclut des annotations {[%clk ...]} et {[%eval ...]} que
// chess.js v0.10.x ne gère pas toujours correctement même en mode sloppy.
// On les supprime avant de passer le PGN au parser.
function cleanPgn(pgn) {
  return pgn
    .replace(/\r\n/g, '\n')      // normalise les fins de ligne Windows
    .replace(/\{[^}]*\}/g, '')   // supprime tous les commentaires {}
    .replace(/\$\d+/g, '')       // supprime les NAGs ($1, $2 …)
    .replace(/[?!]+/g, '')       // supprime ? ! ?? !! ?! !?
    .replace(/ +/g, ' ')         // normalise les ESPACES seulement (préserve les \n)
    .replace(/\n +/g, '\n')      // supprime les espaces en début de ligne
    .replace(/ +\n/g, '\n')      // supprime les espaces en fin de ligne
    .trim();
}

// ── Parsing PGN : pré-parse une partie en tableau de positions ────────────────
// Chaque entrée = { fenNorm, san, uci } du coup joué depuis cette position.
// Résultat pré-calculé une seule fois pour éviter tout appel chess.js lors
// des requêtes FEN suivantes (navigation instantanée entre positions).
function parseGameToPositions(pgn, playerColor) {
  try {
    const cleaned = cleanPgn(pgn);
    const game = new Chess();
    if (!game.load_pgn(cleaned, { sloppy: true })) return null;
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

function severityRankForItem(item) {
  if (item.priority >= 5 && item.gap >= 0.10) return 3;
  if (item.priority >= 2 || item.gap >= 0.08) return 2;
  return 1;
}

function compareReportItems(a, b) {
  return (severityRankForItem(b) - severityRankForItem(a))
    || (b.priority - a.priority)
    || (b.gap - a.gap)
    || (b.total - a.total);
}

function turnAtDepth(rootTurn, depth) {
  if (depth % 2 === 0) return rootTurn;
  return rootTurn === 'w' ? 'b' : 'w';
}

function isPlayerTurnAtDepth(rootTurn, playerColor, depth) {
  const turn = turnAtDepth(rootTurn, depth);
  return (playerColor === 'white' && turn === 'w') || (playerColor === 'black' && turn === 'b');
}

function getTargetDepth(rootTurn, playerColor, maxDepth) {
  for (let depth = Math.max(0, maxDepth - 1); depth >= 0; depth--) {
    if (isPlayerTurnAtDepth(rootTurn, playerColor, depth)) return depth;
  }
  return 0;
}

function countPlayerTurnsThroughDepth(rootTurn, playerColor, depth) {
  let count = 0;
  for (let i = 0; i <= depth; i++) {
    if (isPlayerTurnAtDepth(rootTurn, playerColor, i)) count++;
  }
  return count;
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
  entry.ts = Date.now(); // LRU : marquer la dernière utilisation
  return entry;
}

function cacheSet(cache, key, data, maxSize) {
  if (cache.size >= maxSize) {
    // Trouver l'entrée la moins récemment utilisée (ts le plus petit)
    let oldestKey = null;
    let oldestTs = Infinity;
    for (const [k, v] of cache) {
      if (v.ts < oldestTs) {
        oldestTs = v.ts;
        oldestKey = k;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { ...data, ts: Date.now() });
}

function makeGamesCacheKey(filters) {
  const { playerUsername, playerColor, playerTimeClass = 'all',
          playerDateFrom = '', playerDateTo = '',
          playerEloMin = 0, playerEloMax = 3000 } = filters;
  const key = [
    playerUsername.toLowerCase(), playerColor, playerTimeClass,
    `${playerDateFrom}-${playerDateTo}`, `${playerEloMin}-${playerEloMax}`
  ].join('|');
  console.log(`[cache] makeGamesCacheKey  user="${playerUsername}" color="${playerColor}" timeClass="${playerTimeClass}" dateFrom="${playerDateFrom}" dateTo="${playerDateTo}" eloMin=${playerEloMin} eloMax=${playerEloMax}  =>  "${key}"`);
  return key;
}

// ── Orchestrateur principal ───────────────────────────────────────────────────

// Lock de déduplication : empêche deux téléchargements identiques en parallèle.
const pendingGamesFetches = new Map();

// Helper partagé : garantit que les parties sont dans gamesCache.
// Retour instantané si déjà chargées, sinon fetch depuis Chess.com.
// onProgress({ current, total, gamesInArchive }) appelé après chaque archive téléchargée.
async function ensureGamesLoaded(filters, onProgress = null) {
  const { playerUsername, playerColor } = filters;
  const gamesCacheKey = makeGamesCacheKey(filters);

  // Cache mémoire
  const cached = cacheGet(gamesCache, gamesCacheKey);
  if (cached) {
    console.log(`[cache] HIT  gamesCache  ${gamesCacheKey}`);
    return cached;
  }

  // Déduplication : si un téléchargement est déjà en cours pour ces mêmes filtres, attendre
  const existing = pendingGamesFetches.get(gamesCacheKey);
  if (existing) {
    console.log(`[cache] WAIT gamesCache  ${gamesCacheKey}  (rejoint un téléchargement en cours)`);
    return existing;
  }

  console.log(`[cache] MISS gamesCache  ${gamesCacheKey}  → téléchargement`);
  console.time(`fetchAllGames:${gamesCacheKey}`);
  const promise = fetchAllGames(filters, onProgress, playerUsername, playerColor);
  pendingGamesFetches.set(gamesCacheKey, promise);

  try {
    const result = await promise;
    console.timeEnd(`fetchAllGames:${gamesCacheKey}`);
    cacheSet(gamesCache, gamesCacheKey, result, GAMES_CACHE_MAX);
    return result;
  } finally {
    pendingGamesFetches.delete(gamesCacheKey);
  }
}

// Cœur du téléchargement : séquence archives → filtrage → parsing.
async function fetchAllGames(filters, onProgress, playerUsername, playerColor) {
  const archives = await getPlayerArchives(playerUsername);
  const toFetch  = filterArchiveUrls(
    archives,
    filters.playerDateFrom || '',
    filters.playerDateTo   || ''
  ); // pas de troncature ici — GAME_LIMIT est le seul garde-fou

  const parsedGames  = [];
  let totalFiltered  = 0;
  let parseOk        = 0;
  let parseFail      = 0;
  let truncated      = false;

  let archiveIdx = 0;
  for (const archiveUrl of toFetch) { // série — anti-429
    archiveIdx++;
    const monthGames = await fetchMonthlyGames(archiveUrl);
    await new Promise(r => setTimeout(r, ARCHIVE_FETCH_DELAY_MS)); // respire entre archives
    const valid = filterGames(monthGames, filters);
    if (onProgress) { onProgress({ current: archiveIdx, total: toFetch.length, gamesInArchive: valid.length }); }
    for (const g of valid) {
      if (totalFiltered >= GAME_LIMIT) { truncated = true; break; }
      totalFiltered++;
      if (!g.pgn) { parseFail++; continue; }
      const parsed = parseGameToPositions(g.pgn, playerColor);
      if (parsed) { parsedGames.push(parsed); parseOk++; }
      else parseFail++;
    }
    if (truncated) break;
  }

  console.log(`[chesscom] ${playerUsername} | archives: ${toFetch.length} | filtrées: ${totalFiltered} | parsées: ${parseOk} | échecs: ${parseFail} | tronquées: ${truncated}`);

  // totalFiltered = parties qui ont passé les filtres (couleur/cadence/elo)
  // parsedGames.length peut être inférieur : parties sans PGN ou parsing échoué
  return { parsedGames, totalGames: totalFiltered, truncated };
}

// Requête simple : stats pour un seul FEN.
// onProgress propagé à ensureGamesLoaded pour le suivi des archives.
async function getChesscomPlayerStats(fen, filters, onProgress = null) {
  const { playerUsername, playerColor } = filters;
  if (!playerUsername || !playerColor) {
    throw Object.assign(new Error('username et color requis'), { status: 400 });
  }

  const targetFenNorm  = normalizeFen(fen);
  const gamesCacheKey  = makeGamesCacheKey(filters);
  const resultCacheKey = `${gamesCacheKey}|${targetFenNorm}`;

  console.log(`[cache] getChesscomPlayerStats  fen="${fen}"  targetFenNorm="${targetFenNorm}"  resultCacheKey="${resultCacheKey}"`);

  // Niveau 2 : résultat déjà calculé pour ce FEN exact
  const cachedResult = cacheGet(resultCache, resultCacheKey);
  if (cachedResult) {
    console.log(`[cache] HIT  resultCache  ${resultCacheKey}`);
    return {
      moves: cachedResult.moves,
      totalGames: cachedResult.totalGames,
      truncated: cachedResult.truncated,
      fallback: false,
      message: cachedResult.message
    };
  }

  console.log(`[cache] MISS resultCache  ${resultCacheKey}  → scan mémoire`);
  console.time(`scan:${targetFenNorm}`);
  // Niveau 1 + fetch si besoin
  const { parsedGames, totalGames, truncated } = await ensureGamesLoaded(filters, onProgress);

  // Scan mémoire uniquement — aucun appel chess.js
  const matches = [];
  for (const pg of parsedGames) {
    const pos = pg.positions.find(p => p.fenNorm === targetFenNorm);
    if (pos) matches.push({ san: pos.san, uci: pos.uci, result: pg.result, oppRating: pg.opponentElo });
  }

  console.timeEnd(`scan:${targetFenNorm}`);
  console.log(`[cache] scan  ${targetFenNorm}  → ${matches.length} match(es) sur ${parsedGames.length} parties`);

  const moves   = aggregateMoves(matches);
  const message = truncated
    ? `Analyse limitée à ${GAME_LIMIT} parties. Affinez la période ou la cadence pour plus de précision.`
    : '';

  cacheSet(resultCache, resultCacheKey, { moves, totalGames, truncated, message }, RESULT_CACHE_MAX);
  return { moves, totalGames, truncated: truncated || false, fallback: false, message };
}

// Requête batch : traite un tableau de FENs en une seule passe mémoire.
// Les parties sont attendues déjà en cache (appelé après getChesscomPlayerStats).
async function getChesscomPlayerStatsBatch(fens, filters, onProgress = null) {
  const { playerUsername, playerColor } = filters;
  if (!playerUsername || !playerColor) {
    throw Object.assign(new Error('username et color requis'), { status: 400 });
  }
  if (!Array.isArray(fens) || fens.length === 0) return {};

  const gamesCacheKey                          = makeGamesCacheKey(filters);
  const { parsedGames, totalGames, truncated } = await ensureGamesLoaded(filters, onProgress);
  const message = truncated
    ? `Analyse limitée à ${GAME_LIMIT} parties. Affinez la période ou la cadence pour plus de précision.`
    : '';

  const results      = {};
  const totalFens    = fens.length;
  let processedCount = 0;

  for (let i = 0; i < totalFens; i++) {
    // Céder l'event-loop toutes les 50 FENs pour ne pas bloquer les autres requêtes
    if (i > 0 && i % 50 === 0) {
      await new Promise(resolve => setImmediate(resolve));
      if (onProgress) onProgress({ current: i, total: totalFens });
    }

    const fen = fens[i];
    const fenNorm        = normalizeFen(fen);
    const resultCacheKey = `${gamesCacheKey}|${fenNorm}`;

    const cached = cacheGet(resultCache, resultCacheKey);
    if (cached) {
      results[fen] = { moves: cached.moves, totalGames: cached.totalGames, truncated: cached.truncated, fallback: false, message: cached.message };
      processedCount++;
      continue;
    }

    const matches = [];
    for (const pg of parsedGames) {
      const pos = pg.positions.find(p => p.fenNorm === fenNorm);
      if (pos) matches.push({ san: pos.san, uci: pos.uci, result: pg.result, oppRating: pg.opponentElo });
    }
    const moves = aggregateMoves(matches);
    cacheSet(resultCache, resultCacheKey, { moves, totalGames, truncated, message }, RESULT_CACHE_MAX);
    results[fen] = { moves, totalGames, truncated: truncated || false, fallback: false, message };
    processedCount++;
  }

  console.log(`[batch] ${processedCount}/${totalFens} FENs scannés — ${Object.keys(results).length} résultats`);
  return results;
}

// ── Rapport de priorités d'entraînement ──────────────────────────────────────
// Analyse toutes les parties et retourne un classement des coups/lignes
// selon leur impact sur le résultat global (formule bayésienne ajustée).
async function getChesscomReport(filters, { maxDepth = 10, minFreq = 3 } = {})  {
  const { playerColor, playerStartFen = '' } = filters;

  const { parsedGames, totalGames: filteredGames, truncated } = await ensureGamesLoaded(filters);
  if (!parsedGames.length) {
    return { totalGames: 0, parsedGames: 0, filteredGames: 0, baselineScore: 0, items: [], truncated: false };
  }

  // ── Phase 1 : construction de la carte des positions ──────────────────────
  // positionMap[fenNorm] = {
  //   total       : games reaching this FEN,
  //   depth       : half-move depth (0 = start),
  //   moves       : Map<san, { uci, fenAfterNorm, wins, draws, losses, total }>
  // }
  const positionMap = new Map();
  let totalScore = 0;

  const INITIAL_FEN_NORM = normalizeFen(
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  );
  const rootFenNorm = playerStartFen ? normalizeFen(playerStartFen) : INITIAL_FEN_NORM;
  const rootTurn = rootFenNorm.split(' ')[1] || 'w';
  const targetDepth = getTargetDepth(rootTurn, playerColor, maxDepth);
  let scopedGames = 0;

  for (const { positions, result } of parsedGames) {
    const rootIndex = rootFenNorm === INITIAL_FEN_NORM
      ? 0
      : positions.findIndex(position => position.fenNorm === rootFenNorm);
    if (rootIndex < 0) continue;

    scopedGames++;

    let gameWin  = false;
    let gameDraw = false;
    if      (result === '1-0' && playerColor === 'white') { gameWin = true;  totalScore += 1; }
    else if (result === '0-1' && playerColor === 'black') { gameWin = true;  totalScore += 1; }
    else if (result !== '1-0' && result !== '0-1')        { gameDraw = true; totalScore += 0.5; }

    const seenFens = new Set();
    for (let relDepth = 0; (rootIndex + relDepth) < positions.length && relDepth < maxDepth; relDepth++) {
      const current = positions[rootIndex + relDepth];
      const next = positions[rootIndex + relDepth + 1] || null;
      const { fenNorm, san, uci } = current;
      const fenAfterNorm = next ? next.fenNorm : null;

      if (seenFens.has(fenNorm)) continue; // transposition : ignore dans cette partie
      seenFens.add(fenNorm);

      if (!positionMap.has(fenNorm)) {
        positionMap.set(fenNorm, { total: 0, depth: relDepth, moves: new Map() });
      }
      const pos = positionMap.get(fenNorm);
      pos.total++;

      if (fenAfterNorm) {
        if (!pos.moves.has(san)) {
          pos.moves.set(san, { uci, fenAfterNorm, wins: 0, draws: 0, losses: 0, total: 0 });
        }
        const mv = pos.moves.get(san);
        mv.total++;
        if      (gameWin)  mv.wins++;
        else if (gameDraw) mv.draws++;
        else               mv.losses++;
      }
    }
  }

  if (!scopedGames) {
    return {
      totalGames: 0,
      parsedGames: 0,
      filteredGames,
      truncated: truncated || false,
      baselineScore: 0,
      items: [],
      focusDepth: targetDepth,
      focusMoveNumber: countPlayerTurnsThroughDepth(rootTurn, playerColor, targetDepth),
      rootFen: rootFenNorm,
      positionFiltered: !!playerStartFen,
    };
  }

  const baselineScore = totalScore / scopedGames;

  // ── Phase 2 : BFS + scoring de priorité ──────────────────────────────────
  const MIN_RATIO = 0.04; // une variante doit représenter >= 4 % du nœud parent
  const reportItems = [];
  const visited     = new Set();

  const queue = [{ fenNorm: rootFenNorm, path: [], depth: 0, parentTotal: scopedGames }];

  while (queue.length > 0) {
    const { fenNorm, path, depth, parentTotal } = queue.shift();

    if (visited.has(fenNorm)) continue;
    visited.add(fenNorm);

    if (depth >= maxDepth) continue;

    const pos = positionMap.get(fenNorm);
    if (!pos)                                        continue;
    if (pos.total < minFreq)                         continue;
    if (depth > 0 && pos.total < parentTotal * MIN_RATIO) continue;

    const colorToMove  = fenNorm.split(' ')[1]; // 'w' ou 'b'
    const isPlayerTurn = (playerColor === 'white' && colorToMove === 'w') ||
                         (playerColor === 'black' && colorToMove === 'b');

    for (const [san, mv] of pos.moves) {
      if (mv.total < minFreq)                         continue;
      if (mv.total < pos.total * MIN_RATIO)           continue;

      if (isPlayerTurn && depth >= 1 && depth <= targetDepth) {
        const score          = (mv.wins + 0.5 * mv.draws) / mv.total;
        const gap            = parseFloat((baselineScore - score).toFixed(3));
        const confidence     = Math.min(1, mv.total / minFreq);
        const priority       = mv.total * gap * confidence;
        const lossesAvoided  = parseFloat((100 * (mv.total / scopedGames) * gap).toFixed(1));
        const moveNumber     = Math.floor(depth / 2) + 1;

        reportItems.push({
          contextPath  : [...path],
          playerMove   : san,
          playerUci    : mv.uci,
          fenBefore    : fenNorm,
          fenAfter     : mv.fenAfterNorm,
          depth,
          moveNumber,
          total        : mv.total,
          wins         : mv.wins,
          draws        : mv.draws,
          losses       : mv.losses,
          score        : parseFloat(score.toFixed(3)),
          gap          : parseFloat(gap.toFixed(3)),
          priority     : parseFloat(priority.toFixed(2)),
          lossesAvoided,
          posTotal     : pos.total,
          targetDepth,
        });
      }

      // Continuer l'exploration dans tous les cas (y compris tour adversaire)
      if (mv.fenAfterNorm && !visited.has(mv.fenAfterNorm)) {
        queue.push({
          fenNorm    : mv.fenAfterNorm,
          path       : [...path, san],
          depth      : depth + 1,
          parentTotal: mv.total,
        });
      }
    }
  }

  reportItems.sort(compareReportItems);

  // ── Phase 3 : déduplication par profondeur ────────────────────────────────
  // On préfère les items profonds (lignes spécifiques) aux items peu profonds
  // (parents) quand ils font partie de la même ligne.
  // Les items positifs (gap > 0) et négatifs (gap < 0) sont dédupliqués
  // séparément pour éviter qu'une mauvaise sous-ligne n'efface une bonne ligne parente.

  // Vérifie si `longer` commence par `shorter` (comparaison de tableaux de SAN).
  function pathStartsWith(longer, shorter) {
    if (longer.length <= shorter.length) return false;
    for (let i = 0; i < shorter.length; i++) {
      if (longer[i] !== shorter[i]) return false;
    }
    return true;
  }

  function deduplicateGroup(items) {
    const sorted = items.slice().sort((a, b) =>
      (b.depth - a.depth) || compareReportItems(a, b)
    );
    const result = [];
    const selectedPaths = [];
    for (const item of sorted) {
      const itemPath = [...item.contextPath, item.playerMove];
      const dominated = selectedPaths.some(sel => pathStartsWith(sel, itemPath));
      if (!dominated) {
        result.push(item);
        selectedPaths.push(itemPath);
      }
      if (result.length >= 200) break;
    }
    return result;
  }

  const dedupBad  = deduplicateGroup(reportItems.filter(i => i.gap >  0));
  const dedupGood = deduplicateGroup(reportItems.filter(i => i.gap <= 0));
  const finalItems = [...dedupBad, ...dedupGood];

  // Remettre dans l'ordre priorité pour l'affichage
  finalItems.sort(compareReportItems);

  const notEnoughData = finalItems.filter(i => i.gap > 0.01).length < 10;

  return {
    totalGames   : scopedGames,
    parsedGames  : scopedGames,
    filteredGames,
    truncated    : truncated || false,
    baselineScore: parseFloat(baselineScore.toFixed(3)),
    focusDepth   : targetDepth,
    focusMoveNumber: countPlayerTurnsThroughDepth(rootTurn, playerColor, targetDepth),
    rootFen      : rootFenNorm,
    positionFiltered: !!playerStartFen,
    notEnoughData,
    items        : finalItems.slice(0, 200),
  };
}

module.exports = { getChesscomPlayerStats, getChesscomPlayerStatsBatch, getChesscomReport };
