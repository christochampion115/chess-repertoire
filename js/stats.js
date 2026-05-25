function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;

  // Lier un signal externe au contrôleur interne (support annulation)
  const { signal: externalSignal, ...restOptions } = options;
  if (controller && externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  const signal = controller ? controller.signal : undefined;
  let timer;

  const fetchPromise = fetch(url, { ...restOptions, signal, mode: 'cors' })
    .finally(() => {
      if (timer) clearTimeout(timer);
    });

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      if (controller) controller.abort();
      reject(new Error('Timeout de la requête stat'));
    }, timeoutMs);
  });

  return Promise.race([fetchPromise, timeoutPromise]);
}

function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function buildProxyCandidates(apiPath = '/api/lichess/stats') {
  const candidates = [];
  const configuredProxy = normalizeBaseUrl(window.LICHESS_STATS_PROXY_URL);
  const configuredApi = normalizeBaseUrl(window.ALPHA_CHESS_API_URL);

  if (configuredProxy && apiPath === '/api/lichess/stats') {
    candidates.push(configuredProxy);
  }

  if (configuredApi) {
    candidates.push(`${configuredApi}${apiPath.replace(/^\/api/, '')}`);
  }

  candidates.push(`http://localhost:4000${apiPath}`);
  candidates.push(`http://127.0.0.1:4000${apiPath}`);

  if (window.location && /^https?:$/.test(window.location.protocol)) {
    candidates.push(`${window.location.origin}${apiPath}`);
  }

  return Array.from(new Set(candidates.map(normalizeBaseUrl).filter(Boolean)));
}

function normalizeRatingsRange(ratingsRange = {}) {
  let min = Number.parseInt(ratingsRange.min, 10);
  let max = Number.parseInt(ratingsRange.max, 10);

  if (!Number.isFinite(min)) min = 0;
  if (!Number.isFinite(max)) max = 3000;

  min = Math.min(3000, Math.max(0, min));
  max = Math.min(3000, Math.max(0, max));

  if (min > max) {
    [min, max] = [max, min];
  }

  return { min, max };
}

export async function fetchLichessStats(fen, ratingsRange = { min: 0, max: 3000 }, database = 'lichess') {
  if (!fen) {
    throw new Error('FEN is required');
  }

  const normalized = normalizeRatingsRange(ratingsRange);

  const proxyCandidates = buildProxyCandidates();
  const networkErrors = [];

  for (const proxyEndpoint of proxyCandidates) {
    const url = `${proxyEndpoint}?fen=${encodeURIComponent(fen)}&ratings=${normalized.min},${normalized.max}&database=${database}`;

    try {
      const response = await fetchWithTimeout(url, {
        headers: {
          Accept: 'application/json'
        }
      }, 12000);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        console.error('[stats] backend error', response.status, text);
        throw new Error(`Backend error ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      const message = error && error.message ? error.message : 'Unknown fetch error';
      networkErrors.push(`${proxyEndpoint}: ${message}`);
    }
  }

  throw new Error(
    `Impossible de joindre le backend de statistiques. Verifie que le serveur Node.js est demarre sur le port 4000. Détails: ${networkErrors.join(' | ')}`
  );
}

export async function fetchPlayerStats(fen, playerFilters = {}, signal = null) {
  if (!fen) throw new Error('FEN is required');

  const {
    playerUsername = '',
    playerColor = 'white',
    playerTimeClass = 'all',
    playerDateFrom = '',
    playerDateTo = '',
    playerEloMin = 0,
    playerEloMax = 3000
  } = playerFilters;

  const params = new URLSearchParams({ fen, username: playerUsername, color: playerColor });
  if (playerTimeClass && playerTimeClass !== 'all') params.set('timeClass', playerTimeClass);
  if (playerDateFrom) params.set('dateFrom', playerDateFrom);
  if (playerDateTo) params.set('dateTo', playerDateTo);
  if (playerEloMin > 0) params.set('eloMin', String(playerEloMin));
  if (playerEloMax < 3000) params.set('eloMax', String(playerEloMax));

  const proxyCandidates = buildProxyCandidates('/api/chesscom/stats');
  const networkErrors = [];

  for (const endpoint of proxyCandidates) {
    if (signal?.aborted) {
      throw new DOMException('Annulé par l\'utilisateur', 'AbortError');
    }
    const url = `${endpoint}?${params.toString()}`;
    try {
      const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' }, signal }, 90000);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        console.error('[stats] chesscom backend error', response.status, text);
        throw new Error(`Backend error ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') throw error;
      const message = error && error.message ? error.message : 'Unknown fetch error';
      networkErrors.push(`${endpoint}: ${message}`);
    }
  }

  throw new Error(
    `Impossible de joindre le backend Chess.com. Détails: ${networkErrors.join(' | ')}`
  );
}

export async function fetchPlayerStatsBatch(fens, playerFilters = {}) {
  if (!Array.isArray(fens) || fens.length === 0) return {};

  const {
    playerUsername = '',
    playerColor = 'white',
    playerTimeClass = 'all',
    playerDateFrom = '',
    playerDateTo = '',
    playerEloMin = 0,
    playerEloMax = 3000
  } = playerFilters;

  const body = {
    fens,
    username:  playerUsername,
    color:     playerColor,
    timeClass: playerTimeClass,
    dateFrom:  playerDateFrom,
    dateTo:    playerDateTo,
    eloMin:    playerEloMin,
    eloMax:    playerEloMax
  };

  const proxyCandidates = buildProxyCandidates('/api/chesscom/batchstats');

  for (const endpoint of proxyCandidates) {
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body)
      }, 90000);
      if (!response.ok) continue;
      return await response.json();
    } catch (_) { /* essaie le candidat suivant */ }
  }
  return {}; // silence — navigation reste fonctionnelle, juste sans prefetch
}
