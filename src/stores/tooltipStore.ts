import { create } from 'zustand';

interface TooltipState {
  x: number;
  y: number;
  content: React.ReactNode | null;
  setTooltip: (x: number, y: number, content: React.ReactNode) => void;
  clearTooltip: () => void;
}

export const useTooltipStore = create<TooltipState>()((set) => ({
  x: 0,
  y: 0,
  content: null,
  setTooltip: (x, y, content) => set({ x, y, content }),
  clearTooltip: () => set({ content: null }),
}));
