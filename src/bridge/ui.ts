/* eslint-disable @typescript-eslint/no-explicit-any */
import { state } from './state';
import { eventBus } from './events';

export function closeModals(): void {
  eventBus.emit('closeModals');
}

export function render(): void {
  eventBus.emit('render');
}

export function handleRightClick(event: MouseEvent, type: string, target: any = null, index = -1): void {
  event.preventDefault();
  event.stopPropagation();

  state.menuTarget = target || state.currentNode;
  eventBus.emit('menuTargetChanged', { id: state.menuTarget?.id ?? null });
  state.contextMenuMove = type === 'stats_move' || type === 'analysis_move' ? target : null;
  state.deleteTargetIdx = index;
  state.pendingDeleteType = type;
  state.contextMenuSource = type;

  const isRepRoot = type === 'repertoire_item';
  const isRepSub = type === 'repertoire_subitem';
  const isNode = type === 'monitor' || type === 'arbre' || type === 'board' || isRepSub;
  const isNotRoot = state.menuTarget && state.menuTarget.parent;
  const showDelete = !(type === 'stats_move' || type === 'analysis_move') && (isRepRoot || (isNode && isNotRoot));

  const items: any[] = [];
  if (isRepRoot) {
    items.push({ label: 'Renommer', onClick: () => { openRenameRepModal(state.menuTarget.id); } });
  }
  if (isRepRoot || isRepSub) {
    items.push({ label: 'Ouvrir dans l\'arbre', onClick: () => { openCurrentNodeInTree(); } });
    items.push({ label: 'Groupe/Dossier', onClick: () => { openFolderGroupModal(); } });
  }
  if (isRepSub) {
    items.push({ label: 'Retirer du répertoire', onClick: () => { removeVariantFromRepertoire(); hideMenus(); } });
  }
  if (showDelete) {
    items.push({ label: isRepRoot ? 'Supprimer le répertoire' : 'Supprimer ce coup', onClick: () => { openDeleteClick(); } });
  }
  if (isNode && isNotRoot && !(type === 'stats_move' || type === 'analysis_move')) {
    items.push({ label: 'Nommer la variante', onClick: () => { openNameVarModal(); } });
  }
  if (state.activeRepIndex !== -1 && !(type === 'stats_move' || type === 'analysis_move')) {
    items.push({ label: 'Commentaire', onClick: () => { openCommentModal(); } });
  }
  if ((type === 'stats_move' || type === 'analysis_move')) {
    items.push({ label: 'Ajouter à l\'arbre', onClick: () => { addSelectedMoveToTree(); } });
    items.push({ label: 'Explorer en free-play', onClick: () => { exploreInFreePlay(); } });
  }
  if (!isRepRoot && !(type === 'stats_move' || type === 'analysis_move')) {
    items.push({ divider: true });
    items.push({ isLabel: true, label: 'Annotations' });
    const symbols = [
      { label: 'Bon coup', sym: '!' },
      { label: 'Coup faible', sym: '?' },
      { label: 'Coup brillant', sym: '!!' },
      { label: 'Gaffe', sym: '??' },
      { label: 'Intéressant', sym: '!?' },
      { label: 'Douteux', sym: '?!' },
    ];
    for (const { label, sym } of symbols) {
      items.push({ label: `${sym}  ${label}`, onClick: () => { selectSymbol(sym); } });
    }
  }

  eventBus.emit('openContextMenu', { x: event.clientX, y: event.clientY, items });
}

function hideMenus(): void {
  eventBus.emit('hideMenus');
}

function openRenameRepModal(id: string): void {
  eventBus.emit('openModal', { type: 'rename', itemId: id });
}

function openCurrentNodeInTree(): void {
  const nodeId = state.menuTarget?.id;
  if (nodeId) eventBus.emit('openInTree', nodeId);
}

function openFolderGroupModal(): void {
  eventBus.emit('openModal', { type: 'rename-folder', folderId: state.menuTarget?.folderId });
}

function removeVariantFromRepertoire(): void {
  eventBus.emit('removeVariant', state.menuTarget?.id);
}

function openDeleteClick(): void {
  eventBus.emit('openModal', { type: 'delete-confirm', itemId: state.menuTarget?.id });
}

function openNameVarModal(): void {
  eventBus.emit('openModal', { type: 'name-variant', nodeId: state.menuTarget?.id });
}

function openCommentModal(): void {
  eventBus.emit('openModal', { type: 'comment', nodeId: state.menuTarget?.id });
}

function addSelectedMoveToTree(): void {
  eventBus.emit('addMoveToTree', state.contextMenuMove);
}

function exploreInFreePlay(): void {
  eventBus.emit('exploreFreePlay', state.contextMenuMove);
}

function selectSymbol(sym: string): void {
  eventBus.emit('selectSymbol', sym);
  hideMenus();
}

export function openAccountModal(): void {
  eventBus.emit('openModal', { type: 'auth' });
}

export function showTrainingConfirmModal(node: any): void {
  eventBus.emit('openModal', { type: 'training-confirm', rootId: node.id, mode: 'vertical' });
}


