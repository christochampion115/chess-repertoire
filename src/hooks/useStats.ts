import { useEffect, useRef } from 'react';
import { useChessStore } from '@/stores/chessStore';
import { useStatsStore } from '@/stores/statsStore';
import { loadStatsIfNeeded } from '@/services/stats';

/**
 * Charge automatiquement les stats à chaque changement de position.
 * À brancher dans AppLayout (ou tout composant monté en permanence).
 */
export function useStatsAutoLoad(): void {
  const fen = useChessStore((s) => s.chess.fen());
  const database = useStatsStore((s) => s.filters.currentDatabase);
  const lastFen = useRef('');

  useEffect(() => {
    if (!fen || fen === lastFen.current) return;
    lastFen.current = fen;
    loadStatsIfNeeded(fen);
  }, [fen, database]);
}
