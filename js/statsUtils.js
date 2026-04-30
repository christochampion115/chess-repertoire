import { state } from './state.js';

export function getMoveTotalGames(move) {
  return (move?.white || 0) + (move?.draws || 0) + (move?.black || 0);
}

export function getMoveWinRate(move, fen) {
  const total = getMoveTotalGames(move);
  if (!total) return 0;
  const sideToMove = (fen?.split(' ')[1] || 'w');
  return sideToMove === 'w' ? move.white / total : move.black / total;
}

export function getMoveEnginePreference(move) {
  const value = state.moveAnnotationValues?.[move.uci];
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}
