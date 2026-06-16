export type ChessFile = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h';
export type ChessRank = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8';

/** Union des 64 cases : 'a1' | 'a2' | … | 'h8' */
export type Square = `${ChessFile}${ChessRank}`;

export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface Piece {
  color: Color;
  type: PieceType;
  square: Square;
}

/** Grille 8×8 — null = case vide */
export type Board = (Piece | null)[][];

export interface BoardTheme {
  light: string;
  dark: string;
}
