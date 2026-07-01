import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Chess, type Square } from 'chess.js';
import { START_FEN } from '@/services/openings';
import { useChessStore } from '@/stores/chessStore';

const WIKI_PIECES: Record<string, string> = {
  wp: '4/45/Chess_plt45.svg',
  wr: '7/72/Chess_rlt45.svg',
  wn: '7/70/Chess_nlt45.svg',
  wb: 'b/b1/Chess_blt45.svg',
  wq: '1/15/Chess_qlt45.svg',
  wk: '4/42/Chess_klt45.svg',
  bp: 'c/c7/Chess_pdt45.svg',
  br: 'f/ff/Chess_rdt45.svg',
  bn: 'e/ef/Chess_ndt45.svg',
  bb: '9/98/Chess_bdt45.svg',
  bq: '4/47/Chess_qdt45.svg',
  bk: 'f/f0/Chess_kdt45.svg',
};

const SQUARE_SIZE = 30;

function squareName(index: number): string {
  return String.fromCharCode(97 + (index % 8)) + String(8 - Math.floor(index / 8));
}

interface FenEditorProps {
  color: 'white' | 'black';
  onFenChange: (fen: string, path: string) => void;
  active?: boolean;
}

export const FenEditor = React.memo(function FenEditor({ color, onFenChange, active }: FenEditorProps) {
  const chessRef = useRef(new Chess());
  const [selectedSq, setSelectedSq] = useState<string | null>(null);
  const [legalTargets, setLegalTargets] = useState<Set<string>>(new Set());
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [, forceUpdate] = useState(0);
  const flipped = color === 'black';

  const boardTheme = useChessStore((s) => s.boardTheme);
  const lightBg = boardTheme.light || '#ebecd0';
  const darkBg = boardTheme.dark || '#779556';

  const board = chessRef.current.board();

  const syncFen = useCallback(() => {
    const chess = chessRef.current;
    if (active) onFenChange(chess.fen(), chess.history().join(' '));
  }, [active, onFenChange]);

  const rerender = useCallback(() => {
    forceUpdate((n) => n + 1);
    syncFen();
  }, [syncFen]);

  const handleSquareClick = useCallback((sq: string) => {
    const chess = chessRef.current;

    if (selectedSq === sq) {
      setSelectedSq(null);
      setLegalTargets(new Set());
      return;
    }

    if (selectedSq) {
      try {
        const move = chess.move({ from: selectedSq as Square, to: sq as Square, promotion: 'q' });
        if (move) {
          setLastMove({ from: move.from, to: move.to });
          setSelectedSq(null);
          setLegalTargets(new Set());
          rerender();
          return;
        }
      } catch {
        // illegal move, fall through
      }
      setSelectedSq(null);
      setLegalTargets(new Set());
    }

    const piece = chess.get(sq as Square);
    if (piece && piece.color === chess.turn()) {
      setSelectedSq(sq);
      const targets = new Set<string>();
      chess.moves({ square: sq as Square, verbose: true }).forEach((m: { to: string }) => targets.add(m.to));
      setLegalTargets(targets);
    }
  }, [selectedSq, rerender]);

  const reset = useCallback(() => {
    chessRef.current = new Chess();
    chessRef.current.load(START_FEN);
    setSelectedSq(null);
    setLegalTargets(new Set());
    setLastMove(null);
    rerender();
  }, [rerender]);

  const undo = useCallback(() => {
    const chess = chessRef.current;
    if (chess.history().length > 0) {
      chess.undo();
      setSelectedSq(null);
      setLegalTargets(new Set());
      setLastMove(null);
      rerender();
    }
  }, [rerender]);

  const clear = useCallback(() => {
    reset();
  }, [reset]);

  useEffect(() => {
    reset();
  }, [color, reset]);

  useEffect(() => {
    if (active) syncFen();
  }, [active, syncFen]);

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(8, ${SQUARE_SIZE}px)`,
          gridTemplateRows: `repeat(8, ${SQUARE_SIZE}px)`,
          border: '1px solid rgba(148,163,184,0.3)',
          borderRadius: 4,
          overflow: 'hidden',
          width: SQUARE_SIZE * 8,
          height: SQUARE_SIZE * 8,
          background: '#09111e',
        }}
      >
        {Array.from({ length: 64 }, (_, idx) => {
          const viewIdx = flipped ? 63 - idx : idx;
          const rank = Math.floor(viewIdx / 8);
          const file = viewIdx % 8;
          const sq = squareName(viewIdx);
          const isLight = (rank + file) % 2 === 0;
          const row = board[rank]!;
          const piece = row[file] ?? null;
          const isSelected = selectedSq === sq;
          const isLegal = legalTargets.has(sq);
          const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq);
          const icon = piece ? WIKI_PIECES[piece.color + piece.type] : null;

          const bg = isLight ? lightBg : darkBg;
          const isHighlighted = isSelected || isLast;

          return (
            <div
              key={idx}
              onClick={() => handleSquareClick(sq)}
              style={{
                width: SQUARE_SIZE,
                height: SQUARE_SIZE,
                background: bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                position: 'relative',
                fontSize: 13,
              }}
            >
              {icon && (
                <img
                  src={`https://upload.wikimedia.org/wikipedia/commons/${icon}`}
                  alt=""
                  style={{ width: '88%', height: '88%', userSelect: 'none', pointerEvents: 'none' }}
                />
              )}
              {isHighlighted && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(122,174,203,0.16)',
                    pointerEvents: 'none',
                    zIndex: 1,
                  }}
                />
              )}
              {isLegal && (
                <div
                  style={{
                    position: 'absolute',
                    top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: piece ? '91%' : '30%',
                    height: piece ? '91%' : '30%',
                    borderRadius: '50%',
                    border: piece ? '5px solid rgba(0,0,0,0.19)' : undefined,
                    background: piece ? 'transparent' : 'rgba(0,0,0,0.19)',
                    pointerEvents: 'none',
                    zIndex: 3,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});


