import { useMemo, useState, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { MiniBoard } from '@/components/common/MiniBoard';
import { fetchLichessStats } from '@/services/stats';
import { useChessStore } from '@/stores/chessStore';
import { useAnalysisStore } from '@/stores/analysisStore';
import { formatCp, formatMate, formatNumberShort } from '@/utils/format';
import type { LichessStats, StatsMove } from '@/types/stats';

// ── UCI → SAN converter (for PV lines) ─────────────────────────────────────

function convertPvUciToSan(uciMoves: string[], startFen: string): string[] {
  if (!Array.isArray(uciMoves) || uciMoves.length === 0) return [];
  if (!startFen) return uciMoves;
  const tempChess = new Chess();
  tempChess.load(startFen);
  const sanMoves: string[] = [];
  for (const uciMove of uciMoves) {
    try {
      const from = uciMove.slice(0, 2);
      const to = uciMove.slice(2, 4);
      const promo = uciMove[4];
      const move = tempChess.move({ from, to, ...(promo ? { promotion: promo } : {}) });
      if (move) {
        sanMoves.push(move.san);
      } else {
        sanMoves.push(uciMove);
      }
    } catch {
      sanMoves.push(uciMove);
    }
  }
  return sanMoves;
}

// ── After-fen helper ────────────────────────────────────────────────────────

function fenAfterMove(fen: string, uci: string): string {
  try {
    const tempChess = new Chess(fen);
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promo = uci[4] || undefined;
    tempChess.move({ from, to, ...(promo ? { promotion: promo } : {}) });
    return tempChess.fen();
  } catch {
    return fen;
  }
}

// ── Board theme helper ──────────────────────────────────────────────────────

function useBoardTheme() {
  return useChessStore((s) => s.boardTheme);
}

function useBoardFlipped() {
  return useChessStore((s) => s.boardFlipped);
}

// ── Counter-moves hook ──────────────────────────────────────────────────────

interface CounterMoveEntry {
  san: string;
  white: number;
  draws: number;
  black: number;
}

const countermovesCache = new Map<string, CounterMoveEntry[]>();

export function useCountermoves(fen: string, uci: string): CounterMoveEntry[] | null {
  const [result, setResult] = useState<CounterMoveEntry[] | null>(null);
  const uciRef = useRef(uci);
  uciRef.current = uci;

  useEffect(() => {
    if (!fen || !uci) return;
    const cacheKey = `${fen}|${uci}`;

    if (countermovesCache.has(cacheKey)) {
      setResult(countermovesCache.get(cacheKey)!);
      return;
    }

    let cancelled = false;
    const afterFen = fenAfterMove(fen, uci);

    fetchLichessStats(afterFen, { min: 0, max: 3000 }, 'lichess')
      .then((stats: unknown) => {
        if (cancelled) return;
        const data = stats as LichessStats;
        const topMoves: CounterMoveEntry[] = (data.moves || []).slice(0, 3).map((m: StatsMove) => ({
          san: m.san,
          white: m.white,
          draws: m.draws,
          black: m.black,
        }));
        countermovesCache.set(cacheKey, topMoves);
        if (uciRef.current === uci) {
          setResult(topMoves);
        }
      })
      .catch(() => {
        if (!cancelled) setResult([]);
      });

    return () => { cancelled = true; };
  }, [fen, uci]);

  return result;
}

// ── LichessStats tooltip content ────────────────────────────────────────────

interface LichessTooltipContentProps {
  fen: string;
  uci: string;
  stats: LichessStats | null;
}

export function LichessTooltipContent({ fen, uci, stats }: LichessTooltipContentProps) {
  const afterFen = useMemo(() => fenAfterMove(fen, uci), [fen, uci]);
  const counterMoves = useCountermoves(fen, uci);
  const boardTheme = useBoardTheme();
  const boardFlipped = useBoardFlipped();
  const flipped = boardFlipped;
  console.log('[DEBUG LichessTooltip] boardFlipped:', boardFlipped);

  const totalAllMoves = useMemo(() => {
    if (!counterMoves) return 0;
    return counterMoves.reduce((sum, m) => sum + m.white + m.draws + m.black, 0);
  }, [counterMoves]);

  return (
    <div>
      {stats?.openingName && (
        <div className="move-hover-tooltip-row">
          <span className="move-hover-tooltip-label">Ouverture:</span>
          <span className="move-hover-tooltip-value">{stats.openingName}</span>
        </div>
      )}
      {stats?.eco && (
        <div className="move-hover-tooltip-row">
          <span className="move-hover-tooltip-label">ECO:</span>
          <span className="move-hover-tooltip-value">{stats.eco}</span>
        </div>
      )}

      <MiniBoard
        fen={afterFen}
        highlightUci={uci}
        flipped={flipped}
        squareSize={22}
        lightSquare={boardTheme.light}
        darkSquare={boardTheme.dark}
        highlightColor="#ffd700"
      />

      <div className="move-hover-tooltip-section-title" style={{ marginTop: 4 }}>
        Contre-coups:
      </div>
      {!counterMoves ? (
        <div className="move-hover-tooltip-row">
          <span className="move-hover-tooltip-value">Chargement...</span>
        </div>
      ) : counterMoves.length === 0 ? (
        <div className="move-hover-tooltip-row">
          <span className="move-hover-tooltip-value">Aucun coup</span>
        </div>
      ) : (
        counterMoves.map((m) => {
          const total = m.white + m.draws + m.black;
          const pct = totalAllMoves > 0 ? Math.round((total / totalAllMoves) * 100) : 0;
          return (
            <div key={m.san} className="move-hover-tooltip-row">
              <span className="move-hover-tooltip-label">{m.san}:</span>
              <span className="move-hover-tooltip-value">{pct}% ({formatNumberShort(total)})</span>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Engine tooltip content (for eval-dot hover) ─────────────────────────────

interface EngineTooltipContentProps {
  uci: string;
  san: string;
  fen: string;
}

export function EngineTooltipContent({ uci, san, fen }: EngineTooltipContentProps) {
  const results = useAnalysisStore((s) => s.results);
  const annotations = useAnalysisStore((s) => s.annotations);
  const depth = useAnalysisStore((s) => s.depth);
  const isEnabled = useAnalysisStore((s) => s.isEnabled);
  const boardTheme = useBoardTheme();
  const boardFlipped = useBoardFlipped();
  const flipped = boardFlipped;
  console.log('[DEBUG EngineTooltip] boardFlipped:', boardFlipped);

  const annotation = annotations[uci];

  // annotation.score = centipawns (nombre), on le formate comme dans le vanilla
  const scoreCp = annotation?.score;
  const pv = annotation?.pv;

  const afterFen = useMemo(() => fen ? fenAfterMove(fen, uci) : '', [fen, uci]);

  return (
    <div>
      <div className="move-hover-tooltip-row">
        <span className="move-hover-tooltip-label">{san}</span>
      </div>

      {scoreCp != null ? (
        <div className="move-hover-tooltip-row">
          <span className="move-hover-tooltip-label">Évaluation:</span>
          <span className="move-hover-tooltip-value">{formatCp(scoreCp)}</span>
        </div>
      ) : isEnabled ? (
        <div className="move-hover-tooltip-row">
          <span className="move-hover-tooltip-label">Évaluation:</span>
          <span className="move-hover-tooltip-value">Calcul en cours...</span>
        </div>
      ) : (
        <div className="move-hover-tooltip-row">
          <span className="move-hover-tooltip-label">Évaluation:</span>
          <span className="move-hover-tooltip-value">Activez Analyse</span>
        </div>
      )}

      {pv && afterFen && (
        <>
          <div className="move-hover-tooltip-separator" />
          <div className="move-hover-tooltip-section-title">Ligne Principale:</div>
          <MiniBoard
            fen={afterFen}
            highlightUci={uci}
            flipped={flipped}
            squareSize={20}
            lightSquare={boardTheme.light}
            darkSquare={boardTheme.dark}
          />
          <div className="move-hover-tooltip-pv">
            {convertPvUciToSan(pv.split(/\s+/).slice(0, 5), afterFen).join(' ')}
          </div>
        </>
      )}

      {isEnabled && results.length > 1 && (() => {
        const best = results[0];
        const second = results[1];
        if (!best || !second || best.score == null || second.score == null) return null;
        const diff = Math.abs(best.score - second.score) / 100;
        return (
          <>
            <div className="move-hover-tooltip-separator" />
            <div className="move-hover-tooltip-section-title">Analyse:</div>
            <div className="move-hover-tooltip-row">
              <span className="move-hover-tooltip-label">Profondeur:</span>
              <span className="move-hover-tooltip-value">{depth}</span>
            </div>
            <div className="move-hover-tooltip-row">
              <span className="move-hover-tooltip-label">Écart 1°-2°:</span>
              <span className="move-hover-tooltip-value">{diff.toFixed(2)}</span>
            </div>
            {results.length > 2 && (() => {
              const third = results[2];
              if (!third || third.score == null) return null;
              const diff23 = Math.abs(second.score - third.score) / 100;
              return (
                <div className="move-hover-tooltip-row">
                  <span className="move-hover-tooltip-label">Écart 2°-3°:</span>
                  <span className="move-hover-tooltip-value">{diff23.toFixed(2)}</span>
                </div>
              );
            })()}
          </>
        );
      })()}

      {isEnabled && results.length > 1 && (
        <>
          <div className="move-hover-tooltip-separator" />
          <div className="move-hover-tooltip-section-title">Alternatives:</div>
          {results.slice(1, 3).map((result, idx) => (
            <div key={result.uci} className="move-hover-tooltip-row">
              <span className="move-hover-tooltip-label">{idx + 2}°:</span>
              <span className="move-hover-tooltip-value">{result.mate != null ? formatMate(result.mate) : formatCp(result.score)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── Analysis row hover tooltip (mini-board + SAN header) ────────────────────
// Équivalent de buildMiniBoardTooltipHtml dans analysis.js
// Montre le SAN + mini-board 20px avec highlight ambre après le coup.

interface AnalysisMiniBoardTooltipProps {
  fen: string;
  uci: string;
  san: string;
}

export function AnalysisMiniBoardTooltip({ fen, uci, san }: AnalysisMiniBoardTooltipProps) {
  const afterFen = useMemo(() => fen ? fenAfterMove(fen, uci) : '', [fen, uci]);
  const boardTheme = useBoardTheme();
  const boardFlipped = useBoardFlipped();
  const flipped = boardFlipped;
  console.log('[DEBUG AnalysisMiniBoardTooltip] boardFlipped:', boardFlipped);

  return (
    <div>
      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#e2f2ff', marginBottom: 6 }}>
        {san}
      </div>
      <MiniBoard
        fen={afterFen}
        highlightUci={uci}
        flipped={flipped}
        squareSize={20}
        lightSquare={boardTheme.light}
        darkSquare={boardTheme.dark}
        highlightColor="#fbbf24"
        highlightBorderWidth={2}
      />
    </div>
  );
}
