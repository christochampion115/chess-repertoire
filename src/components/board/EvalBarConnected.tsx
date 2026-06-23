import React from 'react';
import { useAnalysisStore } from '@/stores/analysisStore';
import { useChessStore } from '@/stores/chessStore';
import { useTrainingStore } from '@/stores/trainingStore';
import { EvalBar } from './EvalBar';

/**
 * Store-connected wrapper for EvalBar.
 * Reads isEnabled + first analysis result from analysisStore,
 * and boardFlipped from chessStore.
 */
export const EvalBarConnected = React.memo(function EvalBarConnected() {
  const isEnabled     = useAnalysisStore((s) => s.isEnabled);
  const results       = useAnalysisStore((s) => s.results);
  const boardFlipped  = useChessStore((s) => s.boardFlipped);
  const trainingPhase = useTrainingStore((s) => s.phase);

  if (!isEnabled || results.length === 0 || trainingPhase !== 'idle') return null;

  const first = results[0];
  if (!first) return null;

  return (
    <EvalBar
      cpValue={first.mate != null ? null : first.score}
      mateIn={first.mate}
      boardFlipped={boardFlipped}
    />
  );
});
