import React from 'react';
import { RepertoirePanel } from '@/components/repertoire/RepertoirePanel';
import { TreePanel } from '@/components/repertoire/TreePanel';
import { useRepertoireStore } from '@/stores/repertoireStore';
import { useTrainingStore } from '@/stores/trainingStore';

/**
 * Colonne gauche : accordéons Répertoires + Arbre des coups.
 * Verrouillés (collapsed + locked message) pendant l'entraînement.
 */
export const Sidebar = React.memo(function Sidebar() {
  const openPanels    = useRepertoireStore((s) => s.openPanels);
  const togglePanel   = useRepertoireStore((s) => s.togglePanel);
  const trainingPhase = useTrainingStore((s) => s.phase);
  const isTraining    = trainingPhase !== 'idle';

  const handleToggle = (_panel: 'repertoire' | 'arbre') => {
    if (isTraining) return;
    togglePanel(_panel);
  };

  return (
    <div className="accordion">

      {/* ── Répertoires ─────────────────────────────── */}
      <div className="accordion-item">
        <div
          className={`accordion-header${!isTraining && openPanels.repertoire ? ' active' : ''}`}
          data-panel="repertoire"
          role="button"
          tabIndex={0}
          onClick={() => handleToggle('repertoire')}
          onKeyDown={(e) => e.key === 'Enter' && handleToggle('repertoire')}
        >
          <span>RÉPERTOIRES</span>
          <span className="accordion-icon">▶</span>
        </div>
        <div className={`accordion-content${!isTraining && openPanels.repertoire ? ' open' : ''}`}>
          <RepertoirePanel />
        </div>
      </div>

      {/* ── Arbre des coups ─────────────────────────── */}
      <div className="accordion-item">
        <div
          className={`accordion-header${!isTraining && openPanels.arbre ? ' active' : ''}`}
          data-panel="arbre"
          role="button"
          tabIndex={0}
          onClick={() => handleToggle('arbre')}
          onKeyDown={(e) => e.key === 'Enter' && handleToggle('arbre')}
        >
          <span>ARBRE</span>
          <span className="accordion-icon">▶</span>
        </div>
        <div className={`accordion-content${!isTraining && openPanels.arbre ? ' open' : ''}`}>
          <TreePanel />
        </div>
      </div>

    </div>
  );
});
