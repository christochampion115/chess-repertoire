export interface User {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
}

export type AuthStatus = 'guest' | 'logged' | 'loading';
export type SyncStatus = 'idle' | 'syncing' | 'error' | 'success';
export type AuthFormMode = 'login' | 'signup';

export interface AuthState {
  user: User | null;
  token: string;
  status: AuthStatus;
  error: string;
  isSubmitting: boolean;
  syncStatus: SyncStatus;
  syncMessage: string;
  formMode: AuthFormMode;
  isGuestMode: boolean;
}
