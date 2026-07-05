/* eslint-disable @typescript-eslint/no-explicit-any */
let preferredApiBaseUrl = '';

function normalizeBaseUrl(url: string): string {
  return String(url || '').trim().replace(/\/+$/, '');
}

function buildApiCandidates(): string[] {
  const candidates: string[] = [];
  const preferred = normalizeBaseUrl(preferredApiBaseUrl);
  const configured = normalizeBaseUrl(import.meta.env.VITE_API_URL ?? '');

  if (preferred) candidates.push(preferred);
  if (configured) candidates.push(configured);

  if (window.location && /^https?:$/.test(window.location.protocol)) {
    candidates.push(`${window.location.origin}/api`);
  }

  candidates.push('http://localhost:4000/api');
  candidates.push('http://127.0.0.1:4000/api');

  return Array.from(new Set(candidates.map(normalizeBaseUrl).filter(Boolean)));
}

function buildUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text) return `Erreur HTTP ${response.status}`;
  try {
    const data = JSON.parse(text);
    return data.error || data.message || text;
  } catch {
    return text;
  }
}

interface ApiRequestOptions {
  method?: string;
  token?: string;
  body?: unknown;
}

export async function apiRequest(
  path: string,
  { method = 'GET', token = '', body }: ApiRequestOptions = {},
): Promise<any> {
  const apiCandidates = buildApiCandidates();
  const networkErrors: string[] = [];

  for (const baseUrl of apiCandidates) {
    const url = buildUrl(baseUrl, path);

    try {
      const response = await fetch(url, {
        method,
        mode: 'cors',
        headers: {
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      if (!response.ok) {
        if (response.status === 401) {
          const error = new Error(await readErrorMessage(response)) as any;
          error.status = 401;
          throw error;
        }
        networkErrors.push(`${url}: HTTP ${response.status}`);
        continue;
      }

      if (response.status === 204) {
        preferredApiBaseUrl = baseUrl;
        return null;
      }

      const contentType = response.headers.get('content-type') || '';
      preferredApiBaseUrl = baseUrl;
      return contentType.includes('application/json') ? response.json() : null;
    } catch (error: any) {
      if (error?.status === 401) throw error;
      networkErrors.push(`${url}: ${error?.message || 'Network error'}`);
    }
  }

  throw new Error(
    `Impossible de joindre le backend Blundertale. Vérifie que le serveur Node.js est démarré sur le port 4000. Détails: ${networkErrors.join(' | ')}`,
  );
}
