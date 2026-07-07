import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Chess } from 'chess.js';
import type { Square, BoardTheme } from '@/types/chess';

interface ChessState {
  chess: Chess;
  selectedSq: Square | null;
  boardFlipped: boolean;
  pendingAnimation: { fromSq: Square; toSq: Square } | null;
  skipNextAnimation: boolean;
  boardTheme: BoardTheme;
}

interface ChessActions {
  flipBoard: () => void;
  selectSquare: (sq: Square | null) => void;
  reset: () => void;
  setPendingAnimation: (anim: { fromSq: Square; toSq: Square } | null) => void;
  setSkipNextAnimation: (skip: boolean) => void;
  setBoardTheme: (theme: BoardTheme) => void;
}

const DEFAULT_THEME: BoardTheme = { light: '#ebecd0', dark: '#779556' };

export const useChessStore = create<ChessState & ChessActions>()(
  persist(
    (set) => ({
      chess: new Chess(),
      selectedSq: null,
      boardFlipped: false,
      pendingAnimation: null,
      skipNextAnimation: false,
      boardTheme: DEFAULT_THEME,

      flipBoard: () => set((s) => ({ boardFlipped: !s.boardFlipped })),
      selectSquare: (sq) => set({ selectedSq: sq }),
      reset: () => set({ chess: new Chess(), selectedSq: null, boardTheme: DEFAULT_THEME }),
      setPendingAnimation: (anim) => set({ pendingAnimation: anim }),
      setSkipNextAnimation: (skip) => set({ skipNextAnimation: skip }),
      setBoardTheme: (theme) => set({ boardTheme: theme }),
    }),
    {
      name: 'alphaChess-chess',
      partialize: (s) => ({
        boardTheme: s.boardTheme,
        boardFlipped: s.boardFlipped,
      }),
    },
  ),
);
