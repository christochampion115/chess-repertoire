type Listener = (...args: unknown[]) => void;
const listeners = new Map<string, Listener[]>();

export const eventBus = {
  on(event: string, listener: Listener) {
    if (!listeners.has(event)) listeners.set(event, []);
    listeners.get(event)!.push(listener);
  },
  off(event: string, listener: Listener) {
    if (!listeners.has(event)) return;
    listeners.set(event, listeners.get(event)!.filter(l => l !== listener));
  },
  emit(event: string, payload?: unknown) {
    if (!listeners.has(event)) return;
    listeners.get(event)!.forEach(listener => listener(payload));
  },
};
