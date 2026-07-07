import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, AuthState, AuthStatus, SyncStatus, AuthFormMode } from '@/types/auth';

interface AuthActions {
  setUser: (user: User | null) => void;
  setToken: (token: string) => void;
  setStatus: (status: AuthStatus) => void;
  setError: (error: string) => void;
  setSubmitting: (val: boolean) => void;
  setSyncStatus: (status: SyncStatus, message?: string) => void;
  setFormMode: (mode: AuthFormMode) => void;
  setGuestMode: (val: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set) => ({
  user: null,
  token: '',
  status: 'loading',
  error: '',
  isSubmitting: false,
  syncStatus: 'idle',
  syncMessage: '',
  formMode: 'login',
  isGuestMode: false,

  setUser: (user) => set({ user }),
  setToken: (token) => set({ token }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  setSubmitting: (val) => set({ isSubmitting: val }),
  setSyncStatus: (status, message = '') =>
    set({ syncStatus: status, syncMessage: message }),
  setFormMode: (mode) => set({ formMode: mode }),
  setGuestMode: (val) => set({ isGuestMode: val }),
  logout: () =>
    set({
      user: null,
      token: '',
      status: 'loading',
      error: '',
      syncStatus: 'idle',
      syncMessage: '',
      isGuestMode: false,
    }),
    }),
    {
      name: 'alphaChess-auth',
      partialize: (s) => ({
        user: s.user,
        token: s.token,
        status: s.status,
        isGuestMode: s.isGuestMode,
      }),
    },
  ),
);
