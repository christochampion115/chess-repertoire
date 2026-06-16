/**
 * Wrapper chess.js — normalise l'API entre :
 *   - CDN 0.10.3 (utilisé par le vanilla, snake_case: in_check(), game_over())
 *   - npm 1.x    (utilisé par React,   camelCase: inCheck(), isGameOver())
 *
 * Les composants React importent depuis ici, jamais directement depuis 'chess.js'.
 */
export { Chess } from 'chess.js';
export type { Move, Color as ChessColor, PieceSymbol, Square as ChessSquare } from 'chess.js';

import { Chess } from 'chess.js';

/**
 * Crée une instance Chess.
 * @param fen Position FEN optionnelle. Défaut : position initiale.
 */
export function createGame(fen?: string): Chess {
  const chess = new Chess();
  if (fen) chess.load(fen);
  return chess;
}
