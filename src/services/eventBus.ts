/**
 * EventBus typé — remplace js/events.js.
 *
 * NOTE : pendant la migration, cet EventBus sert de pont vanilla ↔ React.
 * Une fois la migration terminée, préférer les souscriptions Zustand (store.subscribe())
 * pour la communication intra-React.
 */

import type { ActiveModal } from '../types/ui';

export type AppEvents = {
  render: undefined;
  syncDone: undefined;
  closeModals: undefined;
  hideMenus: undefined;
  openModal: Exclude<ActiveModal, null>;
  openContextMenu: { x: number; y: number; items: Array<{ label: string; onClick?: () => void; disabled?: boolean; divider?: boolean; isLabel?: boolean }> };
};

type Listener<T> = (payload: T) => void;

const listeners = new Map<keyof AppEvents, Listener<unknown>[]>();

export const eventBus = {
  on<K extends keyof AppEvents>(event: K, listener: Listener<AppEvents[K]>): void {
    if (!listeners.has(event)) listeners.set(event, []);
    listeners.get(event)!.push(listener as Listener<unknown>);
  },

  off<K extends keyof AppEvents>(event: K, listener: Listener<AppEvents[K]>): void {
    const current = listeners.get(event);
    if (!current) return;
    listeners.set(
      event,
      current.filter((l) => l !== (listener as Listener<unknown>)),
    );
  },

  emit<K extends keyof AppEvents>(
    event: K,
    ...args: AppEvents[K] extends undefined ? [] : [AppEvents[K]]
  ): void {
    listeners.get(event)?.forEach((l) => l(args[0] as unknown));
  },
};
