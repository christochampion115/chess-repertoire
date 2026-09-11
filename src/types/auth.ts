export interface User {
  id: string;
  username: string;
  email: string | null;
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
  /** id du compte dont la session a expiré — permet de préserver les données locales jusqu'à re-login du même compte */
  expiredUserId: string | null;
}
