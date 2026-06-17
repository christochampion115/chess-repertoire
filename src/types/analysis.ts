export interface AnalysisLine {
  pv: string;
  score: number;
  depth: number;
  uci: string;
  mate?: number | null;
  mpvIndex: number;
}

export interface AnalysisSettings {
  multiPV: number;
  showArrows: boolean;
  arrowCount: number;
}

/**
 * Annotation d'un coup consolidée.
 *
 * Remplace les trois maps parallèles de state.js :
 *   moveAnnotationScores, moveAnnotationValues, moveAnnotationPvs
 * → Record<string, AnnotationData>
 */
export interface AnnotationData {
  score: number;
  value: string; // '!', '?', '!!', '??', '!?', '?!'
  pv: string;
  depth: number;
}
