import { useStatsStore } from '@/stores/statsStore';
import { useChessStore } from '@/stores/chessStore';
import { fetchLichessStats, fetchPlayerStats } from '@/bridge/stats';
import { state } from '@/bridge/state';
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
  if (!force && state.statsCache?.has(requestKey)) {
    store.setData(state.statsCache.get(requestKey));
    store.setSelectedUci('');
    store.setLoading(false);
    state.lichessStats = state.statsCache.get(requestKey);
    state.lastStatsRequestKey = requestKey;
    return;
  }

  // Même clé — pas de re-fetch
  if (!force && state.lastStatsRequestKey === requestKey) return;

  // Déjà en cours — mémorise la demande
  if (loading) {
    pendingRequest = { fen, force: true };
    return;
  }

  loading = true;
  store.setLoading(true);
  store.setError(null);
  store.setCurrentRequestKey(requestKey);
  state.currentStatsRequestKey = requestKey;
  state.statsError = null;

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

    state.lichessStats = stats;
    state.lastStatsRequestKey = requestKey;
    state.statsSelectedUci = '';
    if (state.statsCache) state.statsCache.set(requestKey, stats);

    store.setData(stats as LichessStats | null);
    store.setSelectedUci('');
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erreur de récupération des statistiques';
    state.statsError = msg;
    store.setError(msg);
  } finally {
    store.setLoading(false);
    loading = false;
    state.statsLoading = false;
    state.currentStatsRequestKey = '';

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
  state.lastStatsRequestKey = '';
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
    state.lastStatsRequestKey = '';
    loadStatsIfNeeded(fen, true);
  }, STATS_RELOAD_DEBOUNCE_MS);
}
