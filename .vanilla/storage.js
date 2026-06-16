export function saveState(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('Storage save failed', error);
  }
}

export function loadState(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Storage load failed', error);
    return null;
  }
}

export function clearState(key) {
  localStorage.removeItem(key);
}
