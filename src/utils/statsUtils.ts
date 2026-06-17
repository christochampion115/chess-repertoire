import type { AnnotationData } from '@/types/analysis';

export function getMoveTotalGames(move: { white: number; draws: number; black: number }): number {
  return move.white + move.draws + move.black;
}

export function getMoveWinRate(move: { white: number; draws: number; black: number }, sideToMoveIsWhite: boolean): number {
  const total = getMoveTotalGames(move);
  if (total === 0) return 0;
  const wins = sideToMoveIsWhite ? move.white : move.black;
  return (wins / total) * 100;
}

/**
 * Calcule la couleur du point d'évaluation (eval dot) pour un coup donné,
 * basée sur le gradient winPctLoss du vanilla.
 *
 * Les afterWhiteCp viennent des annotations par-coup (analysisStore.annotations).
 * Si un coup n'a pas d'annotation → gris.
 *
 * Stops d'interpolation :
 *   0%  → meilleur coup     (vert foncé  #22a64c)
 *   3%  → bon coup           (vert clair  #6ec53a)
 *   7%  → imprécision        (jaune       #eab308)
 *   15% → erreur             (orange      #ee7830)
 *   28% → gaffe              (rouge       #d62828)
 */
/**
 * @param fen Position FEN avant le coup (pour déterminer le trait).
 */
export function getEngineColorForMove(
  uci: string,
  fen: string,
  annotations: Record<string, AnnotationData>,
): string {
  const afterWhiteCp = annotations[uci]?.score;
  if (afterWhiteCp === undefined) return '#808080';

  const allCps = Object.values(annotations)
    .map((a) => a.score)
    .filter((v) => Number.isFinite(v));
  if (allCps.length === 0) return '#808080';

  // Le meilleur coup dépend du trait :
  //   Blancs : max afterWhiteCp (le plus avantageux pour les blancs)
  //   Noirs  : min afterWhiteCp (le plus avantageux pour les noirs)
  const sideToMove = fen.split(' ')[1] || 'w';
  const bestCp = sideToMove === 'w' ? Math.max(...allCps) : Math.min(...allCps);

  const cpToWinPct = (cp: number): number =>
    Math.min(97, Math.max(3, 50 + 50 * (2 / (1 + Math.exp(-0.003 * cp)) - 1)));

  const bestWinPct = cpToWinPct(bestCp);
  const thisWinPct = cpToWinPct(afterWhiteCp);
  const winPctLoss = Math.abs(bestWinPct - thisWinPct);

  const clamped = Math.max(0, Math.min(28, winPctLoss));

  const stops: { cp: number; color: [number, number, number] }[] = [
    { cp: 0,  color: [34, 166, 76] },
    { cp: 3,  color: [110, 197, 58] },
    { cp: 7,  color: [234, 179, 8] },
    { cp: 15, color: [238, 120, 48] },
    { cp: 28, color: [214, 40, 40] },
  ];

  let leftStop = stops[0];
  let rightStop = stops[stops.length - 1];

  for (let i = 0; i < stops.length - 1; i++) {
    const cur = stops[i];
    const next = stops[i + 1];
    if (clamped >= cur.cp && clamped <= next.cp) {
      leftStop = cur;
      rightStop = next;
      break;
    }
  }

  if (leftStop.cp === rightStop.cp) {
    return `rgb(${leftStop.color.join(',')})`;
  }

  const ratio = (clamped - leftStop.cp) / (rightStop.cp - leftStop.cp);
  const channels = leftStop.color.map((ch, idx) =>
    Math.round(ch + (rightStop.color[idx] - ch) * ratio),
  );

  return `rgb(${channels.join(',')})`;
}

/**
 * Retourne une valeur normalisée pour le tri « engine ».
 * Plus la valeur est haute, meilleur est le coup POUR LE CAMP qui joue.
 * On inverse le signe si les noirs ont le trait.
 */
export function getMoveEnginePreference(
  move: { uci?: string },
  fen: string,
  annotations: Record<string, AnnotationData>,
): number {
  if (!move.uci) return 0;
  const raw = annotations[move.uci]?.score ?? 0;
  const sideToMove = fen.split(' ')[1] || 'w';
  return sideToMove === 'w' ? raw : -raw;
}
