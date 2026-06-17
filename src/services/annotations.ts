import { Chess } from 'chess.js';
import type { StockfishWorker } from '@/engine/sf-worker';

export interface ChildAnnotationResult {
  /** Score afterWhiteCp (centipawns, point de vue des blancs). */
  score: number | null;
  /**
   * Continuation (PV) depuis afterFen, sans le coup joué.
   * Chaîne d'UCIs séparés par des espaces (ex: "e7e5 d2d4 e5d4").
   * null si pas de continuation.
   */
  pv: string | null;
}

/**
 * Évalue chaque coup d'une liste en appliquant le UCI à la position de base
 * puis en lançant Stockfish sur la position-fille (MultiPV=1).
 *
 * La callback `onProgress` est appelée après chaque coup évalué, permettant
 * une mise à jour progressive de l'UI.
 */
export async function annotateMoves(
  sfWorker: StockfishWorker,
  baseFen: string,
  ucis: string[],
  depth: number,
  onProgress?: (uci: string, result: ChildAnnotationResult) => void,
): Promise<Record<string, ChildAnnotationResult>> {
  const chessTemp = new Chess();
  const results: Record<string, ChildAnnotationResult> = {};

  for (const uci of ucis) {
    chessTemp.load(baseFen);
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promo = uci[4] ? uci[4].toLowerCase() : undefined;
    const ok = chessTemp.move({ from, to, ...(promo ? { promotion: promo } : {}) });
    if (!ok) {
      const empty: ChildAnnotationResult = { score: null, pv: null };
      results[uci] = empty;
      onProgress?.(uci, empty);
      continue;
    }

    const afterFen = chessTemp.fen();
    const sfResult = await sfWorker.evaluateSingle(afterFen, depth);
    const afterSideToMove = afterFen.split(' ')[1] || 'w';

    let score: number | null = null;
    if (sfResult.mate !== null) {
      score = sfResult.mate > 0 ? 99999 : -99999;
    } else if (sfResult.cp !== null) {
      score = afterSideToMove === 'w' ? sfResult.cp : -sfResult.cp;
    }

    // La PV retournée par Stockfish commence par... le premier coup de la continuation
    // (après afterFen). On la stocke telle quelle.
    const annResult: ChildAnnotationResult = { score, pv: sfResult.pv };
    results[uci] = annResult;
    onProgress?.(uci, annResult);
  }

  return results;
}
