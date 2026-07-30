import { create } from 'zustand';
import { useRepertoireStore } from './repertoireStore';
import { useChessStore } from './chessStore';
import { useStatsStore } from './statsStore';
import { useAnalysisStore } from './analysisStore';
import { Chess } from 'chess.js';

export type TutorialStep = number;

export interface TutorialSnapshot {
  repertoire: string | null;
  chess: string | null;
  analysis: string | null;
  stats: string | null;
  repFolders: string | null;
  previousPath: string;
}

interface TutorialState {
  isActive: boolean;
  currentStep: TutorialStep;
  snapshot: TutorialSnapshot | null;
  navProgress: number;
}

interface TutorialActions {
  startTutorial: () => void;
  endTutorial: () => void;
  nextStep: () => void;
  goToStep: (step: TutorialStep) => void;
  setNavProgress: (val: number) => void;
}

const LS_REPERTOIRE = 'alphaChess-repertoire';
const LS_CHESS = 'alphaChess-chess';
const LS_ANALYSIS = 'alphaChess-analysis';
const LS_STATS = 'alphaChess.statsFilters';
const LS_REP_FOLDERS = 'alphaChess.repFolders';

function takeSnapshot(): TutorialSnapshot {
  return {
    repertoire: localStorage.getItem(LS_REPERTOIRE),
    chess: localStorage.getItem(LS_CHESS),
    analysis: localStorage.getItem(LS_ANALYSIS),
    stats: localStorage.getItem(LS_STATS),
    repFolders: localStorage.getItem(LS_REP_FOLDERS),
    previousPath: window.location.pathname,
  };
}

function restoreSnapshot(snap: TutorialSnapshot) {
  const write = (key: string, val: string | null) => {
    if (val !== null) localStorage.setItem(key, val);
    else localStorage.removeItem(key);
  };
  write(LS_REPERTOIRE, snap.repertoire);
  write(LS_CHESS, snap.chess);
  write(LS_ANALYSIS, snap.analysis);
  write(LS_STATS, snap.stats);
  write(LS_REP_FOLDERS, snap.repFolders);
}

let _origStorage: {
  setItem: typeof localStorage.setItem;
  removeItem: typeof localStorage.removeItem;
  clear: typeof localStorage.clear;
} | null = null;

function disableLocalStorage() {
  _origStorage = {
    setItem: localStorage.setItem.bind(localStorage),
    removeItem: localStorage.removeItem.bind(localStorage),
    clear: localStorage.clear.bind(localStorage),
  };
  localStorage.setItem = (() => {}) as typeof localStorage.setItem;
  localStorage.removeItem = (() => {}) as typeof localStorage.removeItem;
  localStorage.clear = (() => {}) as typeof localStorage.clear;
}

function enableLocalStorage() {
  if (!_origStorage) return;
  localStorage.setItem = _origStorage.setItem;
  localStorage.removeItem = _origStorage.removeItem;
  localStorage.clear = _origStorage.clear;
  _origStorage = null;
}

export const useTutorialStore = create<TutorialState & TutorialActions>()(
  (set) => ({
    isActive: false,
    currentStep: 0,
    snapshot: null,
    navProgress: 0,

    startTutorial: () => {
      const snap = takeSnapshot();
      disableLocalStorage();

      useRepertoireStore.getState().setSuppressSync(true);
      useRepertoireStore.getState().setSuppressSnapshot(true);

      useRepertoireStore.getState().reset();
      useChessStore.setState({ chess: new Chess(), selectedSq: null });
      useStatsStore.getState().reset();
      useStatsStore.getState().setFilter('candidatesOpen', false);
      useAnalysisStore.setState({ isEnabled: false, results: [], error: null });
      set({ isActive: true, currentStep: 0, snapshot: snap, navProgress: 0 });
    },

    endTutorial: () => {
      const snap = useTutorialStore.getState().snapshot;

      set({ isActive: false, currentStep: 0, snapshot: null });

      useRepertoireStore.getState().setSuppressSync(false);
      useRepertoireStore.getState().setSuppressSnapshot(false);

      enableLocalStorage();

      if (snap) restoreSnapshot(snap);

      window.location.href = snap?.previousPath || '/';
    },

    nextStep: () => {
      set((s) => ({ currentStep: s.currentStep + 1 }));
    },

    goToStep: (step) => {
      set({ currentStep: step });
    },

    setNavProgress: (val) => {
      set({ navProgress: val });
    },
  }),
);
