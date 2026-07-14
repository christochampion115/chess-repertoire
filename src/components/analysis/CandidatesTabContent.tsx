import React from 'react';
import { useStatsStore } from '@/stores/statsStore';
import { StatsFilterBar } from '@/components/analysis/StatsFilterBar';
import { CandidatesSection } from '@/components/analysis/CandidatesSection';
import { useTrainingStore } from '@/stores/trainingStore';

export const CandidatesTabContent = React.memo(function CandidatesTabContent() {
  const candidatesOpen = useStatsStore((s) => s.filters.candidatesOpen);
  const setFilter      = useStatsStore((s) => s.setFilter);
  const trainingPhase  = useTrainingStore((s) => s.phase);
  const isTraining     = trainingPhase !== 'idle';

  if (isTraining) {
    return <div className="panel-empty">Indisponible pendant l'entraînement</div>;
  }

  return (
    <div className="mobile-candidates-tab">
      <button
        type="button"
        className="cands-toggle-btn"
        aria-expanded={candidatesOpen ? 'true' : 'false'}
        aria-controls="mobile-cands-body"
        onClick={() => setFilter('candidatesOpen', !candidatesOpen)}
      >
        <span>COUPS CANDIDATS</span>
        <span className="cands-arrow">▶</span>
      </button>
      <div className={`cands-body${candidatesOpen ? '' : ' is-collapsed'}`} id="mobile-cands-body">
        <div className="stats-filter-shell">
          <StatsFilterBar />
        </div>
        <CandidatesSection />
      </div>
    </div>
  );
});
