import { create } from 'zustand';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastState {
  toasts: Toast[];
}

interface ToastActions {
  addToast: (message: string, type: Toast['type'], duration?: number) => void;
  removeToast: (id: string) => void;
}

let nextId = 0;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const useToastStore = create<ToastState & ToastActions>()((set, get) => ({
  toasts: [],
  addToast: (message, type, duration = 4000) => {
    const id = `toast_${nextId++}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    timers.set(id, setTimeout(() => get().removeToast(id), duration));
  },
  removeToast: (id) => {
    const t = timers.get(id);
    if (t) { clearTimeout(t); timers.delete(id); }
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));
