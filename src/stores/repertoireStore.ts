import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Color } from '@/types/chess';
import type { RepertoireNode, RepFolders } from '@/types/repertoire';

interface RepertoireState {
  repertoires: RepertoireNode[];
  activeRepIndex: number;
  /** ID du nœud courant — remplace la référence directe currentNode de state.js */
  currentNodeId: string | null;
  /** Pile de nœuds pour la navigation avant (redo) */
  redoStack: string[];
  /** ID du nœud ciblé par le menu contextuel */
  menuTargetId: string | null;
  /** Incrémenté après chaque mutation pour forcer le re-render React */
  version: number;
  freePlayRoot: RepertoireNode | null;
  /**
   * Sets de nœuds expandés — Set<string> en mémoire.
   * Sérialiser en string[] pour localStorage (Set n'est pas JSON-sérialisable).
   */
  treeExpanded: Set<string>;
  repExpanded: Set<string>;
  openPanels: { repertoire: boolean; arbre: boolean };
  selectedColor: Color;
  repFolders: RepFolders;
  pendingNewRepFolderId: string | null;
  pendingNewRepFolderName: string | null;
  deleteTargetIdx: number;
  pendingDeleteType: string;
  varNameConflictConfirmed: boolean;
  ignoreOverlayClose: boolean;
  /** true pendant les imports PGN en masse (évite O(n) sérialisations) */
  suppressSync: boolean;
  /** true pendant les imports PGN en masse (évite O(n) clones + rebuilds) */
  suppressSnapshot: boolean;
  /** IDs locaux des répertoires modifiés depuis le dernier sync (non persisté) */
  dirtyIds: Set<string>;
  /** localRootId → server DB id (non persisté, reconstruit au bootstrap) */
  serverIdMap: Record<string, number>;
  /** localRootId → dernier updatedAt server connu ISO (non persisté) */
  serverUpdatedAtMap: Record<string, string>;
}

interface RepertoireActions {
  setRepertoires: (reps: RepertoireNode[]) => void;
  setActiveRepIndex: (idx: number) => void;
  setCurrentNodeId: (id: string | null) => void;
  setFreePlayRoot: (node: RepertoireNode | null) => void;
  toggleTreeExpanded: (id: string) => void;
  toggleRepExpanded: (id: string) => void;
  setTreeExpanded: (ids: Set<string>) => void;
  togglePanel: (panel: keyof RepertoireState['openPanels']) => void;
  setSelectedColor: (color: Color) => void;
  setRepFolders: (folders: RepFolders) => void;
  setPendingNewRepFolder: (folderId: string | null, folderName: string | null) => void;
  setDeleteTarget: (idx: number, type: string) => void;
  setMenuTargetId: (id: string | null) => void;
  setIgnoreOverlayClose: (val: boolean) => void;
  setSuppressSync: (val: boolean) => void;
  setSuppressSnapshot: (val: boolean) => void;
  setVarNameConflictConfirmed: (val: boolean) => void;
  markDirty: (id: string) => void;
  clearDirty: (id: string) => void;
  setServerIdMap: (map: Record<string, number>) => void;
  setServerId: (localId: string, serverId: number) => void;
  removeServerMapping: (localId: string) => void;
  setServerUpdatedAt: (localId: string, updatedAt: string) => void;
  reset: () => void;
}

export const useRepertoireStore = create<RepertoireState & RepertoireActions>()(
  persist(
    (set) => ({
  repertoires: [],
  activeRepIndex: -1,
  currentNodeId: null,
  redoStack: [],
  menuTargetId: null,
  version: 0,
  freePlayRoot: null,
  treeExpanded: new Set(),
  repExpanded: new Set(),
  openPanels: { repertoire: false, arbre: false },
  selectedColor: 'w',
  repFolders: {},
  pendingNewRepFolderId: null,
  pendingNewRepFolderName: null,
  deleteTargetIdx: -1,
  pendingDeleteType: '',
  varNameConflictConfirmed: false,
  ignoreOverlayClose: false,
  suppressSync: false,
  suppressSnapshot: false,
  dirtyIds: new Set<string>(),
  serverIdMap: {},
  serverUpdatedAtMap: {},

  setRepertoires: (reps) => set({ repertoires: reps }),
  markDirty: (id) => set((s) => { const next = new Set(s.dirtyIds); next.add(id); return { dirtyIds: next }; }),
  clearDirty: (id) => set((s) => { const next = new Set(s.dirtyIds); next.delete(id); return { dirtyIds: next }; }),
  setServerIdMap: (map) => set({ serverIdMap: map }),
  setServerId: (localId, serverId) => set((s) => ({ serverIdMap: { ...s.serverIdMap, [localId]: serverId } })),
  removeServerMapping: (localId) => set((s) => {
    const { [localId]: _sid, ...restIds } = s.serverIdMap;
    const { [localId]: _sat, ...restAt } = s.serverUpdatedAtMap;
    return { serverIdMap: restIds, serverUpdatedAtMap: restAt };
  }),
  setServerUpdatedAt: (localId, updatedAt) => set((s) => ({ serverUpdatedAtMap: { ...s.serverUpdatedAtMap, [localId]: updatedAt } })),
  setActiveRepIndex: (idx) => set({ activeRepIndex: idx }),
  setCurrentNodeId: (id) => set({ currentNodeId: id }),
  setFreePlayRoot: (node) => set({ freePlayRoot: node }),
  toggleTreeExpanded: (id) =>
    set((s) => {
      const next = new Set(s.treeExpanded);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { treeExpanded: next };
    }),
  toggleRepExpanded: (id) =>
    set((s) => {
      const next = new Set(s.repExpanded);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { repExpanded: next };
    }),
  setTreeExpanded: (ids) => set({ treeExpanded: ids }),
  togglePanel: (panel) =>
    set((s) => ({
      openPanels: { ...s.openPanels, [panel]: !s.openPanels[panel] },
    })),
  setSelectedColor: (color) => set({ selectedColor: color }),
  setRepFolders: (folders) => set({ repFolders: folders }),
  setPendingNewRepFolder: (folderId, folderName) =>
    set({ pendingNewRepFolderId: folderId, pendingNewRepFolderName: folderName }),
  setDeleteTarget: (idx, type) => set({ deleteTargetIdx: idx, pendingDeleteType: type }),
  setMenuTargetId: (id) => set({ menuTargetId: id }),
  setIgnoreOverlayClose: (val) => set({ ignoreOverlayClose: val }),
  setSuppressSync: (val) => set({ suppressSync: val }),
  setSuppressSnapshot: (val) => set({ suppressSnapshot: val }),
  setVarNameConflictConfirmed: (val) => set({ varNameConflictConfirmed: val }),
  reset: () => set({
    repertoires: [],
    activeRepIndex: -1,
    currentNodeId: null,
    redoStack: [],
    menuTargetId: null,
    freePlayRoot: null,
    treeExpanded: new Set(),
    repExpanded: new Set(),
    repFolders: {},
    suppressSync: false,
    suppressSnapshot: false,
    dirtyIds: new Set<string>(),
    serverIdMap: {},
    serverUpdatedAtMap: {},
  }),
    }),
    {
      name: 'alphaChess-repertoire',
      partialize: (s) => ({
        repertoires:     s.repertoires,
        activeRepIndex:  s.activeRepIndex,
        repFolders:      s.repFolders,
        selectedColor:   s.selectedColor,
        openPanels:      s.openPanels,
        treeExpanded:    [...s.treeExpanded],
        repExpanded:     [...s.repExpanded],
      }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as object),
        treeExpanded: new Set<string>((persisted as Record<string, unknown>).treeExpanded as string[] ?? []),
        repExpanded: new Set<string>((persisted as Record<string, unknown>).repExpanded as string[] ?? []),
      }),
    },
  ),
);
