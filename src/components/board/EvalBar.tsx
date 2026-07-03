import React from 'react';
import { cpToWhitePct } from '@/utils/format';

export interface EvalBarProps {
  /** Centipawn score. Null = analysis disabled / no result yet. */
  cpValue: number | null;
  /** Mate-in count (positive = current player mates, negative = opponent). Null = not a mate. */
  mateIn?: number | null;
  boardFlipped: boolean;
}

export const EvalBar = React.memo(function EvalBar({ cpValue, mateIn, boardFlipped }: EvalBarProps) {
  if (cpValue === null && mateIn == null) return null;

  let whitePct = 50;
  let scoreText = '±0.00';

  if (mateIn != null) {
    scoreText = `#${Math.abs(mateIn)}`;
    whitePct = mateIn > 0 ? 95 : 5;
  } else if (cpValue !== null) {
    whitePct = cpToWhitePct(cpValue);
    const abs = Math.abs(cpValue);
    scoreText = (cpValue >= 0 ? '+' : '-') + (abs / 100).toFixed(2);
  }

  const whiteWinning = whitePct > 50;
  // White winning + not flipped → score at bottom (white side)
  // White winning + flipped   → score at top (white side)
  const scoreAtBottom = whiteWinning !== boardFlipped;

  const fillStyle: React.CSSProperties = {
    height: `${whitePct}%`,
    ...(boardFlipped ? { top: 0 } : { bottom: 0 }),
    background: whiteWinning
      ? 'linear-gradient(90deg, #f8fafc 0%, #e2e8f0 75%, rgba(0,0,0,0.02) 100%)'
      : 'linear-gradient(90deg, #94a3b8 0%, #64748b 75%, rgba(0,0,0,0.05) 100%)',
  };

  const scoreStyle: React.CSSProperties = {
    color: whiteWinning ? '#111' : '#f0f0f0',
    writingMode: 'horizontal-tb',
    ...(scoreAtBottom ? { bottom: '6px', top: 'auto' } : { top: '6px', bottom: 'auto' }),
  };

  return (
    <div className="eval-bar">
      <div className="eval-bar-fill" style={fillStyle} />
      <div className="eval-bar-zero" />
      <div className="eval-bar-score" style={scoreStyle}>{scoreText}</div>
    </div>
  );
});
