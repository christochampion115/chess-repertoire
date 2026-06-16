import { eventBus } from './events.js';

/**
 * Pont entre les modales vanilles et les modales React.
 * Chaque fonction retourne `true` si la modale est gérée par React,
 * `false` pour laisser la gestion vanille inchangée.
 */
export const modalBridge = {
  /** @type {Record<string, boolean>} */
  _reactModals: {
    comment: true,
    'name-variant': true,
    'delete-confirm': true,
    'board-theme': true,
    'new-repertoire': true,
    'rename': true,
    'medals': true,
    'account': true,
    'auth': true,
    'profile': true,
    'player-stats': true,
    'rename-folder': true,
    'folder-group': true,
    'training-stop': true,
    'training-interrupt': true,
  },

  /**
   * @param {'comment'|'name-variant'|'delete-confirm'|'board-theme'|'new-repertoire'|'rename'|'medals'|'account'|'auth'|'profile'|'player-stats'|'rename-folder'|'folder-group'|'training-stop'|'training-interrupt'|string} type
   * @param {Record<string, any>} [data]
   * @returns {boolean} true si React s'en charge
   */
  open(type, data = {}) {
    if (!this._reactModals[type]) return false;
    eventBus.emit('openModal', { type, ...data });
    return true;
  },

  /** Active/désactive une modale React */
  setReactModal(type, enabled = true) {
    this._reactModals[type] = enabled;
  },

  _reactCtxMenu: true,

  /**
   * Ouvre le menu contextuel React
   * @param {{ x: number, y: number, items: Array<{label: string, onClick: () => void, disabled?: boolean}> }} data
   * @returns {boolean} true si React s'en charge
   */
  openContextMenu(data) {
    if (!this._reactCtxMenu) return false;
    eventBus.emit('openContextMenu', data);
    return true;
  },
};
