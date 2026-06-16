import React from 'react';
import { useChessStore } from '@/stores/chessStore';
import { useRepertoireStore } from '@/stores/repertoireStore';
import { useTrainingStore } from '@/stores/trainingStore';
import { useUiStore } from '@/stores/uiStore';
import { guardTrainingInterruption } from '@/services/training';
import * as repertoireService from '@/services/repertoire';

export const BoardControls = React.memo(function BoardControls() {
  const flipBoard      = useChessStore((s) => s.flipBoard);
  const openModal      = useUiStore((s) => s.openModal);

  const trainingPhase  = useTrainingStore((s) => s.phase);
  const isTraining     = trainingPhase !== 'idle';

  const currentNodeId  = useRepertoireStore((s) => s.currentNodeId);
  const repertoires    = useRepertoireStore((s) => s.repertoires);
  const activeRepIndex = useRepertoireStore((s) => s.activeRepIndex);
  const freePlayRoot   = useRepertoireStore((s) => s.freePlayRoot);

  const rootId = activeRepIndex >= 0 ? repertoires[activeRepIndex]?.id : freePlayRoot?.id;
  const canGoBack = currentNodeId !== null && currentNodeId !== rootId;

  return (
    <div className="board-controls">
      <button className="ctrl-btn" id="btn-reset-position" onClick={() => guardTrainingInterruption('Réinitialiser', 'Un entraînement est en cours. Voulez-vous l\'interrompre ?', () => repertoireService.resetPosition())} title="Réinitialiser">⟲</button>
      <button
        className="ctrl-btn"
        id="btn-nav-back"
        onClick={() => repertoireService.navBack()}
        title="Coup précédent"
        disabled={isTraining || !canGoBack}
      >←</button>
      <button className="ctrl-btn" id="btn-nav-forward" onClick={() => repertoireService.navForward()} title="Coup suivant" disabled={isTraining}>→</button>
      <button className="ctrl-btn" id="btn-flip-board" onClick={flipBoard} title="Retourner le plateau">↕</button>
      <button className="ctrl-btn" id="btn-open-board-theme" onClick={() => openModal({ type: 'board-theme' })} title="Changer le thème">🎨</button>
    </div>
  );
});
