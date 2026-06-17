import type { Color, Square } from './chess';

export type TrainingPhase =
  | 'idle'
  | 'confirming'
  | 'active'
  | 'playing'
  | 'paused'
  | 'victory'
  | 'defeat';

export type TrainingMode =
  | 'survival'
  | 'vertical'
  | 'horizontal'
  | 'express'
  | 'randomizer';

export interface TrainingFeedback {
  type: 'correct' | 'wrong' | 'retry';
  from: Square;
  to: Square;
}

export interface SurvivalMistake {
  nodeId: string;
  fen: string;
  path: string;
  expectedSan: string;
  playedSan: string;
  nodeTurn: Color;
}

export interface SurvivalReport {
  mistakes: SurvivalMistake[];
  score: number;
  mode: TrainingMode;
  totalTargets: number;
  livesLeft?: number;
  goldenHeart?: boolean;
  progressPercent?: number;
  correct?: number;
  completed?: number;
  startNodeId?: string;
  repColor?: Color;
}

export type MedalTier = 'none' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'chrome';

export const SURVIVAL_LIVES = 3;
export const SURVIVAL_LIFE_BONUS_INTERVAL = 20;

export const MEDAL_RANK: Record<MedalTier, number> = {
  none: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
  diamond: 5,
  chrome: 6,
};
