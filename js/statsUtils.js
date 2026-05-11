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
  const afterWhiteCp = state.moveAnnotationValues?.[move.uci];
  if (!Number.isFinite(afterWhiteCp)) return Number.NEGATIVE_INFINITY;
  // afterWhiteCp : positif = blancs avantagés. On renvoie la valeur du point de vue
  // du joueur du trait, de sorte que le tri descendant (rightValue - leftValue) place
  // le meilleur coup en premier quelle que soit la couleur.
  const fen = state.currentNode?.fen || '';
  const sideToMove = fen.split(' ')[1] || 'w';
  return sideToMove === 'w' ? afterWhiteCp : -afterWhiteCp;
}
