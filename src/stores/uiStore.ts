import { create } from 'zustand';
import type { ActiveModal } from '@/types/ui';
import type { RepertoireNode } from '@/types/repertoire';

export interface CtxMenuItem {
  label: string;
  icon?: string;
  onClick?: () => void;
  disabled?: boolean;
  divider?: boolean;
  isLabel?: boolean;
  color?: string;
}

export interface CtxMenuState {
  x: number;
  y: number;
  items: CtxMenuItem[];
  targetId?: string;
  /** Données cible optionnelles (ex: RepertoireNode) */
  targetNode?: RepertoireNode;
  /** Source du menu (type passé à buildContextMenu) */
  source?: string;
  /** Coup candidat pour addSelectedMoveToTree / exploreInFreePlay */
  contextMenuMove?: unknown;
  /** Clé unique pour le toggle ouverture/fermeture */
  compareKey?: string;
}

export interface CtxMenuActions {
  openCtxMenu: (menu: CtxMenuState) => void;
  closeCtxMenu: () => void;
}

export interface UiState {
  activeModal: ActiveModal;
  ctxMenu: CtxMenuState | null;
}

export interface UiActions {
  openModal: (modal: ActiveModal) => void;
  closeModal: () => void;
}

export const useUiStore = create<UiState & UiActions & CtxMenuActions>()(
  (set) => ({
    activeModal: null,
    ctxMenu: null,

    openModal: (modal) => set({ activeModal: modal }),
    closeModal: () => set({ activeModal: null }),

    openCtxMenu: (menu) => set({ ctxMenu: menu }),
    closeCtxMenu: () => set({ ctxMenu: null }),
  }),
);
