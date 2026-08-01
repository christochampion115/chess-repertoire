import { create } from 'zustand';
import { useRepertoireStore } from './repertoireStore';
import { useChessStore } from './chessStore';
import { useStatsStore } from './statsStore';
import { useAnalysisStore } from './analysisStore';
import { useAuthStore } from './authStore';
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
  /** auth token saved before tutorial starts — cleared on the store to block all API calls */
  savedToken: string;
}

interface TutorialActions {
  startTutorial: () => void;
  endTutorial: () => void;
  cleanupTutorial: () => void;
  nextStep: () => void;
  goToStep: (step: TutorialStep) => void;
  setNavProgress: (val: number) => void;
}

const LS_REPERTOIRE = 'alphaChess-repertoire';
const LS_CHESS = 'alphaChess-chess';
const LS_ANALYSIS = 'alphaChess-analysis';
const LS_STATS = 'alphaChess.statsFilters';
const LS_REP_FOLDERS = 'alphaChess.repFolders';
const SS_SNAPSHOT_KEY = 'alphaChess.tutorialSnapshot';

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

function persistSnapshot(snap: TutorialSnapshot) {
  try { sessionStorage.setItem(SS_SNAPSHOT_KEY, JSON.stringify(snap)); } catch {}
}

function loadPersistedSnapshot(): TutorialSnapshot | null {
  try {
    const raw = sessionStorage.getItem(SS_SNAPSHOT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TutorialSnapshot;
  } catch { return null; }
}

function clearPersistedSnapshot() {
  try { sessionStorage.removeItem(SS_SNAPSHOT_KEY); } catch {}
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
    savedToken: '',

    startTutorial: () => {
      const snap = takeSnapshot();
      persistSnapshot(snap);
      // Disable localStorage BEFORE clearing the token so the empty token is never persisted
      disableLocalStorage();
      const savedToken = useAuthStore.getState().token;
      useAuthStore.getState().setToken('');

      // reset() must run before suppress flags — it hardcodes suppressSync:false in its payload
      useRepertoireStore.getState().reset();
      useChessStore.setState({ chess: new Chess(), selectedSq: null });
      useStatsStore.getState().reset();
      useStatsStore.getState().setFilter('candidatesOpen', false);
      useAnalysisStore.setState({ isEnabled: false, results: [], error: null });

      useRepertoireStore.getState().setSuppressSync(true);
      useRepertoireStore.getState().setSuppressSnapshot(true);

      set({ isActive: true, currentStep: 0, snapshot: snap, navProgress: 0, savedToken });
    },

    cleanupTutorial: () => {
      const snap = useTutorialStore.getState().snapshot ?? loadPersistedSnapshot();
      const savedToken = useTutorialStore.getState().savedToken;

      set({ isActive: false, currentStep: 0, snapshot: null, savedToken: '' });

      useRepertoireStore.getState().setSuppressSync(false);
      useRepertoireStore.getState().setSuppressSnapshot(false);

      // Restore token BEFORE re-enabling localStorage so the empty token is never written to disk
      if (savedToken) useAuthStore.getState().setToken(savedToken);

      enableLocalStorage();

      if (snap) restoreSnapshot(snap);
      clearPersistedSnapshot();
    },

    endTutorial: () => {
      const snap = useTutorialStore.getState().snapshot ?? loadPersistedSnapshot();
      useTutorialStore.getState().cleanupTutorial();
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
