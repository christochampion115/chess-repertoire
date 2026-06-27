'use strict';

const { Chess } = require('chess.js');

const CHESS_COM_API = 'https://api.chess.com/pub';
const GAME_LIMIT             = 10000; // max parties filtrées (garde-fou)
const ARCHIVE_FETCH_DELAY_MS = 600;   // délai inter-archive pour éviter les 429 / Cloudflare
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
    const err = new Error(`Chess.com API erreur ${response.status}${text ? `: ${text.slice(0, 100)}` : ''}`);
    err.status = response.status;
    throw err;
  }

  const ct = response.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const err = new Error('Chess.com a retourné une réponse non-JSON (rate limit probable). Réessaie dans quelques minutes.');
    err.status = 429;
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

// Helper partagé : garantit que les parties sont dans gamesCache.
// Retour instantané si déjà chargées, sinon fetch depuis Chess.com.
async function ensureGamesLoaded(filters, onProgress = null) {
  const { playerUsername, playerColor } = filters;
  const gamesCacheKey = makeGamesCacheKey(filters);
  const cached = cacheGet(gamesCache, gamesCacheKey);
  if (cached) {
    if (onProgress) onProgress({ current: 1, total: 1, gamesInArchive: cached.totalGames ?? 0 });
    return cached;
  }

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
    if (onProgress) onProgress({ current: archiveIdx, total: toFetch.length, gamesInArchive: valid.length });
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
  const gamesData = { parsedGames, totalGames: totalFiltered, truncated };
  cacheSet(gamesCache, gamesCacheKey, gamesData, GAMES_CACHE_MAX);
  return gamesData;
}

// Requête simple : stats pour un seul FEN.
async function getChesscomPlayerStats(fen, filters) {
  const { playerUsername, playerColor } = filters;
  if (!playerUsername || !playerColor) {
    throw Object.assign(new Error('username et color requis'), { status: 400 });
  }

  const targetFenNorm  = normalizeFen(fen);
  const gamesCacheKey  = makeGamesCacheKey(filters);
  const resultCacheKey = `${gamesCacheKey}|${targetFenNorm}`;

  // Niveau 2 : résultat déjà calculé pour ce FEN exact
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

  // Niveau 1 + fetch si besoin
  const { parsedGames, totalGames, truncated } = await ensureGamesLoaded(filters);

  // Scan mémoire uniquement — aucun appel chess.js
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

// Requête batch : traite un tableau de FENs en une seule passe mémoire.
// Les parties sont attendues déjà en cache (appelé après getChesscomPlayerStats).
async function getChesscomPlayerStatsBatch(fens, filters) {
  const { playerUsername, playerColor } = filters;
  if (!playerUsername || !playerColor) {
    throw Object.assign(new Error('username et color requis'), { status: 400 });
  }
  if (!Array.isArray(fens) || fens.length === 0) return {};

  const gamesCacheKey                          = makeGamesCacheKey(filters);
  const { parsedGames, totalGames, truncated } = await ensureGamesLoaded(filters);
  const message = truncated
    ? `Analyse limitée à ${GAME_LIMIT} parties. Affinez la période ou la cadence pour plus de précision.`
    : '';

  const results = {};
  for (const fen of fens) {
    const fenNorm        = normalizeFen(fen);
    const resultCacheKey = `${gamesCacheKey}|${fenNorm}`;

    const cached = cacheGet(resultCache, resultCacheKey);
    if (cached) {
      results[fen] = { moves: cached.moves, totalGames: cached.totalGames, truncated: cached.truncated, fallback: false, message: cached.message };
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
  }
  return results;
}

// ── Rapport de priorités d'entraînement (simplifié) ─────────────────────────
// Charge toutes les parties → positionMap → items (tous les coups joueur) →
// groupe par depth=5 (3e coup joueur) → top 5-10 groupes → enfants critiques.
async function getChesscomReport(filters, { minFreq = 3 } = {}, onProgress = null)  {
  const { playerColor, playerStartFen = '' } = filters;

  const { parsedGames, totalGames: filteredGames, truncated } = await ensureGamesLoaded(filters, onProgress);

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
  const MAX_DEPTH = 10;
  let scopedGames = 0;

  if (!parsedGames.length) {
    return {
      totalGames: 0,
      parsedGames: 0,
      filteredGames,
      truncated: truncated || false,
      baselineScore: 0,
      items: [],
      rootFen: rootFenNorm,
      positionFiltered: !!playerStartFen,
    };
  }

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
    for (let relDepth = 0; (rootIndex + relDepth) < positions.length && relDepth < MAX_DEPTH; relDepth++) {
      const current = positions[rootIndex + relDepth];
      const next = positions[rootIndex + relDepth + 1] || null;
      const { fenNorm, san, uci } = current;
      const fenAfterNorm = next ? next.fenNorm : null;

      if (seenFens.has(fenNorm)) continue;
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
      rootFen: rootFenNorm,
      positionFiltered: !!playerStartFen,
    };
  }

  const baselineScore = totalScore / scopedGames;

  // ── Phase 2 : BFS — collecte des coups joueur à toutes les profondeurs ──
  // Chaque item = un coup du joueur depuis une position donnée.
  // gap signé = baselineScore - score (négatif = mieux que la moyenne).
  // impactElo  = 100 × freq × (16 × score − 8)
  //   score=0.5 (50%) → 0 (neutre), score > 0.5 → impactElo > 0 (bon),
  //   score < 0.5 → impactElo < 0 (perte d'Elo sur 100 parties).
  const reportItems = [];
  const visited     = new Set();

  const queue = [{ fenNorm: rootFenNorm, path: [], depth: 0 }];

  while (queue.length > 0) {
    const { fenNorm, path, depth } = queue.shift();

    if (visited.has(fenNorm)) continue;
    visited.add(fenNorm);

    if (depth >= MAX_DEPTH) continue;

    const pos = positionMap.get(fenNorm);
    if (!pos)                  continue;
    if (pos.total < minFreq)   continue;

    const colorToMove  = fenNorm.split(' ')[1];
    const isPlayerTurn = (playerColor === 'white' && colorToMove === 'w') ||
                         (playerColor === 'black' && colorToMove === 'b');

    for (const [san, mv] of pos.moves) {
      if (mv.total < minFreq) continue;

      if (isPlayerTurn && depth >= 1) {
        const score     = (mv.wins + 0.5 * mv.draws) / mv.total;
        const gap       = baselineScore - score; // signé (négatif = meilleur)
        const impactElo = 100 * (mv.total / scopedGames) * (16 * score - 8);
        const moveNumber = Math.floor(depth / 2) + 1;

        reportItems.push({
          contextPath: [...path],
          playerMove: san,
          playerUci: mv.uci,
          fenBefore: fenNorm,
          fenAfter: mv.fenAfterNorm,
          depth,
          moveNumber,
          total: mv.total,
          wins: mv.wins,
          draws: mv.draws,
          losses: mv.losses,
          score: parseFloat(score.toFixed(3)),
          gap: parseFloat(gap.toFixed(3)),
          impactElo: parseFloat(impactElo.toFixed(2)),
          posTotal: pos.total,
        });
      }

      if (mv.fenAfterNorm && !visited.has(mv.fenAfterNorm)) {
        queue.push({
          fenNorm: mv.fenAfterNorm,
          path: [...path, san],
          depth: depth + 1,
        });
      }
    }
  }

  // Tri global par impactElo (pire → meilleur)
  reportItems.sort((a, b) => a.impactElo - b.impactElo);

  // ── Phase 3 : Groupement (free mode) ou plat (position mode) ────────────
  if (!playerStartFen) {
    // Grouper par depth du 3e coup joueur
    const targetLength = playerColor === 'white' ? 4 : 5;
    const groupsByFen = new Map(); // fenBefore → aggregate

    for (const item of reportItems) {
      if (item.contextPath.length !== targetLength) continue;
      const fen = item.fenBefore || item.fenAfter;
      if (!groupsByFen.has(fen)) {
        groupsByFen.set(fen, {
          key: [...item.contextPath, item.playerMove].join(' '),
          total: 0, wins: 0, draws: 0, losses: 0,
          contextPath: item.contextPath,
          playerMove: item.playerMove,
          fen,
        });
      }
      const g = groupsByFen.get(fen);
      g.total  += item.total;
      g.wins   += item.wins;
      g.draws  += item.draws;
      g.losses += item.losses;
    }

    const groups = Array.from(groupsByFen.values()).map(g => {
      const score = g.total > 0 ? (g.wins + 0.5 * g.draws) / g.total : 0;
      const gap   = baselineScore - score;
      const impactElo = 100 * (g.total / scopedGames) * (16 * score - 8);
      return {
        key: g.key,
        children: [],
        total: g.total,
        wins: g.wins,
        draws: g.draws,
        losses: g.losses,
        impactElo: parseFloat(impactElo.toFixed(2)),
        fen: g.fen,
        groupScore: parseFloat(score.toFixed(3)),
        groupGap: parseFloat(gap.toFixed(3)),
        problematicLines: [],
        compensatingLines: [],
      };
    });

    groups.sort((a, b) => a.impactElo - b.impactElo);

    // Au moins 5, au max 10
    const count = Math.min(10, Math.max(5, groups.length));
    const selected = groups.slice(0, count);

    // Enfants critiques pour chaque groupe
    const selectedKeys = new Set(selected.map(g => g.key));
    for (const group of selected) {
      const children = reportItems.filter(item => {
        const itemKey = [...item.contextPath, item.playerMove].join(' ');
        return itemKey.startsWith(group.key + ' ') && itemKey !== group.key;
      });
      group.children = children;
      group.problematicLines = children
        .filter(c => c.impactElo < 0)
        .sort((a, b) => a.impactElo - b.impactElo);
      group.compensatingLines = children
        .filter(c => c.impactElo >= 0)
        .sort((a, b) => b.impactElo - a.impactElo);
    }

    // Mentions honorables : lignes orphelines hors des groupes retenus
    const coveredKeys = new Set(selectedKeys);
    for (const g of selected) {
      for (const c of g.children) {
        coveredKeys.add([...c.contextPath, c.playerMove].join(' '));
      }
    }
    const honorables = reportItems
      .filter(item => {
        const itemKey = [...item.contextPath, item.playerMove].join(' ');
        return !coveredKeys.has(itemKey) && item.contextPath.length !== targetLength;
      })
      .sort((a, b) => a.impactElo - b.impactElo)
      .slice(0, 5);

    return {
      totalGames: scopedGames,
      parsedGames: scopedGames,
      filteredGames,
      truncated: truncated || false,
      baselineScore: parseFloat(baselineScore.toFixed(3)),
      rootFen: rootFenNorm,
      positionFiltered: false,
      items: reportItems.slice(0, 500),
      groups: selected,
      honorables,
    };
  }

  // ── Mode position : plat, pas de groupement ──
  return {
    totalGames: scopedGames,
    parsedGames: scopedGames,
    filteredGames,
    truncated: truncated || false,
    baselineScore: parseFloat(baselineScore.toFixed(3)),
    rootFen: rootFenNorm,
    positionFiltered: true,
    items: reportItems.slice(0, 500),
  };
}

// ── Précalcul intégral + stockage DB ─────────────────────────────────────────
// Charge toutes les parties, construit la map globale fenNorm → stats,
// supprime l'ancien set de l'utilisateur, et insère tout en DB par chunks.
async function computeAndStoreAllPositions(filters, userId, onPositionProgress, db) {
  // Extract the archive progress callback injected by the route (not a real filter field)
  const { _onArchiveProgress, ...cleanFilters } = filters;

  const { totalGames, truncated, parsedGames } = await ensureGamesLoaded(cleanFilters, _onArchiveProgress || null);
  const message = truncated
    ? `Analyse limitée à ${GAME_LIMIT} parties. Affinez la période ou la cadence pour plus de précision.`
    : '';

  // Construire positionMap : fenNorm → matches[]
  const positionMap = new Map();
  for (const pg of parsedGames) {
    for (const pos of pg.positions) {
      let matches = positionMap.get(pos.fenNorm);
      if (!matches) { matches = []; positionMap.set(pos.fenNorm, matches); }
      matches.push({ san: pos.san, uci: pos.uci, result: pg.result, oppRating: pg.opponentElo });
    }
  }

  const cacheKey    = makeGamesCacheKey(cleanFilters);
  const uniqueFens  = [...positionMap.keys()];
  const total       = uniqueFens.length;

  // Supprimer l'ancien set de l'utilisateur
  await db.deletePlayerStatsForUser(userId);

  // Construire tous les rows puis insérer en une seule transaction
  // (1 requête réseau pour PG, ~ceil(N/200) db.run() pour SQLite)
  if (onPositionProgress) onPositionProgress({ current: 0, total });
  const allRows = uniqueFens.map(fen => ({
    fen,
    data: JSON.stringify({
      moves: aggregateMoves(positionMap.get(fen)),
      totalGames,
      truncated: truncated || false,
      message,
    }),
  }));
  await db.bulkInsertPlayerStats(userId, cacheKey, allRows);
  if (onPositionProgress) onPositionProgress({ current: total, total });

  return { cacheKey, totalPositions: total, totalGames, truncated: truncated || false };
}

module.exports = {
  getChesscomPlayerStats,
  getChesscomPlayerStatsBatch,
  getChesscomReport,
  computeAndStoreAllPositions,
  makeGamesCacheKey,
  normalizeFen,
};
