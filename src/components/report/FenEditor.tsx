import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Chess, type Square } from 'chess.js';
import { START_FEN } from '@/services/openings';
import { loadItem, STORAGE_KEYS } from '@/services/storage';

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

const SQUARE_SIZE = 35;

function squareName(index: number): string {
  return String.fromCharCode(97 + (index % 8)) + String(8 - Math.floor(index / 8));
}

interface FenEditorProps {
  color: 'white' | 'black';
  onFenChange: (fen: string, path: string) => void;
}

export const FenEditor = React.memo(function FenEditor({ color, onFenChange }: FenEditorProps) {
  const chessRef = useRef(new Chess());
  const [selectedSq, setSelectedSq] = useState<string | null>(null);
  const [legalTargets, setLegalTargets] = useState<Set<string>>(new Set());
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [, forceUpdate] = useState(0);
  const flipped = color === 'black';

  const [fenInput, setFenInput] = useState('');
  const [fenError, setFenError] = useState<string | null>(null);

  const savedTheme = useMemo(() => loadItem<{ light: string; dark: string }>(STORAGE_KEYS.BOARD_THEME), []);
  const lightBg = savedTheme?.light || '#ebecd0';
  const darkBg = savedTheme?.dark || '#779556';

  const board = chessRef.current.board();

  const syncFen = useCallback(() => {
    const chess = chessRef.current;
    const f = chess.fen();
    setFenInput(f);
    setFenError(null);
    onFenChange(f, chess.history().join(' '));
  }, [onFenChange]);

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

  const handleFenInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFenInput(val);
    try {
      const chess = new Chess(val);
      chessRef.current = chess;
      setSelectedSq(null);
      setLegalTargets(new Set());
      setLastMove(null);
      setFenError(null);
      forceUpdate((n) => n + 1);
      syncFen();
    } catch {
      setFenError('FEN invalide');
    }
  }, [syncFen]);

  useEffect(() => {
    reset();
  }, [color, reset]);

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
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

          let bg = isLight ? lightBg : darkBg;
          if (isSelected) bg = 'rgba(122,174,203,0.45)';
          else if (isLast) bg = isLight ? 'rgba(245,158,11,0.38)' : 'rgba(245,158,11,0.50)';

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={reset} style={btnStyle}>Initiale</button>
          <button type="button" onClick={undo} style={btnStyle}>Annuler</button>
          <button type="button" onClick={clear} style={btnStyle}>Vider</button>
        </div>
        <label style={{ fontSize: '0.78rem', color: '#94a3b8' }}>FEN</label>
        <input
          type="text"
          value={fenInput}
          onChange={handleFenInputChange}
          placeholder="Saisissez une FEN…"
          style={{
            fontFamily: 'monospace',
            fontSize: '0.78rem',
            background: 'rgba(15,23,42,0.96)',
            border: `1px solid ${fenError ? 'rgba(239,68,68,.5)' : 'rgba(148,163,184,0.18)'}`,
            borderRadius: 6,
            color: fenError ? '#fca5a5' : '#e2e8f0',
            padding: '8px 10px',
            outline: 'none',
          }}
        />
        {fenError && (
          <div style={{ fontSize: '0.72rem', color: '#fca5a5', marginTop: 4 }}>
            {fenError}
          </div>
        )}
      </div>
    </div>
  );
});

const btnStyle: React.CSSProperties = {
  flex: 1,
  background: 'rgba(15,23,42,0.96)',
  border: '1px solid rgba(148,163,184,0.18)',
  color: '#e2e8f0',
  borderRadius: 6,
  padding: '8px 10px',
  cursor: 'pointer',
  fontSize: '0.8rem',
  fontWeight: 600,
};
