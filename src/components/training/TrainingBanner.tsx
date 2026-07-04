import React from 'react';
import { useTrainingStore } from '@/stores/trainingStore';
import { useUiStore } from '@/stores/uiStore';
import type { TrainingMode } from '@/types/training';

const MODE_LABEL: Record<TrainingMode, string> = {
  survival:   'Survie',
  vertical:   'Vertical',
  horizontal: 'Horizontal',
  express:    'Express',
  randomizer: 'Aléatoire',
};

export const TrainingBanner = React.memo(function TrainingBanner() {
  const phase     = useTrainingStore((s) => s.phase);
  const mode      = useTrainingStore((s) => s.mode);
  const openModal = useUiStore((s) => s.openModal);

  return (
    <div id="training-banner" style={{ display: phase === 'idle' ? 'none' : 'flex' }}>
      <div className="training-banner-label">
        Mode entrainement : {MODE_LABEL[mode]}
      </div>
      <button
        className="training-banner-stop"
        id="btn-training-stop"
        onClick={() => openModal({ type: 'training-stop' })}
      >
        Terminer l&rsquo;entraînement
      </button>
    </div>
  );
});
