/* eslint-disable @typescript-eslint/no-explicit-any */
import { eventBus } from './events';

export function closeModals(): void {
  eventBus.emit('closeModals');
}

export function openAccountModal(): void {
  eventBus.emit('openModal', { type: 'auth' });
}

export function showTrainingConfirmModal(node: any): void {
  eventBus.emit('openModal', { type: 'training-confirm', rootId: node.id, mode: 'vertical' });
}


