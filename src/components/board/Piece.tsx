import React from 'react';
import type { Piece as PieceType, Square } from '@/types/chess';
import { getPieceUrl } from '@/utils/pieceIcons';

export interface PieceProps {
  piece: PieceType;
  square: Square;
  isDragging?: boolean;
  onPointerDown?: (sq: Square, e: React.PointerEvent<HTMLImageElement>) => void;
}

export const Piece = React.memo(function Piece({ piece, square, isDragging, onPointerDown }: PieceProps) {
  const src = getPieceUrl(piece.color, piece.type);
  if (!src) return null;

  return (
    <img
      className="piece"
      src={src}
      alt={`${piece.color}${piece.type}`}
      style={{ opacity: isDragging ? 0.25 : undefined }}
      onPointerDown={onPointerDown ? (e) => onPointerDown(square, e) : undefined}
    />
  );
});
