/* eslint-disable @typescript-eslint/no-explicit-any */
import { useStatsStore } from '@/stores/statsStore';
import { useChessStore } from '@/stores/chessStore';
import { useAuthStore } from '@/stores/authStore';
import type { LichessStats } from '@/types/stats';

function getStatsRequestKey(fen: string): string {
  const normFen = fen.split(' ').slice(0, 3).join(' ');
  const filters = useStatsStore.getState().filters;
  const eloSeg = `${filters.eloMin}-${filters.eloMax}`;
  const db = filters.currentDatabase;
  if (db === 'player') {
    return `${normFen}|player|${filters.playerUsername}|${filters.playerColor}|${filters.playerTimeClass}|${filters.playerDateFrom}-${filters.playerDateTo}|${filters.playerEloMin}-${filters.playerEloMax}`;
  }
  return `${normFen}|${db}|${eloSeg}`;
}

let pendingRequest: { fen: string; force: boolean } | null = null;
let loading = false;

export async function loadStatsIfNeeded(fen: string, force = false): Promise<void> {
  if (!fen) return;

  const store = useStatsStore.getState();
  const requestKey = getStatsRequestKey(fen);

  // Cache frontal
  if (!force && store.statsCache[requestKey] !== undefined) {
    store.setData(store.statsCache[requestKey] as LichessStats | null);
    store.setSelectedUci('');
    store.setLoading(false);
    store.setLichessStats(store.statsCache[requestKey]);
    store.setLastStatsRequestKey(requestKey);
    return;
  }

  // Même clé — pas de re-fetch
  if (!force && store.lastStatsRequestKey === requestKey) return;

  // Déjà en cours — mémorise la demande
  if (loading) {
    pendingRequest = { fen, force: true };
    return;
  }

  loading = true;
  store.setLoading(true);
  store.setError(null);
  store.setCurrentRequestKey(requestKey);

  const database = store.filters.currentDatabase || 'lichess';

  try {
    let stats: unknown;
    if (database === 'player') {
      if (!store.filters.playerUsername) throw new Error('Nom d\'utilisateur requis');
      stats = await fetchPlayerStats(fen, store.filters);
    } else {
      stats = await fetchLichessStats(fen, {
        min: store.filters.eloMin,
        max: store.filters.eloMax,
      }, database);
    }

    store.setLichessStats(stats);
    store.setLastStatsRequestKey(requestKey);
    store.setSelectedUci('');
    store.setStatsCacheEntry(requestKey, stats);

    store.setData(stats as LichessStats | null);
    store.setSelectedUci('');
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erreur de récupération des statistiques';
    store.setError(msg);
  } finally {
    store.setLoading(false);
    loading = false;
    store.setCurrentRequestKey('');

    // Demande en attente
    const pending = pendingRequest;
    pendingRequest = null;
    if (pending?.fen) {
      await loadStatsIfNeeded(pending.fen, true);
    }
  }
}

export function retryStats(): void {
  const fen = useChessStore.getState().chess.fen();
  if (!fen) return;
  useStatsStore.getState().setLastStatsRequestKey('');
  loadStatsIfNeeded(fen, true);
}

let _reloadTimer: ReturnType<typeof setTimeout> | null = null;
const STATS_RELOAD_DEBOUNCE_MS = 180;

/** Lance un rechargement des stats avec debounce 180 ms (évite les appels en rafale). */
export function scheduleStatsReload(): void {
  const fen = useChessStore.getState().chess.fen();
  if (!fen) return;
  if (_reloadTimer) clearTimeout(_reloadTimer);
  _reloadTimer = setTimeout(() => {
    useStatsStore.getState().setSelectedUci('');
    useStatsStore.getState().setLastStatsRequestKey('');
    loadStatsIfNeeded(fen, true);
  }, STATS_RELOAD_DEBOUNCE_MS);
}

// ─── Fetch functions (migrated from bridge/stats.ts) ────────────────────────

function fetchWithTimeout(url: string, options: any = {}, timeoutMs = 10000) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const { signal: externalSignal, ...restOptions } = options;
  if (controller && externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }
  const signal = controller ? controller.signal : undefined;
  let timer: ReturnType<typeof setTimeout>;
  const fetchPromise = fetch(url, { ...restOptions, signal, mode: 'cors' })
    .finally(() => { if (timer) clearTimeout(timer); });
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      if (controller) controller.abort();
      reject(new Error('Timeout de la requête stat'));
    }, timeoutMs);
  });
  return Promise.race([fetchPromise, timeoutPromise]);
}

function normalizeBaseUrl(url: string) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function buildProxyCandidates(apiPath = '/api/lichess/stats') {
  const candidates: string[] = [];
  const configuredApi = normalizeBaseUrl(import.meta.env.VITE_API_URL ?? '');

  if (configuredApi) {
    candidates.push(`${configuredApi}${apiPath.replace(/^\/api/, '')}`);
  }
  if (window.location && /^https?:$/.test(window.location.protocol)) {
    candidates.push(`${window.location.origin}${apiPath}`);
  }
  if (import.meta.env.DEV) {
    candidates.push(`http://localhost:4000${apiPath}`);
    candidates.push(`http://127.0.0.1:4000${apiPath}`);
  }
  return Array.from(new Set(candidates.map(normalizeBaseUrl).filter(Boolean)));
}

function normalizeRatingsRange(ratingsRange: any = {}) {
  let min = Number.parseInt(ratingsRange.min, 10);
  let max = Number.parseInt(ratingsRange.max, 10);
  if (!Number.isFinite(min)) min = 0;
  if (!Number.isFinite(max)) max = 3000;
  min = Math.min(3000, Math.max(0, min));
  max = Math.min(3000, Math.max(0, max));
  if (min > max) [min, max] = [max, min];
  return { min, max };
}

export async function fetchLichessStats(fen: string, ratingsRange: any = { min: 0, max: 3000 }, database = 'lichess') {
  if (!fen) throw new Error('FEN is required');
  const normalized = normalizeRatingsRange(ratingsRange);
  const proxyCandidates = buildProxyCandidates();
  const networkErrors: string[] = [];
  for (const proxyEndpoint of proxyCandidates) {
    const url = `${proxyEndpoint}?fen=${encodeURIComponent(fen)}&ratings=${normalized.min},${normalized.max}&database=${database}`;
    try {
      const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 12000);
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        console.error('[stats] backend error', response.status, text);
        if (response.status < 500) {
          const error = new Error(`Backend error ${response.status}: ${text}`) as any;
          error.status = response.status;
          throw error;
        }
        throw new Error(`Backend error ${response.status}`);
      }
      return await response.json();
    } catch (error: any) {
      if (error?.status && error.status < 500) throw error;
      const message = error?.message || 'Unknown fetch error';
      networkErrors.push(`${proxyEndpoint}: ${message}`);
    }
  }
  throw new Error(
    import.meta.env.DEV
      ? `Impossible de joindre le backend de statistiques. Vérifiez que le serveur est démarré sur le port 4000. Détails: ${networkErrors.join(' | ')}`
      : `Impossible de joindre le serveur de statistiques. Détails: ${networkErrors.join(' | ')}`,
  );
}

export async function fetchPlayerStats(fen: string, playerFilters: any = {}, signal: AbortSignal | null = null, onProgress: any = null) {
  if (!fen) throw new Error('FEN is required');
  const {
    playerUsername = '',
    playerColor = 'white',
    playerTimeClass = 'all',
    playerDateFrom = '',
    playerDateTo = '',
    playerEloMin = 0,
    playerEloMax = 3000,
  } = playerFilters;

  const params = new URLSearchParams({ fen, username: playerUsername, color: playerColor });
  if (playerTimeClass && playerTimeClass !== 'all') params.set('timeClass', playerTimeClass);
  if (playerDateFrom) params.set('dateFrom', playerDateFrom);
  if (playerDateTo) params.set('dateTo', playerDateTo);
  if (playerEloMin > 0) params.set('eloMin', String(playerEloMin));
  if (playerEloMax < 3000) params.set('eloMax', String(playerEloMax));

  if (onProgress) {
    const sseCandidates = buildProxyCandidates('/api/chesscom/stats/stream');
    const token = useAuthStore.getState().token;
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
    for (const endpoint of sseCandidates) {
      if (signal?.aborted) throw new DOMException('Annulé par l\'utilisateur', 'AbortError');
      const url = `${endpoint}?${params.toString()}`;
      try {
        const response = await fetch(url, { headers: { Accept: 'text/event-stream', ...authHeaders }, signal, mode: 'cors' });
        if (!response.ok) continue;
        const reader = response.body!.getReader();
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
              const data = JSON.parse(line.slice(6));
              if (data.type === 'archive') { onProgress(data); }
              else if (data.type === 'complete') { return data.data; }
              else if (data.type === 'error') { throw new Error(data.error); }
            }
          }
        }
        continue;
      } catch (error: any) {
        if (signal?.aborted || error?.name === 'AbortError') throw error;
        continue;
      }
    }
  }

  const proxyCandidates = buildProxyCandidates('/api/chesscom/stats');
  const networkErrors: string[] = [];
  const token = useAuthStore.getState().token;
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  for (const endpoint of proxyCandidates) {
    if (signal?.aborted) throw new DOMException('Annulé par l\'utilisateur', 'AbortError');
    const url = `${endpoint}?${params.toString()}`;
    const t0 = performance.now();
    try {
      const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json', ...authHeaders }, signal }, 90000);
      const t1 = performance.now();
      console.log(`[stats] GET ${endpoint} → ${response.status} (${Math.round(t1 - t0)}ms)`);
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        console.error('[stats] chesscom backend error', response.status, text);
        throw new Error(`Backend error ${response.status}`);
      }
      return await response.json();
    } catch (error: any) {
      const t1 = performance.now();
      console.log(`[stats] GET ${endpoint} error after ${Math.round(t1 - t0)}ms: ${error.message}`);
      if (signal?.aborted || error?.name === 'AbortError') throw error;
      const message = error?.message || 'Unknown fetch error';
      networkErrors.push(`${endpoint}: ${message}`);
    }
  }

  throw new Error(
    `Impossible de joindre le backend Chess.com. Détails: ${networkErrors.join(' | ')}`
  );
}

export async function fetchPlayerStatsBatch(fens: string[], playerFilters: any = {}) {
  if (!Array.isArray(fens) || fens.length === 0) return {};
  const {
    playerUsername = '',
    playerColor = 'white',
    playerTimeClass = 'all',
    playerDateFrom = '',
    playerDateTo = '',
    playerEloMin = 0,
    playerEloMax = 3000,
  } = playerFilters;

  const body = { fens, username: playerUsername, color: playerColor, timeClass: playerTimeClass, dateFrom: playerDateFrom, dateTo: playerDateTo, eloMin: playerEloMin, eloMax: playerEloMax };
  const proxyCandidates = buildProxyCandidates('/api/chesscom/batchstats');

  for (const endpoint of proxyCandidates) {
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      }, 90000);
      if (!response.ok) continue;
      return await response.json();
    } catch { /* essaie le candidat suivant */ }
  }
  return {};
}

// ─── SSE : précalcul intégral Chess.com (nécessite un compte) ─────────────────
// Retourne les métadonnées du set stocké en DB : { cacheKey, totalPositions, totalGames }.
export async function fetchPlayerStatsLoad(
  playerFilters: any = {},
  signal: AbortSignal | null = null,
  onArchive: ((d: any) => void) | null = null,
  onPositions: ((d: any) => void) | null = null,
): Promise<{ cacheKey: string; totalPositions: number; totalGames: number }> {
  const {
    playerUsername = '',
    playerColor = 'white',
    playerTimeClass = 'all',
    playerDateFrom = '',
    playerDateTo = '',
    playerEloMin = 0,
    playerEloMax = 3000,
  } = playerFilters;

  const params = new URLSearchParams({ username: playerUsername, color: playerColor });
  if (playerTimeClass && playerTimeClass !== 'all') params.set('timeClass', playerTimeClass);
  if (playerDateFrom) params.set('dateFrom', playerDateFrom);
  if (playerDateTo) params.set('dateTo', playerDateTo);
  if (playerEloMin > 0) params.set('eloMin', String(playerEloMin));
  if (playerEloMax < 3000) params.set('eloMax', String(playerEloMax));

  const token = useAuthStore.getState().token;
  if (!token) throw new Error('Connexion requise pour charger les stats joueur');

  const sseCandidates = buildProxyCandidates('/api/chesscom/stats/load/stream');

  for (const endpoint of sseCandidates) {
    if (signal?.aborted) throw new DOMException('Annulé par l\'utilisateur', 'AbortError');
    const url = `${endpoint}?${params.toString()}`;
    try {
      const response = await fetch(url, {
        headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token}` },
        signal,
        mode: 'cors',
      });
      if (!response.ok) {
        if (response.status === 401) throw new Error('Session expirée, veuillez vous reconnecter');
        continue;
      }
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = JSON.parse(line.slice(6));
          if (data.type === 'archive')   { onArchive?.(data); }
          else if (data.type === 'positions') { onPositions?.(data); }
          else if (data.type === 'complete')  { return data; }
          else if (data.type === 'error')     { throw new Error(data.error); }
        }
      }
    } catch (error: any) {
      if (signal?.aborted || error?.name === 'AbortError') throw error;
      if (error?.message?.includes('Session expirée')) throw error;
      // essaie le candidat suivant
    }
  }
  throw new Error('Impossible de joindre le backend pour le chargement des stats joueur');
}
