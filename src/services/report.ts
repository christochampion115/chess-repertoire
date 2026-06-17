import type { ReportParams, ReportData, ReportProgress } from '@/types/report';

function normalizeBaseUrl(url: string): string {
  return String(url || '').trim().replace(/\/+$/, '');
}

function buildApiBase(): string {
  const configured = normalizeBaseUrl((window as Record<string, string>).ALPHA_CHESS_API_URL ?? '');
  if (configured) return configured;
  if (window.location && /^https?:$/.test(window.location.protocol)) {
    return `${window.location.origin}/api`;
  }
  return 'http://localhost:4000/api';
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
  const apiBase = buildApiBase();
  const url = new URL(`${apiBase}/chesscom/report/stream`);
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

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'text/event-stream' },
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `Erreur ${res.status}` }));
    throw new Error(err.error || `Erreur serveur ${res.status}`);
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
        const data = JSON.parse(raw);
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
  const apiBase = buildApiBase();
  const url = new URL(`${apiBase}/chesscom/report`);
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
