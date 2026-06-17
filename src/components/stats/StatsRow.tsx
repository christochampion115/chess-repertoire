import React from 'react';
import type { StatsMove } from '@/types/stats';
import { formatNumberShort } from '@/utils/format';

export interface StatsRowProps {
  move: StatsMove;
  /** Total games across ALL moves in the position (for frequency %). */
  totalGames: number;
  isActive: boolean;
  /** Colour of the eval dot; '#808080' when not computed. */
  evalDotColor: string;
  /** True while engine annotations are being computed — shows spinner instead of dot. */
  isAnnotationLoading: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onHover?: (x: number, y: number) => void;
  onLeave?: () => void;
  /** Hover over the eval dot — shows engine analysis tooltip. */
  onEvalDotHover?: (x: number, y: number) => void;
  onEvalDotLeave?: () => void;
}

export const StatsRow = React.memo(function StatsRow({
  move,
  totalGames,
  isActive,
  evalDotColor,
  isAnnotationLoading,
  onClick,
  onContextMenu,
  onHover,
  onLeave,
  onEvalDotHover,
  onEvalDotLeave,
}: StatsRowProps) {
  const total = (move.white ?? 0) + (move.draws ?? 0) + (move.black ?? 0);
  const freqPct = totalGames > 0 ? Math.round((total / totalGames) * 100) : 0;

  // Win/draw/loss bars — last segment takes remainder to guarantee 100%
  const whitePct = total > 0 ? Math.round((move.white / total) * 100) : 0;
  const drawPct  = total > 0 ? Math.round((move.draws / total) * 100) : 0;
  const blackPct = 100 - whitePct - drawPct;

  return (
    <div
      className={`stats-row${isActive ? ' active' : ''}`}
      data-move-uci={move.uci}
      data-move-san={move.san}
      style={{ display: 'grid', gridTemplateColumns: '24px 1fr', alignItems: 'center', gap: '4px', padding: '8px 4px' }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onHover?.(rect.left - 300, rect.top + rect.height / 2);
      }}
      onMouseLeave={onLeave}
    >
      {/* Eval dot / spinner */}
      {isAnnotationLoading ? (
        <div className="eval-dot-spinner" style={{ cursor: 'pointer', flexShrink: 0 }} />
      ) : (
        <div
          className="move-eval-dot"
          style={{
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            background: evalDotColor,
            border: '2px solid rgba(0,0,0,0.45)',
            transition: 'background 0.3s, transform 0.2s',
            cursor: 'pointer',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            onEvalDotHover?.(rect.left - 300, rect.top + rect.height / 2);
          }}
          onMouseLeave={onEvalDotLeave}
        />
      )}

      {/* Content columns */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '52px 34px 44px 1fr 44px',
          alignItems: 'center',
          gap: '4px',
          paddingRight: '4px',
        }}
      >
        <div className="move" style={{ fontWeight: 'bold' }}>{move.san}</div>
        <div className="freq">{freqPct}%</div>
        <div className="count">{formatNumberShort(total)}</div>

        {/* Win/draw/loss bars */}
        <div className="bars">
          <div className="bar white" style={{ width: `${whitePct}%` }}>
            {whitePct >= 12 ? `${whitePct}%` : ''}
          </div>
          <div className="bar draw" style={{ width: `${drawPct}%` }}>
            {drawPct >= 12 ? `${drawPct}%` : ''}
          </div>
          <div className="bar black" style={{ width: `${blackPct}%` }}>
            {blackPct >= 12 ? `${blackPct}%` : ''}
          </div>
        </div>

        <div className="elo">{move.averageRating ?? ''}</div>
      </div>
    </div>
  );
});
