import type React from 'react';
import type { RepertoireNode } from '@/types/repertoire';
import { useRepertoireStore } from '@/stores/repertoireStore';
import { useTrainingStore } from '@/stores/trainingStore';
import { useUiStore } from '@/stores/uiStore';
import type { CtxMenuItem } from '@/stores/uiStore';
import {
  getNode,
  switchToFreePlay,
  playUciMove,
  navigateToNode,
  nodeMap,
  _writeRepertoireSnapshot,
  initNodeMap,
  _incrementVersion,
  removeFolderGroup,
  cleanupOrphanedFolders,
} from '@/services/repertoire';
import { scheduleRepertoireSync } from '@/services/authService';

type ContextMenuType =
  | 'arbre'
  | 'monitor'
  | 'board'
  | 'repertoire_item'
  | 'repertoire_subitem'
  | 'repertoire_folder'
  | 'variant_folder'
  | 'stats_move'
  | 'analysis_move'
  | string;

interface CandidateMove {
  uci?: string;
  san?: string;
}

function _isTopLevelVariant(nodeId: string): boolean {
  const { repertoires } = useRepertoireStore.getState();
  let current = nodeMap.get(nodeId);
  while (current?.parentId) {
    const parent = nodeMap.get(current.parentId);
    if (!parent) break;
    if (parent.varName) return false;
    if (repertoires.some(r => r.id === parent.id)) return true;
    current = parent;
  }
  return true;
}

function _ungroupItem(nodeId: string): void {
  const node = nodeMap.get(nodeId);
  if (!node) return;
  node.folderId = undefined;
  _writeRepertoireSnapshot();
  initNodeMap();
  _incrementVersion();
  scheduleRepertoireSync();
  cleanupOrphanedFolders();
}

export function buildContextMenu(
  event: MouseEvent | React.MouseEvent,
  type: ContextMenuType,
  target: RepertoireNode | CandidateMove | null = null,
  index = -1,
  folderId?: string,
): void {
  if (useTrainingStore.getState().phase !== 'idle') return;

  event.preventDefault();
  event.stopPropagation();

  const repStore = useRepertoireStore.getState();
  const uiStore  = useUiStore.getState();

  const isMoveContext = type === 'stats_move' || type === 'analysis_move';

  const menuTarget: RepertoireNode | null = isMoveContext
    ? (getNode(repStore.currentNodeId ?? '') ?? null)
    : ((target as RepertoireNode) ?? getNode(repStore.currentNodeId ?? '') ?? null);

  repStore.setMenuTargetId(menuTarget?.id ?? null);
  repStore.setDeleteTarget(index, type);

  const isRepRoot  = type === 'repertoire_item';
  const isRepSub   = type === 'repertoire_subitem';
  const isRepFld   = type === 'repertoire_folder';
  const isVarFld   = type === 'variant_folder';
  const isFolder   = isRepFld || isVarFld;
  const isNode     = type === 'monitor' || type === 'arbre' || type === 'board' || isRepSub;
  const isNotRoot  = !!(menuTarget?.parentId);
  const showDelete      = !isMoveContext && !isFolder && type !== 'board' && (isRepRoot || (isNode && isNotRoot));

  const items: CtxMenuItem[] = [];

  // ---- Dossier (en-tête de dossier répertoire ou variante) ------------
  if (isFolder) {
    const fid = folderId ?? '';
    items.push({
      label: 'Renommer le dossier',
      onClick: () => {
        uiStore.closeCtxMenu();
        uiStore.openModal({ type: 'rename-folder', folderId: fid });
      },
    });
    items.push({
      label: 'Supprimer le dossier',
      color: '#f87171',
      onClick: () => {
        uiStore.closeCtxMenu();
        removeFolderGroup(fid);
      },
    });
    uiStore.openCtxMenu({
      x: (event as MouseEvent).clientX,
      y: (event as MouseEvent).clientY,
      items,
      targetId: menuTarget?.id,
      source: type,
    });
    return;
  }

  // ---- Ouvrir dans l'arbre (rep items) ----
  if (isRepRoot || isRepSub) {
    items.push({
      label: 'Ouvrir dans l\'arbre',
      onClick: () => {
        uiStore.closeCtxMenu();
        _openNodeInTree(menuTarget);
      },
    });
  }

  // ---- Annoter (tous les nœuds sauf dossiers et move-context) ----
  if (!isFolder && !isMoveContext) {
    items.push({
      label: 'Annoter',
      onClick: () => {
        uiStore.closeCtxMenu();
        uiStore.openModal({ type: 'annotation' });
      },
    });
  }

  // ---- Renommer (répertoire root) ----
  if (isRepRoot) {
    items.push({
      label: 'Renommer',
      onClick: () => {
        uiStore.closeCtxMenu();
        uiStore.openModal({ type: 'rename', itemId: menuTarget?.id ?? '' });
      },
    });
  }

  // ---- Nommer / Renommer la variante (node, not root) ----
  if (isNode && isNotRoot && !isMoveContext) {
    items.push({
      label: menuTarget?.varName ? 'Renommer la variante' : 'Nommer la variante',
      onClick: () => {
        uiStore.closeCtxMenu();
        uiStore.openModal({ type: 'name-variant', nodeId: menuTarget?.id ?? '' });
      },
    });
  }

  // ---- Folder ops : rep (always) / subitem (top-level only) ----
  if (isRepRoot || (isRepSub && menuTarget && _isTopLevelVariant(menuTarget.id))) {
    if (menuTarget?.folderId) {
      items.push({
        label: '📁 Sortir du dossier',
        onClick: () => {
          uiStore.closeCtxMenu();
          _ungroupItem(menuTarget!.id);
        },
      });
    } else {
      items.push({
        label: '📁 Grouper en dossier',
        onClick: () => {
          uiStore.closeCtxMenu();
          uiStore.openModal({ type: 'folder-group' });
        },
      });
    }
  }

  // ---- Retirer du répertoire (subitem) ----
  if (isRepSub) {
    items.push({
      label: 'Retirer du répertoire',
      color: '#fb923c',
      onClick: () => {
        uiStore.closeCtxMenu();
        if (menuTarget) _removeVariantFromRepertoire(menuTarget);
      },
    });
  }

  // ---- Supprimer ----
  if (showDelete) {
    items.push({
      label: isRepRoot ? 'Supprimer le répertoire' : 'Supprimer ce coup',
      color: '#f87171',
      onClick: () => {
        uiStore.closeCtxMenu();
        uiStore.openModal({
          type: 'delete-confirm',
          itemId: menuTarget?.id ?? '',
          deleteType: type,
        });
      },
    });
  }

  // ---- Move context (stats / analysis) ----
  if (isMoveContext) {
    const move = target as CandidateMove | null;
    items.push({
      label: 'Ajouter à l\'arbre',
      onClick: () => {
        uiStore.closeCtxMenu();
        _addMoveToTree(move);
      },
    });
    items.push({
      label: 'Explorer en free-play',
      onClick: () => {
        uiStore.closeCtxMenu();
        _exploreInFreePlay(move);
      },
    });
  }

  uiStore.openCtxMenu({
    x: (event as MouseEvent).clientX,
    y: (event as MouseEvent).clientY,
    items,
    targetId: menuTarget?.id,
    targetNode: menuTarget ?? undefined,
    source: type,
    contextMenuMove: isMoveContext ? (target ?? undefined) : undefined,
  });

  if (index !== -1) {
    useRepertoireStore.setState({ deleteTargetIdx: index } as Partial<typeof repStore>);
  }
}

// ------------------------------------------------------------------
// Helpers privés
// ------------------------------------------------------------------

function _openNodeInTree(node: RepertoireNode | null): void {
  if (!node) return;
  const store = useRepertoireStore.getState();
  const repIdx = store.repertoires.findIndex(r => r.id === node.id || _isDescendant(r, node.id));
  if (repIdx !== -1) store.setActiveRepIndex(repIdx);
  navigateToNode(node.id);
  const { openPanels } = store;
  if (!openPanels.arbre) store.togglePanel('arbre');
  if (openPanels.repertoire) store.togglePanel('repertoire');
}

function _removeVariantFromRepertoire(node: RepertoireNode): void {
  function countNamed(n: RepertoireNode): number {
    let count = 0;
    for (const child of n.children) {
      if (child.varName) count++;
      count += countNamed(child);
    }
    return count;
  }

  const sub = countNamed(node);
  if (sub > 0) {
    const plural = sub > 1 ? 's' : '';
    const ok = window.confirm(
      `Cette variante contient ${sub} sous-variante${plural}.\n` +
      `Elles seront aussi retirées du répertoire (les coups restent dans l'arbre). Continuer ?`,
    );
    if (!ok) return;
  }

  function clearNames(n: RepertoireNode): void {
    if (n.varName) {
      n.varName = '';
      n.folderId = undefined;
      n.varAnnotation = '';
    }
    n.children.forEach(clearNames);
  }
  clearNames(node);

  _writeRepertoireSnapshot();
  initNodeMap();
  _incrementVersion();
  scheduleRepertoireSync();
}

function _addMoveToTree(move: CandidateMove | null): void {
  if (!move?.uci) return;
  const repStore = useRepertoireStore.getState();
  const savedNodeId = repStore.currentNodeId;
  playUciMove(move.uci);
  if (savedNodeId) navigateToNode(savedNodeId);
}

function _exploreInFreePlay(move: CandidateMove | null): void {
  if (useRepertoireStore.getState().activeRepIndex !== -1) {
    switchToFreePlay();
  }
  if (move?.uci) playUciMove(move.uci);
}

function _isDescendant(root: RepertoireNode, nodeId: string): boolean {
  function walk(n: RepertoireNode): boolean {
    if (n.id === nodeId) return true;
    return n.children.some(walk);
  }
  return walk(root);
}
