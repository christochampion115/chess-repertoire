import { create } from 'zustand';
import type { Color } from '@/types/chess';
import type { RepertoireNode } from '@/types/repertoire';
import {
  SURVIVAL_LIVES,
  type TrainingPhase,
  type TrainingMode,
  type TrainingFeedback,
  type SurvivalMistake,
  type SurvivalReport,
} from '@/types/training';

interface TrainingState {
  phase: TrainingPhase;
  root: RepertoireNode | null;
  repColor: Color | null;
  mode: TrainingMode;
  label: string;
  visited: Set<string>;
  ignoredNoReply: Set<string>;
  answered: Set<string>;
  skippedByError: Set<string>;
  completedTargets: Set<string>;
  expectedChildId: string | null;
  totalTargets: number;
  lives: number;
  maxLives: number;
  goldenHeart: boolean;
  milestones: number;
  mistakes: SurvivalMistake[];
  lastSurvivalReport: SurvivalReport | null;
  lastVictoryReport: SurvivalReport | null;
  feedback: TrainingFeedback | null;
}

interface TrainingActions {
  setPhase: (phase: TrainingPhase) => void;
  startTraining: (
    root: RepertoireNode,
    repColor: Color,
    mode: TrainingMode,
    label: string,
  ) => void;
  endTraining: () => void;
  setFeedback: (fb: TrainingFeedback | null) => void;
  addMistake: (mistake: SurvivalMistake) => void;
  /** Perd une vie (consomme goldenHeart en premier si disponible) */
  loseLife: () => void;
  gainGoldenHeart: () => void;
  markVisited: (nodeId: string) => void;
  markAnswered: (nodeId: string) => void;
  markCompleted: (nodeId: string) => void;
  markSkipped: (nodeId: string) => void;
  unmarkSkipped: (nodeId: string) => void;
  setExpectedChildId: (id: string | null) => void;
  setTotalTargets: (n: number) => void;
  incrementMilestones: () => void;
  markIgnoredNoReply: (nodeId: string) => void;
  setLastReports: (
    survival: SurvivalReport | null,
    victory: SurvivalReport | null,
  ) => void;
}


const EMPTY_SETS = () => ({
  visited: new Set<string>(),
  ignoredNoReply: new Set<string>(),
  answered: new Set<string>(),
  skippedByError: new Set<string>(),
  completedTargets: new Set<string>(),
});

export const useTrainingStore = create<TrainingState & TrainingActions>()((set) => ({
  phase: 'idle',
  root: null,
  repColor: null,
  mode: 'vertical',
  label: '',
  ...EMPTY_SETS(),
  expectedChildId: null,
  totalTargets: 0,
  lives: SURVIVAL_LIVES,
  maxLives: SURVIVAL_LIVES,
  goldenHeart: false,
  milestones: 0,
  mistakes: [],
  lastSurvivalReport: null,
  lastVictoryReport: null,
  feedback: null,

  setPhase: (phase) => set({ phase }),

  startTraining: (root, repColor, mode, label) =>
    set({
      phase: 'active',
      root,
      repColor,
      mode,
      label,
      ...EMPTY_SETS(),
      expectedChildId: null,
      totalTargets: 0,
      lives: SURVIVAL_LIVES,
      maxLives: SURVIVAL_LIVES,
      goldenHeart: false,
      milestones: 0,
      mistakes: [],
      feedback: null,
    }),

  endTraining: () => set({
    phase: 'idle',
    root: null,
    repColor: null,
    mode: 'vertical',
    label: '',
    ...EMPTY_SETS(),
    expectedChildId: null,
    totalTargets: 0,
    lives: SURVIVAL_LIVES,
    maxLives: SURVIVAL_LIVES,
    goldenHeart: false,
    milestones: 0,
    mistakes: [],
    lastSurvivalReport: null,
    lastVictoryReport: null,
    feedback: null,
  }),

  setFeedback: (feedback) => set({ feedback }),

  addMistake: (mistake) => set((s) => ({ mistakes: [...s.mistakes, mistake] })),

  loseLife: () =>
    set((s) => {
      if (s.goldenHeart) return { goldenHeart: false };
      return { lives: Math.max(0, s.lives - 1) };
    }),

  gainGoldenHeart: () => set({ goldenHeart: true }),

  markVisited: (nodeId) =>
    set((s) => ({ visited: new Set(s.visited).add(nodeId) })),

  markIgnoredNoReply: (nodeId) =>
    set((s) => ({ ignoredNoReply: new Set(s.ignoredNoReply).add(nodeId) })),

  markAnswered: (nodeId) =>
    set((s) => ({ answered: new Set(s.answered).add(nodeId) })),

  markCompleted: (nodeId) =>
    set((s) => ({ completedTargets: new Set(s.completedTargets).add(nodeId) })),

  markSkipped: (nodeId) =>
    set((s) => ({ skippedByError: new Set(s.skippedByError).add(nodeId) })),

  unmarkSkipped: (nodeId) =>
    set((s) => {
      const next = new Set(s.skippedByError);
      next.delete(nodeId);
      return { skippedByError: next };
    }),

  setExpectedChildId: (id) => set({ expectedChildId: id }),

  setTotalTargets: (n) => set({ totalTargets: n }),

  incrementMilestones: () => set((s) => ({ milestones: s.milestones + 1 })),

  setLastReports: (survival, victory) =>
    set({ lastSurvivalReport: survival, lastVictoryReport: victory }),
}));
