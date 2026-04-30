const explorerHost = process.env.LICHESS_EXPLORER_HOST || 'https://explorer.lichess.org';
const explorerToken = process.env.LICHESS_EXPLORER_TOKEN || '';

const RATING_MIN = 0;
const RATING_MAX = 3000;

function buildHeaders() {
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'AlphaChess/1.0 (contact: christophe)'
  };
  if (explorerToken) {
    headers['Authorization'] = `Bearer ${explorerToken}`;
  }
  return headers;
}


function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  if (typeof fetch === 'undefined') {
    throw new Error('Fetch API non disponible sur ce runtime Node.js');
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const signal = controller ? controller.signal : undefined;
  let timer;

  const fetchPromise = fetch(url, { ...options, signal });
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      if (controller) controller.abort();
      reject(new Error('Timeout de la requête Lichess')); 
    }, timeoutMs);
  });

  return Promise.race([fetchPromise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
async function fetchJson(url) {
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: buildHeaders()
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const msg = `Lichess proxy erreur ${response.status} ${response.statusText}${text ? `: ${text}` : ''}`;
    const error = new Error(msg);
    error.status = response.status;
    throw error;
  }

  return response.json();
}


function moveGames(move) {
  return move.games ?? ((move.white || 0) + (move.black || 0) + (move.draws || 0));
}

function mergeMove(move, moveMap) {
  if (!move || !move.uci) return;
  const key = move.uci;
  const existing = moveMap.get(key) || {
    san: move.san || '',
    uci: move.uci,
    white: 0,
    black: 0,
    draws: 0,
    frequency: 0,
    ratingSum: 0,
    ratingCount: 0
  };

  if (move.san) {
    existing.san = move.san;
  }

  const games = moveGames(move);
  existing.white += move.white || 0;
  existing.black += move.black || 0;
  existing.draws += move.draws || 0;
  existing.frequency += games;

  if (move.averageRating && games > 0) {
    existing.ratingSum += move.averageRating * games;
    existing.ratingCount += games;
  }

  moveMap.set(key, existing);
}

function normalizeMoves(mastersData, lichessData) {
  const moveMap = new Map();
  (mastersData.moves || []).forEach((move) => mergeMove(move, moveMap));
  (lichessData.moves || []).forEach((move) => mergeMove(move, moveMap));

  return Array.from(moveMap.values()).map((move) => ({
    san: move.san,
    uci: move.uci,
    white: move.white,
    black: move.black,
    draws: move.draws,
    averageRating: move.ratingCount ? Math.round(move.ratingSum / move.ratingCount) : 0,
    frequency: move.frequency
  })).sort((a, b) => (b.frequency || 0) - (a.frequency || 0));
}

// ─── Buckets de rating Lichess Explorer ────────────────────────────────────
// L'API /lichess n'accepte PAS une plage min-max arbitraire.
// Elle accepte une liste de valeurs discrètes, chacune étant la borne inférieure
// d'un palier de ~200 Elo. Envoyer uniquement min,max revient à ne requêter
// que 2 buckets au lieu de tous les buckets intermédiaires.
const LICHESS_RATING_BUCKETS = [0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500];
const LICHESS_BUCKET_UPPER   = [1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500, Infinity];

/**
 * Convertit une plage [min, max] en liste de buckets Lichess valides.
 * Un bucket B est inclus si sa plage [B, upper) chevauche [min, max].
 * Retourne null si tous les buckets sont inclus → omettre le paramètre ratings
 * (= Lichess renvoie toutes les parties, comportement "Any rating").
 */
function getRatingBuckets(min, max) {
  const selected = LICHESS_RATING_BUCKETS.filter((b, i) =>
    b <= max && LICHESS_BUCKET_UPPER[i] > min
  );
  // Tous les buckets sélectionnés → pas de filtre = toutes les parties
  if (selected.length >= LICHESS_RATING_BUCKETS.length) return null;
  return selected;
}

function normalizeRatings(rawRatings) {
  if (typeof rawRatings !== 'string' || !rawRatings.trim()) {
    return { min: RATING_MIN, max: RATING_MAX };
  }

  const [minRaw, maxRaw] = rawRatings.split(',');
  let min = Number.parseInt(minRaw, 10);
  let max = Number.parseInt(maxRaw, 10);

  if (!Number.isFinite(min)) min = RATING_MIN;
  if (!Number.isFinite(max)) max = RATING_MAX;

  min = Math.min(RATING_MAX, Math.max(RATING_MIN, min));
  max = Math.min(RATING_MAX, Math.max(RATING_MIN, max));

  if (min > max) {
    [min, max] = [max, min];
  }

  return { min, max };
}

async function fetchLichessStats(fen, rawRatings, database = 'lichess') {
  if (!fen) {
    throw new Error('FEN requis');
  }

  const mastersUrl = `${explorerHost}/masters?fen=${encodeURIComponent(fen)}`;

  let mastersData = {};
  let lichessData = {};
  const errors = [];

  // La base masters est toujours consultée (sauf en mode lichess pur, mais on la garde
  // pour la cohérence d'ouverture — sauf si on est explicitement en mode 'masters').
  // En mode 'masters' : on ne consulte QUE l'endpoint /masters (sans filtre Elo).
  // En mode 'lichess' : comportement inchangé (masters + lichess fusionnés).
  try {
    mastersData = await fetchJson(mastersUrl);
  } catch (error) {
    errors.push(`Masters: ${error.message}`);
  }

  if (database !== 'masters') {
    // Convertir la plage [min, max] en buckets Lichess valides
    const ratings = normalizeRatings(rawRatings);
    const buckets = getRatingBuckets(ratings.min, ratings.max);
    const ratingsQs = buckets ? `&ratings=${buckets.join(',')}` : '';
    const lichessUrl = `${explorerHost}/lichess?fen=${encodeURIComponent(fen)}${ratingsQs}`;
    try {
      lichessData = await fetchJson(lichessUrl);
    } catch (error) {
      errors.push(`Lichess: ${error.message}`);
    }
  }

  if ((!mastersData || !mastersData.moves) && (!lichessData || !lichessData.moves)) {
    return {
      openingName: '',
      eco: '',
      moves: [],
      fallback: true,
      message: errors.length ? errors.join(' | ') : 'Aucune donnée disponible pour cette position.'
    };
  }

  const openingName = mastersData.openingName || (mastersData.opening && mastersData.opening.name) || '';
  const eco = mastersData.eco || (mastersData.opening && mastersData.opening.eco) || '';

  return {
    openingName,
    eco,
    moves: normalizeMoves(mastersData, lichessData),
    fallback: false,
    message: errors.length ? errors.join(' | ') : ''
  };
}

module.exports = {
  fetchLichessStats
};
