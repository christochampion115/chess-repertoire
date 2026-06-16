import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LichessStats, StatsFilters } from '@/types/stats';

interface StatsState {
  data: LichessStats | null;
  loading: boolean;
  error: string | null;
  selectedUci: string;
  showAll: boolean;
  currentRequestKey: string;
  eloMiniLoading: boolean;
  eloMiniLoaderUntil: number;
  filters: StatsFilters;
}

interface StatsActions {
  setData: (data: LichessStats | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSelectedUci: (uci: string) => void;
  setShowAll: (val: boolean) => void;
  setCurrentRequestKey: (key: string) => void;
  setEloMiniLoading: (loading: boolean, until?: number) => void;
  setFilter: <K extends keyof StatsFilters>(key: K, value: StatsFilters[K]) => void;
  setFilters: (filters: Partial<StatsFilters>) => void;
  reset: () => void;
}

const DEFAULT_FILTERS: StatsFilters = {
  eloPanelOpen: false,
  sortPanelOpen: false,
  eloMin: 0,
  eloMax: 3000,
  currentDatabase: 'lichess',
  sortBy: 'frequency',
  candidatesOpen: true,
  playerUsername: '',
  playerColor: 'white',
  playerTimeClass: 'all',
  playerDateFrom: '',
  playerDateTo: '',
  playerEloMin: 0,
  playerEloMax: 3000,
};

export const useStatsStore = create<StatsState & StatsActions>()(
  persist(
    (set) => ({
  data: null,
  loading: false,
  error: null,
  selectedUci: '',
  showAll: false,
  currentRequestKey: '',
  eloMiniLoading: false,
  eloMiniLoaderUntil: 0,
  filters: { ...DEFAULT_FILTERS },

  setData: (data) => set({ data }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setSelectedUci: (uci) => set({ selectedUci: uci }),
  setShowAll: (val) => set({ showAll: val }),
  setCurrentRequestKey: (key) => set({ currentRequestKey: key }),
  setEloMiniLoading: (loading, until = 0) =>
    set({ eloMiniLoading: loading, eloMiniLoaderUntil: until }),
  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value } })),
  setFilters: (patch) =>
    set((s) => ({ filters: { ...s.filters, ...patch } })),
  reset: () => set({ data: null, loading: false, error: null, selectedUci: '' }),
    }),
    {
      name: 'alphaChess.statsFilters',     // même clé que l'app vanilla
      partialize: (s) => ({ filters: s.filters }),
    },
  ),
);
