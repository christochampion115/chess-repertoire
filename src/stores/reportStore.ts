import { create } from 'zustand';
import type { ReportParams, ReportData } from '@/types/report';

type ViewMode = 'form' | 'loading' | 'results';

interface ReportState {
  view: ViewMode;
  params: ReportParams;
  progress: { pct: number; label: string; estimate: string };
  data: ReportData | null;
  error: string | null;
  abortController: AbortController | null;
}

interface ReportActions {
  setView: (view: ViewMode) => void;
  setParams: (params: Partial<ReportParams>) => void;
  setProgress: (progress: { pct: number; label: string }) => void;
  setData: (data: ReportData) => void;
  setError: (error: string | null) => void;
  setAbortController: (ctrl: AbortController | null) => void;
  cancelReport: () => void;
  reset: () => void;
}

const DEFAULT_PARAMS: ReportParams = {
  username: '',
  color: 'white',
  timeClass: 'blitz',
  dateFrom: '',
  dateTo: '',
  eloMin: 0,
  eloMax: 3000,
  startFen: '',
  startPath: '',
};

export const useReportStore = create<ReportState & ReportActions>()((set, get) => ({
  view: 'form',
  params: { ...DEFAULT_PARAMS },
  progress: { pct: 0, label: '', estimate: '' },
  data: null,
  error: null,
  abortController: null,

  setView: (view) => set({ view }),
  setParams: (patch) => {
    if ('startFen' in patch) console.log('[DEBUG setParams] startFen →', patch.startFen, '| stack:', new Error().stack?.split('\n').slice(2, 6).join(' | '));
    set((s) => ({ params: { ...s.params, ...patch } }));
  },
  setProgress: (progress) => set((s) => ({ progress: { ...s.progress, ...progress } })),
  setData: (data) => set({ data }),
  setError: (error) => set({ error }),
  setAbortController: (ctrl) => set({ abortController: ctrl }),
  cancelReport: () => {
    const { abortController } = get();
    if (abortController) abortController.abort();
    set({
      view: 'form',
      data: null,
      error: null,
      progress: { pct: 0, label: '', estimate: '' },
      abortController: null,
    });
  },
  reset: () => set({
    view: 'form',
    data: null,
    error: null,
    progress: { pct: 0, label: '', estimate: '' },
    abortController: null,
  }),
}));
