import React from 'react';
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

function squareName(index: number): string {
  return String.fromCharCode(97 + (index % 8)) + String(8 - Math.floor(index / 8));
}

interface ReportMiniBoardProps {
  fen: string;
  highlightUci?: string;
  flipped?: boolean;
  lightSquare?: string;
  darkSquare?: string;
  size?: number;
}

export const ReportMiniBoard = React.memo(function ReportMiniBoard({
  fen,
  highlightUci = '',
  flipped = false,
  lightSquare = '#ebecd0',
  darkSquare = '#779556',
  size = 24,
}: ReportMiniBoardProps) {
  const boardTheme = useChessStore((s) => s.boardTheme);
  const ls = lightSquare || boardTheme.light || '#ebecd0';
  const ds = darkSquare || boardTheme.dark || '#779556';

  const fenPart = (fen || '').split(' ')[0] || '';
  const rows = fenPart.split('/');
  if (rows.length !== 8) return null;

  const board: ({ color: string; type: string } | null)[][] = [];
  for (const row of rows) {
    const line: ({ color: string; type: string } | null)[] = [];
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let k = 0; k < Number(ch); k++) line.push(null);
      } else {
        line.push({ color: ch === ch.toUpperCase() ? 'w' : 'b', type: ch.toLowerCase() });
      }
    }
    board.push(line);
  }
  if (board.length !== 8) return null;

  const from = highlightUci ? highlightUci.slice(0, 2) : '';
  const to = highlightUci ? highlightUci.slice(2, 4) : '';
  const boardSize = size * 8;

  return (
    <div
      style={{
        borderRadius: 6,
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: `repeat(8, ${size}px)`,
        gridTemplateRows: `repeat(8, ${size}px)`,
        gap: 0,
        background: '#000',
        padding: 1,
        width: boardSize + 2,
        height: boardSize + 2,
      }}
    >
      {Array.from({ length: 64 }, (_, idx) => {
        const row = flipped ? 7 - Math.floor(idx / 8) : Math.floor(idx / 8);
        const col = flipped ? 7 - (idx % 8) : idx % 8;
        const isLight = (row + col) % 2 === 0;
        const bg = isLight ? ls : ds;
        const piece = board[row]?.[col];
        const sq = squareName(row * 8 + col);
        const hl = (sq === from || sq === to);
        const icon = piece ? WIKI_PIECES[piece.color + piece.type] : null;

        return (
          <div
            key={idx}
            style={{
              width: size,
              height: size,
              background: bg,
              display: 'flex',
              alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}
            >
              {icon && (
                <img
                  src={`https://upload.wikimedia.org/wikipedia/commons/${icon}`}
                  alt=""
                  style={{ width: size - 2, height: size - 2 }}
                />
              )}
              {hl && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(122,174,203,0.16)',
                    pointerEvents: 'none',
                  }}
                />
              )}
            </div>
        );
      })}
    </div>
  );
});
