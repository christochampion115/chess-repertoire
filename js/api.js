let preferredApiBaseUrl = '';

function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function buildApiCandidates() {
  const candidates = [];
  const preferred = normalizeBaseUrl(preferredApiBaseUrl);
  const configured = normalizeBaseUrl(window.ALPHA_CHESS_API_URL);

  if (preferred) {
    candidates.push(preferred);
  }

  if (configured) {
    candidates.push(configured);
  }

  candidates.push('http://localhost:4000/api');
  candidates.push('http://127.0.0.1:4000/api');

  if (window.location && /^https?:$/.test(window.location.protocol)) {
    candidates.push(`${window.location.origin}/api`);
  }

  return Array.from(new Set(candidates.map(normalizeBaseUrl).filter(Boolean)));
}

function buildUrl(baseUrl, path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

async function readErrorMessage(response) {
  const text = await response.text().catch(() => '');
  if (!text) {
    return `Erreur HTTP ${response.status}`;
  }

  try {
    const data = JSON.parse(text);
    return data.error || data.message || text;
  } catch {
    return text;
  }
}

export async function apiRequest(path, { method = 'GET', token = '', body } = {}) {
  window.DEBUG_MODE && console.log('[DEBUG]', { step: 'apiRequest:start', method, path, hasToken: !!token, hasBody: !!body });
  const apiCandidates = buildApiCandidates();
  const networkErrors = [];

  for (const baseUrl of apiCandidates) {
    const url = buildUrl(baseUrl, path);

    try {
      const response = await fetch(url, {
        method,
        mode: 'cors',
        headers: {
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });

      if (!response.ok) {
        if (response.status === 404 || response.status === 405) {
          networkErrors.push(`${url}: HTTP ${response.status}`);
          continue;
        }

        const error = new Error(await readErrorMessage(response));
        error.status = response.status;
        window.DEBUG_MODE && console.log('[DEBUG]', { step: 'apiRequest:error', method, path, url, status: response.status, message: error.message });
        throw error;
      }

      if (response.status === 204) {
        window.DEBUG_MODE && console.log('[DEBUG]', { step: 'apiRequest:ok', method, path, url, status: 204 });
        preferredApiBaseUrl = baseUrl;
        return null;
      }

      const contentType = response.headers.get('content-type') || '';
      window.DEBUG_MODE && console.log('[DEBUG]', { step: 'apiRequest:ok', method, path, url, status: response.status });
      preferredApiBaseUrl = baseUrl;
      return contentType.includes('application/json')
        ? response.json()
        : null;
    } catch (error) {
      if (typeof error?.status === 'number') {
        throw error;
      }

      networkErrors.push(`${url}: ${error?.message || 'Network error'}`);
    }
  }

  throw new Error(
    `Impossible de joindre le backend Alpha Chess. Verifie que le serveur Node.js est demarre sur le port 4000. Details: ${networkErrors.join(' | ')}`
  );
}

