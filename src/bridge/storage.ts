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
