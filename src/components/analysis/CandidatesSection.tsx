import React, { useEffect, useRef } from 'react';
import { useStatsStore } from '@/stores/statsStore';
import { useAnalysisStore } from '@/stores/analysisStore';
import { useChessStore } from '@/stores/chessStore';
import { StatsRow } from '@/components/stats/StatsRow';
import { Spinner } from '@/components/common/Spinner';
import { useTooltipContext } from '@/contexts/TooltipContext';
import { buildContextMenu } from '@/services/contextMenu';
import { playUciMove } from '@/services/repertoire';
import {
  getMoveTotalGames,
  getMoveWinRate,
  getMoveEnginePreference,
  getEngineColorForMove,
} from '@/utils/statsUtils';
import { LichessTooltipContent, EngineTooltipContent } from '@/services/tooltipContent';
import type { StatsMove, StatsSortBy, LichessStats } from '@/types/stats';
import type { AnnotationData } from '@/types/analysis';

const VISIBLE_LIMIT = 5;

function sortMoves(
  moves: StatsMove[],
  sortBy: StatsSortBy,
  sideToMoveIsWhite: boolean,
  fen: string,
  annotations: Record<string, AnnotationData>,
): StatsMove[] {
  return [...moves].sort((a, b) => {
    switch (sortBy) {
      case 'winrate-white': return getMoveWinRate(b, true)  - getMoveWinRate(a, true);
      case 'winrate-black': return getMoveWinRate(b, false) - getMoveWinRate(a, false);
      case 'winrate':       return getMoveWinRate(b, sideToMoveIsWhite) - getMoveWinRate(a, sideToMoveIsWhite);
      case 'engine':        return getMoveEnginePreference(b, fen, annotations) - getMoveEnginePreference(a, fen, annotations);
      default:              return getMoveTotalGames(b) - getMoveTotalGames(a); // 'frequency'
    }
  });
}

export const CandidatesSection = React.memo(function CandidatesSection() {
  const data              = useStatsStore((s) => s.data);
  const loading           = useStatsStore((s) => s.loading);
  const error             = useStatsStore((s) => s.error);
  const selectedUci       = useStatsStore((s) => s.selectedUci);
  const setSelectedUci    = useStatsStore((s) => s.setSelectedUci);
  const showAll           = useStatsStore((s) => s.showAll);
  const setShowAll        = useStatsStore((s) => s.setShowAll);
  const sortBy            = useStatsStore((s) => s.filters.sortBy);

  const isAnalysisEnabled   = useAnalysisStore((s) => s.isEnabled);
  const annotationsLoading  = useAnalysisStore((s) => s.annotationsLoading);
  const annotations         = useAnalysisStore((s) => s.annotations);
  const annotationsDepth    = useAnalysisStore((s) => s.annotationsDepth);
  const runChildAnnotations = useAnalysisStore((s) => s.runChildAnnotations);
  const { showTooltip, hideTooltip } = useTooltipContext();

  const chess = useChessStore((s) => s.chess);
  const sideToMoveIsWhite = chess.turn() === 'w';
  const fen = chess.fen();

  const prevFenRef = useRef(fen);

  // Déclencher les annotations par-coup quand la position change
  useEffect(() => {
    if (!isAnalysisEnabled || loading || !data?.moves?.length) return;
    if (fen === prevFenRef.current && Object.keys(annotations).length > 0) return;
    prevFenRef.current = fen;

    const ucis = data.moves.map((m) => m.uci).filter(Boolean) as string[];
    const depth = annotationsDepth || 10;
    runChildAnnotations(fen, ucis, depth);
  }, [fen, isAnalysisEnabled, loading, data, annotationsDepth, annotations, runChildAnnotations]);

  const allMoves   = data?.moves ?? [];
  const sorted     = sortMoves(allMoves, sortBy, sideToMoveIsWhite, fen, annotations);
  const hasMore    = sorted.length > VISIBLE_LIMIT;
  const visibleMoves = showAll ? sorted : sorted.slice(0, VISIBLE_LIMIT);
  const totalGames = allMoves.reduce((acc, m) => acc + m.white + m.draws + m.black, 0);

  return (
    <div className="stats-panel" id="stats-panel">
      {loading ? (
        <div className="analysis-loading" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0' }}>
          <Spinner size="sm" />
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Chargement en cours…</span>
        </div>
      ) : error ? (
        <div className="panel-empty">{error}</div>
      ) : allMoves.length === 0 ? (
        <div className="panel-empty">Aucune donnée disponible.</div>
      ) : (
        <>
          {visibleMoves.map((move) => {
            const evalDotColor = getEngineColorForMove(move.uci, fen, annotations);

            return (
              <StatsRow
                key={move.uci}
                move={move}
                totalGames={totalGames}
                isActive={move.uci === selectedUci}
                evalDotColor={evalDotColor}
                isAnnotationLoading={annotationsLoading}
                onClick={() => { setSelectedUci(move.uci); playUciMove(move.uci); }}
                onContextMenu={(e) => buildContextMenu(e, 'stats_move', { uci: move.uci, san: move.san })}
                onHover={(x, y) => showTooltip(x, y, (
                  <LichessTooltipContent
                    fen={fen}
                    uci={move.uci}
                    stats={data as LichessStats | null}
                  />
                ), 500)}
                onLeave={() => hideTooltip()}
                onEvalDotHover={(x, y) => showTooltip(x, y, (
                  <EngineTooltipContent
                    uci={move.uci}
                    san={move.san}
                    fen={fen}
                  />
                ), 500)}
                onEvalDotLeave={() => hideTooltip()}
              />
            );
          })}

          {hasMore && (
            <button
              type="button"
              className="stats-show-more-btn"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? 'Afficher moins' : 'Afficher plus'}
            </button>
          )}
        </>
      )}
    </div>
  );
});

