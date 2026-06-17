import { useUiStore } from '@/stores/uiStore';
import { retrySurvivalTraining, getNextRewardHint, countMoves, getMedalIcon, getMedalLabel } from '@/services/training';
import { nodeMap } from '@/services/repertoire';
import { ModalBox } from './ModalBox';
import { MiniBoard } from '@/components/common/MiniBoard';
import { useTrainingStore } from '@/stores/trainingStore';
import type { MedalTier, SurvivalReport } from '@/types/training';

export function TrainingDefeatModal() {
  const modal = useUiStore((s) => s.activeModal);
  const closeModal = useUiStore((s) => s.closeModal);
  const repColor = useTrainingStore((s) => s.repColor);
  console.log('[DEBUG TrainingDefeatModal] repColor:', repColor, 'flipped:', repColor === 'b');

  const nextReward = (() => {
    if (modal?.type !== 'training-defeat') return null;
    const data = modal as { type: 'training-defeat'; report: SurvivalReport };
    const { report } = data;
    if (!report.totalTargets) return null;
    const node = report.startNodeId ? nodeMap.get(report.startNodeId) : null;
    const moveCount = node ? countMoves(node, report.repColor ?? ('w' as const)) : 0;
    return getNextRewardHint(report.score, report.totalTargets, moveCount);
  })();

  if (modal?.type !== 'training-defeat') return null;
  const data = modal as { type: 'training-defeat'; report: SurvivalReport; earnedMeta?: { tier: MedalTier; shine: number; label: string; icon: string } | null };
  const { report, earnedMeta } = data;

  return (
    <ModalBox title="Défaite" onClose={closeModal} id="modal-training-defeat" width={680}>
      <div className="survival-defeat-summary">
        <div className="survival-defeat-score">
          Score final: <b>{report.completed ?? report.score}/{report.totalTargets}</b>
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
        {nextReward && (
          <div className="survival-next-reward--compact">
            Réussissez <b>{nextReward.needed}</b> coups de plus pour déverouiller la prochaine récompense.
          </div>
        )}
      </div>

      {report.mistakes?.length > 0 && (
        <div className="survival-defeat-list">
          {report.mistakes.map((m, i: number) => (
            <div key={i} className="survival-mistake-card">
              <div className="survival-mistake-head">
                Erreur {i + 1} · {m.path || 'Position'}
              </div>
              <div className="survival-mistake-moves">
                <span>Joué: <b style={{ color: 'var(--danger)' }}>{m.playedSan}</b></span>
                <span>Attendu: <b style={{ color: 'var(--success)' }}>{m.expectedSan}</b></span>
              </div>
              <MiniBoard fen={m.fen} squareSize={16} flipped={repColor === 'b'} />
            </div>
          ))}
        </div>
      )}

      <div className="modal-actions">
        <button className="ctrl-btn" onClick={closeModal}>Abandonner</button>
        <button className="ctrl-btn ctrl-btn--primary" onClick={() => { closeModal(); retrySurvivalTraining(); }}>Réessayer</button>
      </div>
    </ModalBox>
  );
}