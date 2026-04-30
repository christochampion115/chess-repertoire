const listeners = new Map();

export const eventBus = {
  on(event, listener) {
    if (!listeners.has(event)) listeners.set(event, []);
    listeners.get(event).push(listener);
  },

  off(event, listener) {
    if (!listeners.has(event)) return;
    listeners.set(event, listeners.get(event).filter(l => l !== listener));
  },

  emit(event, payload) {
    if (!listeners.has(event)) return;
    listeners.get(event).forEach(listener => listener(payload));
  }
};
