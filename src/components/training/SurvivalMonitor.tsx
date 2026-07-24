import React, { useEffect, useRef } from 'react';
import { useTrainingStore } from '@/stores/trainingStore';
import { SURVIVAL_LIVES, SURVIVAL_LIFE_BONUS_INTERVAL } from '@/types/training';

export const SurvivalMonitor = React.memo(function SurvivalMonitor({ hideHearts }: { hideHearts?: boolean }) {
  const phase = useTrainingStore((s) => s.phase);
  const mode = useTrainingStore((s) => s.mode);
  const lives = useTrainingStore((s) => s.lives);
  const goldenHeart = useTrainingStore((s) => s.goldenHeart);
  const totalTargets = useTrainingStore((s) => s.totalTargets);
  const answered = useTrainingStore((s) => s.answered.size);
  const milestones = useTrainingStore((s) => s.milestones);
  const completedTargets = useTrainingStore((s) => s.completedTargets.size);

  const prevLivesRef = useRef(lives);
  const prevGoldenRef = useRef(goldenHeart);

  useEffect(() => {
    const prevLives = prevLivesRef.current;
    const prevGolden = prevGoldenRef.current;
    prevLivesRef.current = lives;
    prevGoldenRef.current = goldenHeart;

    const gainedLife = lives > prevLives;
    const gainedGolden = goldenHeart && !prevGolden;
    if (!gainedLife && !gainedGolden) return;

    requestAnimationFrame(() => {
      const container = document.querySelector('.survival-monitor-hearts');
      if (!container) return;
      let target: HTMLElement | null = null;
      if (gainedGolden) {
        target = container.querySelector('.survival-heart.is-golden');
      } else {
        const filled = [...container.querySelectorAll('.survival-heart')]
          .filter(el => !el.classList.contains('is-empty') && !el.classList.contains('is-golden'));
        target = (filled[filled.length - 1] as HTMLElement) || null;
      }
      if (target) {
        target.classList.remove('arriving');
        void target.offsetWidth;
        target.classList.add('arriving');
        target.addEventListener('animationend', () => target.classList.remove('arriving'), { once: true });
      }
    });
  }, [lives, goldenHeart]);

  if (phase === 'idle' || mode !== 'survival') return null;

  const total = Math.max(0, totalTargets || 0);
  const completed = Math.min(total, completedTargets);
  const correct = Math.min(completed, answered);
  const progressPercent = total > 0 ? (completed / total) * 100 : 0;
  const progressValue = Math.min(100, Math.max(0, progressPercent));
  const progressText = `${Math.round(progressPercent)}%`;

  const nextMilestone = (milestones + 1) * SURVIVAL_LIFE_BONUS_INTERVAL;
  const untilBonus = nextMilestone - correct;
  const bonusHint = (lives < SURVIVAL_LIVES || !goldenHeart) ? untilBonus : null;

  const hearts: { full: boolean; golden?: boolean }[] = [];
  for (let i = 0; i < SURVIVAL_LIVES; i++) hearts.push({ full: i < lives });
  if (goldenHeart) hearts.push({ full: true, golden: true });

  return (
    <div className="survival-monitor-card">
      {!hideHearts && (
      <div className="survival-monitor-lives">
        Vies:{' '}
        <span className="survival-monitor-hearts">
          {hearts.map((h, i) => (
            <span
              key={i}
              className={`survival-heart ${h.full ? (h.golden ? 'is-golden' : '') : 'is-empty'}`}
            >
              {h.full ? '♥' : '♡'}
            </span>
          ))}
        </span>
      </div>
      )}
      {bonusHint !== null && (
        <div className="survival-monitor-row survival-monitor-hint">
          Prochain ♥ dans <b>{bonusHint}</b> coup{bonusHint > 1 ? 's' : ''}
        </div>
      )}
      <div className="survival-monitor-row">
        <span>Progression</span>
        <strong>{progressText}</strong>
      </div>
      <div className="survival-progress-track">
        <div
          className="survival-progress-fill"
          style={{ width: `${progressValue}%` }}
        />
      </div>
    </div>
  );
});