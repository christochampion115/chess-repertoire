function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const signal = controller ? controller.signal : undefined;
  let timer;

  const fetchPromise = fetch(url, { ...options, signal, mode: 'cors' })
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

function buildProxyCandidates() {
  const candidates = [];
  const configuredProxy = normalizeBaseUrl(window.LICHESS_STATS_PROXY_URL);
  const configuredApi = normalizeBaseUrl(window.ALPHA_CHESS_API_URL);

  if (configuredProxy) {
    candidates.push(configuredProxy);
  }

  if (configuredApi) {
    candidates.push(`${configuredApi}/lichess/stats`);
  }

  candidates.push('http://localhost:4000/api/lichess/stats');
  candidates.push('http://127.0.0.1:4000/api/lichess/stats');

  if (window.location && /^https?:$/.test(window.location.protocol)) {
    candidates.push(`${window.location.origin}/api/lichess/stats`);
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
