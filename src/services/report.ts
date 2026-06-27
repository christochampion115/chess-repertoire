import type { ReportParams, ReportData, ReportProgress, SavedReportMeta } from '@/types/report';
import { useAuthStore } from '@/stores/authStore';

function normalizeBaseUrl(url: string): string {
  return String(url || '').trim().replace(/\/+$/, '');
}

function buildApiBase(): string {
  const configured = normalizeBaseUrl(import.meta.env.VITE_API_URL ?? '');
  if (configured) return configured;
  if (window.location && /^https?:$/.test(window.location.protocol)) {
    return `${window.location.origin}/api`;
  }
  return 'http://localhost:4000/api';
}

// Vérification : le canonical (true si VITE_API_URL fourni au build)
let apiBase;
function getApiBase(): string {
  if (apiBase === undefined) {
    apiBase = buildApiBase();
    console.log('[REPORT] API_BASE =', apiBase, '| VITE_API_URL =', import.meta.env.VITE_API_URL);
  }
  return apiBase;
}

export function estimateDuration(dateFrom?: string, dateTo?: string): number {
  let months = 12;
  if (dateFrom && dateTo) {
    const d1 = new Date(dateFrom + '-01');
    const d2 = new Date(dateTo + '-01');
    if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
      months = Math.max(1, (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24 * 30));
    }
  } else if (dateFrom) {
    const now = new Date();
    const d1 = new Date(dateFrom + '-01');
    if (!isNaN(d1.getTime())) months = Math.max(1, (now.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24 * 30));
  }
  return Math.min(90, Math.round(15 + months * 3));
}

export function buildReportUrl(params: ReportParams): string {
  const url = new URL(`${getApiBase()}/chesscom/report/stream`);
  url.searchParams.set('username', params.username);
  url.searchParams.set('color', params.color);
  url.searchParams.set('timeClass', params.timeClass);
  if (params.dateFrom) url.searchParams.set('dateFrom', params.dateFrom);
  if (params.dateTo) url.searchParams.set('dateTo', params.dateTo);
  if (params.eloMin > 0) url.searchParams.set('eloMin', String(params.eloMin));
  if (params.eloMax < 3000) url.searchParams.set('eloMax', String(params.eloMax));
  if (params.startFen) url.searchParams.set('startFen', params.startFen);
  url.searchParams.set('minFreq', '3');
  return url.toString();
}

export async function fetchChesscomReport(
  params: ReportParams,
  onProgress?: (evt: ReportProgress) => void,
  signal?: AbortSignal
): Promise<ReportData> {
  const url = buildReportUrl(params);

  console.log('[REPORT FETCH] URL:', url);

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'text/event-stream' },
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.log('[REPORT FETCH] HTTP error', res.status, 'body:', text.slice(0, 500));
    throw new Error(`Erreur serveur ${res.status}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const raw = line.slice(6);
        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          console.error('[SSE PARSE ERROR] raw data:', raw.slice(0, 1000));
          throw new Error('Réponse SSE invalide du serveur');
        }
        if (data.type === 'archive' || data.type === 'phase') {
          onProgress?.(data);
        } else if (data.type === 'complete') {
          console.log('SSE_RAW:', JSON.stringify(data.data).slice(0, 2000));
          return data.data;
        } else if (data.type === 'error') {
          throw new Error(data.error);
        }
      }
    }
  }
  throw new Error('Connexion interrompue');
}

export async function fetchChesscomReportJSON(params: ReportParams): Promise<ReportData> {
  const url = new URL(`${getApiBase()}/chesscom/report`);
  url.searchParams.set('username', params.username);
  url.searchParams.set('color', params.color);
  url.searchParams.set('timeClass', params.timeClass);
  if (params.dateFrom) url.searchParams.set('dateFrom', params.dateFrom);
  if (params.dateTo) url.searchParams.set('dateTo', params.dateTo);
  if (params.eloMin > 0) url.searchParams.set('eloMin', String(params.eloMin));
  if (params.eloMax < 3000) url.searchParams.set('eloMax', String(params.eloMax));
  if (params.startFen) url.searchParams.set('startFen', params.startFen);

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `Erreur ${res.status}` }));
    throw new Error(err.error || `Erreur serveur ${res.status}`);
  }

  return res.json();
}

export async function saveReportToServer(params: ReportParams, data: ReportData) {
  const base = getApiBase();
  const token = useAuthStore.getState().token;
  if (!token) return null;
  const url = `${base}/chesscom/report/save`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ params, data }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[SAVE ERROR]', url, res.status, text.slice(0, 500));
    throw new Error('Erreur lors de la sauvegarde du rapport');
  }
  const text = await res.text();
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    console.error('[SAVE] réponse non-JSON, body:', text.slice(0, 500));
    throw new Error('Réponse invalide du serveur (sauvegarde)');
  }
  return JSON.parse(text);
}

export async function fetchSavedReports(): Promise<SavedReportMeta[]> {
  const base = getApiBase();
  const token = useAuthStore.getState().token;
  if (!token) return [];
  const url = `${base}/chesscom/report/saved`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[FETCH SAVED ERROR]', url, res.status, text.slice(0, 500));
    throw new Error('Erreur lors du chargement des rapports');
  }
  const text = await res.text();
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    console.error('[FETCH SAVED] réponse non-JSON, body:', text.slice(0, 500));
    return [];
  }
  return JSON.parse(text);
}

export async function fetchSavedReportById(id: number) {
  const base = getApiBase();
  const token = useAuthStore.getState().token;
  const url = `${base}/chesscom/report/saved/${id}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[FETCH SAVED BY ID ERROR]', url, res.status, text.slice(0, 500));
    throw new Error('Erreur lors du chargement du rapport');
  }
  const text = await res.text();
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    console.error('[FETCH SAVED BY ID] réponse non-JSON, body:', text.slice(0, 500));
    throw new Error('Réponse invalide du serveur (chargement)');
  }
  return JSON.parse(text);
}

export async function deleteSavedReportOnServer(id: number) {
  const base = getApiBase();
  const token = useAuthStore.getState().token;
  const url = `${base}/chesscom/report/saved/${id}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Erreur lors de la suppression du rapport');
}
