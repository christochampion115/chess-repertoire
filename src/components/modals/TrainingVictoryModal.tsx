import { useUiStore } from '@/stores/uiStore';
import { retrySurvivalVictory, getMedalIcon, getMedalLabel } from '@/services/training';
import { ModalBox } from './ModalBox';
import type { MedalTier, SurvivalReport } from '@/types/training';
import { SURVIVAL_LIVES } from '@/types/training';

export function TrainingVictoryModal() {
  const modal = useUiStore((s) => s.activeModal);
  const closeModal = useUiStore((s) => s.closeModal);

  if (modal?.type !== 'training-victory') return null;
  const data = modal as { type: 'training-victory'; report: SurvivalReport; earnedMeta?: { tier: MedalTier; shine: number; label: string; icon: string } | null };
  const { report, earnedMeta } = data;

  const mistakesCount = report.mistakes?.length ?? 0;

  return (
    <ModalBox title="Victoire !" onClose={closeModal}>
      <div className="survival-defeat-summary">
        <div className="survival-defeat-score">
          Score final: <b>{report.completed ?? report.score}/{report.totalTargets}</b>
        </div>
        <div className="survival-monitor-hearts" style={{ margin: '4px 0' }}>
          {(() => {
            const els: React.ReactNode[] = [];
            for (let i = 0; i < SURVIVAL_LIVES; i++) {
              const full = i < (report.livesLeft ?? 0);
              els.push(
                <span key={i} className={`survival-heart ${full ? '' : 'is-empty'}`}>
                  {full ? '♥' : '♡'}
                </span>
              );
            }
            if (report.goldenHeart) {
              els.push(
                <span key="golden" className="survival-heart is-golden">♥</span>
              );
            }
            return els;
          })()}
        </div>
        <div className="survival-earned-medal">
          {earnedMeta ? (
            <>
              <span className={`rep-medal-badge tier-${earnedMeta.tier}`} data-shine={earnedMeta.shine}>{earnedMeta.icon}</span>
              <span className="survival-earned-medal-label">{earnedMeta.label}</span>
            </>
          ) : (
            <>
              <span className="rep-medal-badge">{getMedalIcon('none')}</span>
              <span className="survival-earned-medal-label">{getMedalLabel('none')}</span>
            </>
          )}
        </div>
        {mistakesCount === 0 ? (
          <div className="survival-defeat-empty" style={{ color: '#4ade80' }}>
            Aucune erreur — performance parfaite ! 🎯
          </div>
        ) : (
          <div className="survival-defeat-empty">
            {mistakesCount} erreur{mistakesCount > 1 ? 's' : ''} commise{mistakesCount > 1 ? 's' : ''} en route.
          </div>
        )}
      </div>

      <div className="modal-actions">
        <button className="ctrl-btn" onClick={closeModal}>Abandonner</button>
        <button className="ctrl-btn ctrl-btn--primary" onClick={() => { closeModal(); retrySurvivalVictory(); }}>Rejouer</button>
      </div>
    </ModalBox>
  );
}