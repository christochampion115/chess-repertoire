import React, { useCallback } from 'react';
import type { AnalysisLine } from '@/types/analysis';
import { formatCp, formatMate } from '@/utils/format';
import { buildContextMenu } from '@/services/contextMenu';
import { useTooltipContext } from '@/contexts/TooltipContext';
import { AnalysisMiniBoardTooltip } from '@/services/tooltipContent';
import { useChessStore } from '@/stores/chessStore';

export interface AnalysisRowProps {
  line: AnalysisLine;
  /** PV moves already converted to SAN by the parent (excludes best move). */
  pvSan: string;
  /** Best move already converted to SAN by the parent. */
  bestMoveSan: string;
}

export const AnalysisRow = React.memo(function AnalysisRow({
  line,
  pvSan,
  bestMoveSan,
}: AnalysisRowProps) {
  const isMate = line.mate != null;
  const isNeg = !isMate && line.score < 0;
  const scoreClass = isMate ? 'is-mate' : isNeg ? 'is-neg' : 'is-pos';
  const scoreText = isMate ? formatMate(line.mate!) : formatCp(line.score);
  const { showTooltip, hideTooltip } = useTooltipContext();
  const fen = useChessStore((s) => s.chess.fen());

  // Pas de délai pour le hover analyse (comme attachAnalysisMoveHover vanilla)
  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    showTooltip(rect.left - 200, rect.top - 8, (
      <AnalysisMiniBoardTooltip
        fen={fen}
        uci={line.uci}
        san={bestMoveSan}
      />
    ), 500);
  }, [fen, line.uci, bestMoveSan, showTooltip]);

  const handleMouseLeave = useCallback(() => {
    hideTooltip(0);
  }, [hideTooltip]);

  return (
    <div
      className="analysis-row"
      data-move-uci={line.uci}
      data-move-san={bestMoveSan}
      onContextMenu={(e) => buildContextMenu(e, 'analysis_move', { uci: line.uci, san: bestMoveSan, pv: line.pv })}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span className={`analysis-score ${scoreClass}`}>{scoreText}</span>
      <span className="analysis-move">{bestMoveSan}</span>
      <span className="analysis-pv">{pvSan}</span>
    </div>
  );
});
