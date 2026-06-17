/**
 * Clés localStorage de l'application — source unique de vérité.
 * Remplace les chaînes dupliquées dans main.js, auth.js, etc.
 */
export const STORAGE_KEYS = {
  BOARD_THEME: 'alphaChess.boardTheme',
  REP_FOLDERS: 'alphaChess.repFolders',
  ANALYSIS_SETTINGS: 'alphaChess.analysisSettings',
  STATS_FILTERS: 'alphaChess.statsFilters',
  REPERTOIRES: 'alphaChess.repertoires',
  AUTH_TOKEN: 'alphaChess.token',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export function saveItem<T>(key: StorageKey, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('[storage] save failed', key, err);
  }
}

export function loadItem<T>(key: StorageKey): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (err) {
    console.warn('[storage] load failed', key, err);
    return null;
  }
}

export function removeItem(key: StorageKey): void {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.warn('[storage] remove failed', key, err);
  }
}

// ─── Generic string-key versions (legacy bridge compat) ────────────────────

export function saveState(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('Storage save failed', e);
  }
}

export function loadState<T = unknown>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (e) {
    console.warn('Storage load failed', e);
    return null;
  }
}

export function clearState(key: string): void {
  localStorage.removeItem(key);
}
