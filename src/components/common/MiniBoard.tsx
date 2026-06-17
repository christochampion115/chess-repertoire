import { useMemo } from 'react';
import { getPieceUrl } from '@/utils/pieceIcons';
import type { Color, PieceType } from '@/types/chess';

function squareName(idx: number): string {
  return String.fromCharCode(97 + (idx % 8)) + String(8 - Math.floor(idx / 8));
}

function parseFen(fen: string): string[] {
  const rows = (fen?.split(' ')[0] || '').split('/');
  if (rows.length !== 8) return Array(64).fill('');
  const squares: string[] = [];
  for (const row of rows) {
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let k = 0; k < Number(ch); k++) squares.push('');
      } else {
        squares.push(ch);
      }
    }
  }
  return squares.length === 64 ? squares : Array(64).fill('');
}

export interface MiniBoardProps {
  fen: string;
  highlightUci?: string;
  flipped?: boolean;
  lightSquare?: string;
  darkSquare?: string;
  squareSize?: number;
  /** Couleur du surlignage du coup joué (défaut: or). */
  highlightColor?: string;
  /** Largeur du trait de surlignage en px (défaut: 2). */
  highlightBorderWidth?: number;
}

export function MiniBoard({
  fen,
  highlightUci = '',
  flipped = false,
  lightSquare = '#ebecd0',
  darkSquare = '#779556',
  squareSize = 24,
  highlightColor = '#ffd700',
  highlightBorderWidth = 2,
}: MiniBoardProps) {
  const squares = useMemo(() => parseFen(fen), [fen]);

  const from = highlightUci ? highlightUci.slice(0, 2) : '';
  const to = highlightUci ? highlightUci.slice(2, 4) : '';

  const boardSize = squareSize * 8;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(8, ${squareSize}px)`,
        gridTemplateRows: `repeat(8, ${squareSize}px)`,
        gap: 0,
        background: '#000',
        padding: 1,
        margin: '4px 0',
        overflow: 'hidden',
        width: boardSize + 2,
        height: boardSize + 2,
      }}
    >
      {squares.map((pieceChar, idx) => {
        const realIdx = flipped ? 63 - idx : idx;
        const rank = Math.floor(realIdx / 8);
        const file = realIdx % 8;
        const isLight = (rank + file) % 2 === 0;
        const bg = isLight ? lightSquare : darkSquare;
        const sq = squareName(realIdx);
        const hl = (sq === from || sq === to);

        const color = pieceChar && pieceChar === pieceChar.toUpperCase() ? 'w' as Color : 'b' as Color;
        const type = (pieceChar ? pieceChar.toLowerCase() : '') as PieceType;
        const imgSrc = pieceChar ? getPieceUrl(color, type) : '';
        return (
          <div
            key={idx}
            style={{
              width: squareSize,
              height: squareSize,
              background: bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: hl ? `inset 0 0 0 ${highlightBorderWidth}px ${highlightColor}` : undefined,
            }}
          >
            {imgSrc && (
              <img
                src={imgSrc}
                alt=""
                style={{ width: squareSize - 2, height: squareSize - 2 }}
                draggable={false}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
