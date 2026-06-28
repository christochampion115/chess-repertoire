import { Chess } from 'chess.js';
import type { Color, Square } from '@/types/chess';
import type { RepertoireNode } from '@/types/repertoire';
import { useChessStore } from '@/stores/chessStore';
import { useRepertoireStore } from '@/stores/repertoireStore';
import { useTrainingStore } from '@/stores/trainingStore';
import { useUiStore } from '@/stores/uiStore';
import {
  scheduleRepertoireSync,
  registerCreatedRepertoire,
  deleteRepertoireFromBackend,
  syncUserSettings,
} from '../services/authService';
import { loadState, saveState } from '../services/storage';

const FOLDERS_KEY = 'alphaChess.repFolders';
export const nodeMap = new Map<string, RepertoireNode>();
let fenIndex: Map<string, RepertoireNode> | null = null;
let fenIndexRootId: string | null = null;
let _lastCreatedAt = 0;

function _nextCreatedAt(): number {
  const now = Date.now();
  _lastCreatedAt = now > _lastCreatedAt ? now : _lastCreatedAt + 1;
  return _lastCreatedAt;
}

export function normalizeFen(fen: string): string {
  return fen.split(' ')[0];
}

function _walkAndIndex(node: RepertoireNode, parentId: string | null = null): void {
  node.parentId = parentId;
  nodeMap.set(node.id, node);
  for (const child of node.children) {
    _walkAndIndex(child, node.id);
  }
}

function _getActiveRoot(): RepertoireNode | null {
  const { repertoires, activeRepIndex, freePlayRoot } = useRepertoireStore.getState();
  if (activeRepIndex >= 0 && repertoires[activeRepIndex]) {
    return repertoires[activeRepIndex]!;
  }
  return freePlayRoot;
}

function _rebuildFenIndex(): void {
  fenIndex = new Map();
  const root = _getActiveRoot();
  if (!root) return;
  fenIndexRootId = root.id;
  const walk = (node: RepertoireNode) => {
    const nf = normalizeFen(node.fen);
    const existing = fenIndex!.get(nf);
    if (!existing || (node.createdAt ?? 0) < (existing.createdAt ?? 0)) {
      fenIndex!.set(nf, node);
    }
    for (const child of node.children) walk(child);
  };
  walk(root);
}

function _getFenIndex(): Map<string, RepertoireNode> {
  const root = _getActiveRoot();
  const rootId = root?.id ?? null;
  if (!fenIndex || fenIndexRootId !== rootId) {
    _rebuildFenIndex();
  }
  return fenIndex!;
}

function _invalidateFenIndex(): void {
  fenIndex = null;
  fenIndexRootId = null;
}

function _isNodeDescendantOf(nodeId: string, ancestorId: string): boolean {
  let current = nodeMap.get(nodeId);
  while (current) {
    if (current.id === ancestorId) return true;
    if (!current.parentId) break;
    current = nodeMap.get(current.parentId);
  }
  return false;
}

function _nodeIsAbove(nodeAid: string, nodeBid: string): boolean {
  const getPath = (id: string): string[] => {
    const path: string[] = [];
    let cur = nodeMap.get(id);
    while (cur) {
      path.unshift(cur.id);
      cur = cur.parentId ? nodeMap.get(cur.parentId) : undefined;
    }
    return path;
  };

  const pathA = getPath(nodeAid);
  const pathB = getPath(nodeBid);

  for (let i = 0; i < Math.min(pathA.length, pathB.length); i++) {
    if (pathA[i] !== pathB[i]) {
      const parent = nodeMap.get(pathA[i - 1]);
      if (!parent) return true;
      const idxA = parent.children.findIndex(c => c.id === pathA[i]);
      const idxB = parent.children.findIndex(c => c.id === pathB[i]);
      return idxA < idxB;
    }
  }
  return true;
}

function _findTranspositionFast(
  fen: string,
  currentTime: number,
  parentId: string,
): RepertoireNode | null {
  const index = _getFenIndex();
  const nf = normalizeFen(fen);
  const candidate = index.get(nf);
  if (!candidate || (candidate.createdAt ?? 0) >= currentTime) return null;
  if (candidate.children.length === 0) return null;
  if (_isNodeDescendantOf(candidate.id, parentId)) return null;
  return candidate;
}

function _cloneTreeForStore(root: RepertoireNode, parentId: string | null = null): RepertoireNode {
  const clone: RepertoireNode = {
    ...root,
    parentId,
    children: [],
    sourceNodeId: root.sourceNodeId ?? null,
  };
  for (const child of root.children) {
    clone.children.push(_cloneTreeForStore(child, root.id));
  }
  return clone;
}

export function _writeRepertoireSnapshot(): void {
  const store = useRepertoireStore.getState();
  const newReps = store.repertoires.map(r => _cloneTreeForStore(r));
  const newFreePlay = store.freePlayRoot ? _cloneTreeForStore(store.freePlayRoot) : null;
  store.setRepertoires(newReps);
  if (newFreePlay) {
    useRepertoireStore.setState({ freePlayRoot: newFreePlay });
  }
}

function _updateChessPosition(fen: string): void {
  const chess = new Chess();
  chess.load(fen);
  useChessStore.setState({ chess, selectedSq: null });
}

export function sanitizeTranspositions(repertoire: RepertoireNode): void {
  if (!repertoire) return;

  const localMap = new Map<string, RepertoireNode>();
  const indexWalk = (n: RepertoireNode): void => {
    localMap.set(n.id, n);
    for (const c of n.children) indexWalk(c);
  };
  indexWalk(repertoire);

  const isDescendantLocal = (nodeId: string, ancestorId: string): boolean => {
    let cur = localMap.get(nodeId);
    while (cur) {
      if (cur.id === ancestorId) return true;
      if (!cur.parentId) break;
      cur = localMap.get(cur.parentId);
    }
    return false;
  };

  const walk = (node: RepertoireNode): void => {
    for (const child of node.children) {
      if (child.isTransposition && child.sourceNodeId) {
        const source = localMap.get(child.sourceNodeId);
        let isValid = true;
        if (!source) isValid = false;
        else if (isDescendantLocal(source.id, node.id)) isValid = false;
        if (!isValid) {
          child.isTransposition = false;
          child.sourceNodeId = null;
        }
      }
      walk(child);
    }
  };

  walk(repertoire);
}

export function sanitizeAllRepertoires(): void {
  const { repertoires } = useRepertoireStore.getState();
  for (const rep of repertoires) sanitizeTranspositions(rep);
}

function _findLastUniquePosition(root: RepertoireNode): RepertoireNode {
  let node = root;
  while (node.children.length === 1) {
    node = node.children[0]!;
  }
  return node;
}

export function _incrementVersion(): void {
  const { version = 0 } = useRepertoireStore.getState();
  useRepertoireStore.setState({ version: version + 1 });
}

export function initNodeMap(): void {
  nodeMap.clear();
  fenIndex = null;
  fenIndexRootId = null;
  const { repertoires, freePlayRoot } = useRepertoireStore.getState();
  for (const root of repertoires) {
    _walkAndIndex(root);
  }
  if (freePlayRoot) {
    _walkAndIndex(freePlayRoot);
  }
}

export function initializeService(): void {
  initNodeMap();
  sanitizeAllRepertoires();

  const { phase } = useTrainingStore.getState();
  if (phase !== 'idle') return;

  const repStore = useRepertoireStore.getState();
  const { freePlayRoot, currentNodeId, repertoires, activeRepIndex } = repStore;

  if (activeRepIndex >= 0 && repertoires[activeRepIndex]) {
    if (!currentNodeId) {
      selectRepertoire(activeRepIndex);
    } else {
      const node = nodeMap.get(currentNodeId);
      if (node) _updateChessPosition(node.fen);
    }
    return;
  }

  if (!freePlayRoot) {
    const id = 'fp_' + Math.random().toString(36).substr(2, 9);
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const root: RepertoireNode = {
      id, name: 'Jeu libre', color: 'w', san: 'Initial', fen,
      parentId: null, children: [], moveNum: 0, turn: 'b',
      createdAt: Date.now(), comment: '', varName: '', varAnnotation: '',
    };
    nodeMap.set(id, root);
    repStore.setFreePlayRoot(root);
    useRepertoireStore.setState({ currentNodeId: id });
    _updateChessPosition(fen);
  } else {
    if (!currentNodeId) {
      useRepertoireStore.setState({ currentNodeId: freePlayRoot.id });
    }
    const nodeId = currentNodeId ?? freePlayRoot.id;
    const node = nodeMap.get(nodeId);
    if (node) _updateChessPosition(node.fen);
  }
}

export function getNode(nodeId: string): RepertoireNode | undefined {
  return nodeMap.get(nodeId);
}

export function getMovePath(currentNodeId: string): RepertoireNode[] {
  const path: RepertoireNode[] = [];
  let current = nodeMap.get(currentNodeId);
  while (current && current.parentId) {
    path.unshift(current);
    current = nodeMap.get(current.parentId);
  }
  return path;
}

/**
 * Remonte depuis un nœud jusqu'à la racine du répertoire et collecte
 * la chaîne des noms de variantes (varName) rencontrés.
 *
 * Si le nœud de départ est la racine d'un arbre élagué (pruned), descend
 * d'abord la chaîne à enfant unique pour trouver la variante réelle.
 */
export function getVariantPath(node: RepertoireNode): { repName: string; varPath: string[] } {
  const varPath: string[] = [];
  let cur: RepertoireNode | undefined = node;
  let root: RepertoireNode | undefined;

  // 1. Remonter vers la racine
  while (cur) {
    if (cur.varName) varPath.unshift(cur.varName);
    if (!cur.parentId) { root = cur; break; }
    cur = nodeMap.get(cur.parentId);
  }

  if (varPath.length > 0) {
    return { repName: root?.name ?? 'Répertoire', varPath };
  }

  // 2. Aucun varName trouvé en remontant → peut-être une racine élaguée
  if (!node.varName && node.children.length === 1) {
    let leaf: RepertoireNode | undefined;
    cur = node;
    while (cur.children.length === 1) {
      cur = cur.children[0];
      if (cur.varName) leaf = cur;
    }
    if (leaf) {
      varPath.length = 0;
      cur = leaf;
      while (cur) {
        if (cur.varName) varPath.unshift(cur.varName);
        if (!cur.parentId) { root = cur; break; }
        cur = nodeMap.get(cur.parentId);
      }
      return { repName: root?.name ?? 'Répertoire', varPath };
    }
  }

  return { repName: root?.name ?? 'Répertoire', varPath: [] };
}

export function createNewRepertoire(
  name: string,
  color: 'w' | 'b',
  folderId?: string | null,
  isExample = false,
  fen?: string,
): RepertoireNode {
  const id = 'rep_' + Math.random().toString(36).substr(2, 9);
  const startingFen = fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  const store = useRepertoireStore.getState();
  let resolvedFolderId: string | undefined = folderId ?? undefined;
  if (resolvedFolderId === '__new__') {
    const newName = store.pendingNewRepFolderName?.trim() || '';
    if (newName) {
      const newFolderId = 'folder_' + Math.random().toString(36).substr(2, 9);
      const folders = (loadState<Record<string, string>>(FOLDERS_KEY)) || {};
      folders[newFolderId] = newName;
      saveState(FOLDERS_KEY, folders);
      store.setRepFolders(folders);
      syncUserSettings();
      resolvedFolderId = newFolderId;
    } else {
      resolvedFolderId = undefined;
    }
    store.setPendingNewRepFolder(null, null);
  }
  if (!resolvedFolderId) {
    const pendingFolderId = store.pendingNewRepFolderId;
    if (pendingFolderId) {
      if (pendingFolderId === '__new__') {
        const newName = store.pendingNewRepFolderName?.trim() || '';
        if (newName) {
          const newFolderId = 'folder_' + Math.random().toString(36).substr(2, 9);
          const folders = (loadState<Record<string, string>>(FOLDERS_KEY)) || {};
          folders[newFolderId] = newName;
          saveState(FOLDERS_KEY, folders);
          store.setRepFolders(folders);
          syncUserSettings();
          resolvedFolderId = newFolderId;
        }
      } else {
        resolvedFolderId = pendingFolderId;
      }
      store.setPendingNewRepFolder(null, null);
    }
  }

  const newNode: RepertoireNode = {
    id,
    name,
    color,
    san: 'Initial',
    fen: startingFen,
    parentId: null,
    children: [],
    moveNum: 0,
    turn: 'b',
    createdAt: Date.now(),
    comment: '',
    varName: '',
    varAnnotation: '',
    folderId: resolvedFolderId,
    isExample,
  };

  nodeMap.set(id, newNode);
  _invalidateFenIndex();

  const newReps = [...store.repertoires, _cloneTreeForStore(newNode)];
  store.setRepertoires(newReps);
  initNodeMap();
  store.setActiveRepIndex(newReps.length - 1);
  useRepertoireStore.setState({ currentNodeId: id, redoStack: [] });
  useChessStore.setState({ boardFlipped: color === 'b' });
  _updateChessPosition(startingFen);
  _incrementVersion();

  registerCreatedRepertoire(newNode);

  return newNode;
}

export function addMove(
  parentId: string,
  san: string,
  options?: { comment?: string; annotation?: string },
): RepertoireNode | null {
  if (useTrainingStore.getState().phase !== 'idle') return null;

  const parent = nodeMap.get(parentId);
  if (!parent) return null;

  const repStore0 = useRepertoireStore.getState();
  if (repStore0.activeRepIndex === -1) {
    let temp: RepertoireNode | undefined = parent;
    while (temp?.parentId) temp = nodeMap.get(temp.parentId);
    if (temp) {
      const repIdx = repStore0.repertoires.findIndex(r => r.id === temp!.id);
      if (repIdx !== -1) repStore0.setActiveRepIndex(repIdx);
    }
  }

  const tmp = new Chess(parent.fen);
  let move: ReturnType<typeof tmp.move> | null = null;
  try {
    move = tmp.move(san);
  } catch {
    return null;
  }
  if (!move) return null;

  const targetFen = tmp.fen();
  const existing = parent.children.find(c => c.san === move.san);
  if (existing) {
    useRepertoireStore.setState({ currentNodeId: existing.id, redoStack: [] });
    return existing;
  }

  const now = _nextCreatedAt();
  const transpo = _findTranspositionFast(targetFen, now, parentId);

  const node: RepertoireNode = {
    id: Math.random().toString(36).substr(2, 9),
    san: move.san,
    fen: targetFen,
    parentId,
    children: [],
    moveNum: tmp.turn() === 'w' ? parent.moveNum : parent.moveNum + 1,
    turn: tmp.turn() === 'b' ? 'w' : 'b',
    createdAt: now,
    annotation: transpo ? transpo.annotation : '',
    comment: transpo ? transpo.comment : '',
    isTransposition: !!transpo,
    sourceNodeId: transpo?.id ?? null,
    varName: '',
    varAnnotation: '',
  };

  if (options?.comment) node.comment = options.comment;
  if (options?.annotation && !node.annotation) node.annotation = options.annotation;

  parent.children.push(node);
  nodeMap.set(node.id, node);

  // Swap transposition si le nouveau nœud est plus haut que le candidat
  // (la branche du bas doit toujours porter le ↪)
  if (transpo && _nodeIsAbove(node.id, transpo.id)) {
    const oldSourceId = transpo.sourceNodeId;
    transpo.isTransposition = true;
    transpo.sourceNodeId = node.id;
    node.isTransposition = false;
    node.sourceNodeId = oldSourceId;
  }

  // Mise à jour incrémentale de l'index FEN pendant les imports en masse
  // (suppressSnapshot = true ⇒ _invalidateFenIndex n'est pas appelé automatiquement,
  //  ce qui empêche la détection de transpositions dans la Passe 2)
  if (repStore0.suppressSnapshot && !node.isTransposition) {
    const idx = _getFenIndex();
    const nf = normalizeFen(targetFen);
    if (!idx.has(nf)) idx.set(nf, node);
  }

  const repStore = useRepertoireStore.getState();
  const expanded = new Set(repStore.treeExpanded);
  expanded.add(parentId);
  repStore.setTreeExpanded(expanded);
  useRepertoireStore.setState({ currentNodeId: node.id, redoStack: [] });

  if (!repStore.suppressSnapshot) {
    _writeRepertoireSnapshot();
    initNodeMap();
    _invalidateFenIndex();
    _incrementVersion();
  }

  if (!repStore.suppressSync) {
    scheduleRepertoireSync();
  }

  return node;
}

export function handleSquareClick(sq: Square): void {
  const chessStore = useChessStore.getState();
  const repStore = useRepertoireStore.getState();
  const { selectedSq, chess } = chessStore;
  const { currentNodeId } = repStore;

  if (selectedSq === sq) {
    chessStore.selectSquare(null);
    return;
  }

  if (selectedSq) {
    const fromSq = selectedSq;
    const tmp = new Chess(chess.fen());
    let move: ReturnType<typeof tmp.move> | null = null;
    try { move = tmp.move({ from: fromSq, to: sq, promotion: 'q' }); } catch { move = null; }

    if (move) {
      tmp.undo();
      if (!currentNodeId) {
        chessStore.selectSquare(null);
        return;
      }

      const ts = useTrainingStore.getState();
      if (ts.phase !== 'idle') {
        chessStore.selectSquare(null);
        const optChess = new Chess(chess.fen());
        optChess.move(move.san);
        useChessStore.setState({ chess: optChess });
        import('@/services/training').then(m => m.checkTrainingMove(move!.san));
        return;
      }

      const newNode = addMove(currentNodeId, move.san);
      if (newNode) {
        _updateChessPosition(newNode.fen);
        useChessStore.setState({ pendingAnimation: { fromSq, toSq: sq } });
      } else {
        chessStore.selectSquare(null);
      }
    } else {
      const piece = chess.get(sq);
      chessStore.selectSquare(piece && piece.color === chess.turn() ? sq : null);
    }
  } else {
    const piece = chess.get(sq);
    chessStore.selectSquare(piece && piece.color === chess.turn() ? sq : null);
  }
}

export function playUciMove(uci: string): boolean {
  const { chess } = useChessStore.getState();
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const promotion = uci.length > 4 ? uci[4] : 'q';
  const tmp = new Chess(chess.fen());
  let move: ReturnType<typeof tmp.move> | null = null;
  try { move = tmp.move({ from, to, promotion }); } catch { move = null; }
  if (!move) return false;
  const { currentNodeId } = useRepertoireStore.getState();
  if (!currentNodeId) return false;
  const newNode = addMove(currentNodeId, move.san);
  if (!newNode) return false;
  _updateChessPosition(newNode.fen);
  useChessStore.setState({ pendingAnimation: { fromSq: from, toSq: to } });
  return true;
}

export function navigateToNode(nodeId: string): void {
  if (useTrainingStore.getState().phase !== 'idle') return;
  const node = nodeMap.get(nodeId);
  if (!node) return;

  // Si en jeu libre, basculer automatiquement vers le répertoire propriétaire du nœud
  const repState = useRepertoireStore.getState();
  if (repState.activeRepIndex === -1) {
    let root: RepertoireNode | undefined = node;
    while (root?.parentId) {
      root = nodeMap.get(root.parentId);
    }
    if (root) {
      const repIdx = repState.repertoires.findIndex(r => r.id === root.id);
      if (repIdx !== -1) {
        repState.setActiveRepIndex(repIdx);
      }
    }
  }

  // Redirect si transposition : aller vers le nœud source (qui a les continuations)
  if (node.isTransposition && node.sourceNodeId) {
    const src = nodeMap.get(node.sourceNodeId);
    if (src) {
      _updateChessPosition(src.fen);
      useRepertoireStore.setState({ currentNodeId: src.id });
      expandPathToCurrentNode(src.id);
      const { repertoires, activeRepIndex } = useRepertoireStore.getState();
      const activeRep = activeRepIndex >= 0 ? repertoires[activeRepIndex] : null;
      if (activeRep?.color !== undefined) {
        useChessStore.setState({ boardFlipped: activeRep.color === 'b' });
      }
      requestAnimationFrame(() => {
        const activeEl = document.querySelector('#arbre-content .move-text.active');
        if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      return;
    }
  }

  _updateChessPosition(node.fen);
  useRepertoireStore.setState({ currentNodeId: nodeId });
  expandPathToCurrentNode(nodeId);
  const { repertoires, activeRepIndex } = useRepertoireStore.getState();
  const activeRep = activeRepIndex >= 0 ? repertoires[activeRepIndex] : null;
  if (activeRep?.color !== undefined) {
    useChessStore.setState({ boardFlipped: activeRep.color === 'b' });
  }
}

export function expandPathToCurrentNode(nodeId: string): void {
  const store = useRepertoireStore.getState();
  const expanded = new Set(store.treeExpanded);
  expanded.add(nodeId);
  let current = nodeMap.get(nodeId);
  while (current && current.parentId) {
    expanded.add(current.parentId);
    current = nodeMap.get(current.parentId);
  }
  store.setTreeExpanded(expanded);
}

export function toggleTreeExpanded(nodeId: string): void {
  const store = useRepertoireStore.getState();
  const expanded = new Set(store.treeExpanded);
  if (expanded.has(nodeId)) {
    expanded.delete(nodeId);
    for (const id of expanded) {
      let cur = nodeMap.get(id);
      while (cur) {
        if (cur.id === nodeId) { expanded.delete(id); break; }
        if (!cur.parentId) break;
        cur = nodeMap.get(cur.parentId);
      }
    }
  } else {
    expanded.add(nodeId);
  }
  store.setTreeExpanded(expanded);
}

export function navBack(): void {
  if (useTrainingStore.getState().phase !== 'idle') return;
  const { currentNodeId, redoStack } = useRepertoireStore.getState();
  if (!currentNodeId) return;
  const node = nodeMap.get(currentNodeId);
  if (!node || !node.parentId) return;
  const newRedo = [...(redoStack ?? []), currentNodeId];
  useRepertoireStore.setState({ currentNodeId: node.parentId, redoStack: newRedo });
  const parentFen = nodeMap.get(node.parentId)!.fen;
  if (node.parentId && node.san) {
    const parentNode = nodeMap.get(node.parentId);
    if (parentNode?.fen) {
      const tmp = new Chess(parentNode.fen);
      try {
        const m = tmp.move(node.san);
        if (m) useChessStore.getState().setPendingAnimation({ fromSq: m.to, toSq: m.from });
      } catch {}
    }
  }
  _updateChessPosition(parentFen);
}

export function navForward(): void {
  if (useTrainingStore.getState().phase !== 'idle') return;
  const { redoStack } = useRepertoireStore.getState();
  if (!redoStack || redoStack.length === 0) return;
  const newRedo = [...redoStack];
  const nodeId = newRedo.pop()!;
  useRepertoireStore.setState({ currentNodeId: nodeId, redoStack: newRedo });
  const node = nodeMap.get(nodeId);
  if (node) {
    if (node.parentId && node.san) {
      const parentNode = nodeMap.get(node.parentId);
      if (parentNode?.fen) {
        const tmp = new Chess(parentNode.fen);
        try {
          const m = tmp.move(node.san);
          if (m) useChessStore.getState().setPendingAnimation({ fromSq: m.from, toSq: m.to });
        } catch {}
      }
    }
    _updateChessPosition(node.fen);
  }
}

export function selectRepertoire(idx: number): void {
  if (useTrainingStore.getState().phase !== 'idle') return;
  const store = useRepertoireStore.getState();
  const rep = store.repertoires[idx];
  if (!rep) return;

  const target = _findLastUniquePosition(rep);
  _updateChessPosition(target.fen);
  useRepertoireStore.setState({
    currentNodeId: target.id,
    activeRepIndex: idx,
    redoStack: [],
  });
  useChessStore.setState({ boardFlipped: rep.color === 'b' });
  expandPathToCurrentNode(target.id);
}

export function resetPosition(): void {
  if (useTrainingStore.getState().phase !== 'idle') return;
  const root = _getActiveRoot();
  if (!root) return;
  _updateChessPosition(root.fen);
  useRepertoireStore.setState({ currentNodeId: root.id, redoStack: [] });
}

export function initExampleData(): void {
  const store = useRepertoireStore.getState();
  store.setSuppressSync(true);

  try {
    // ── Répertoire Blancs : Gambit Dame avec bifurcations côté noir ──
    const repW = createNewRepertoire('Gambit Dame', 'w', undefined, true);
    const w1 = addMove(repW.id, 'd4')!;
    const w2 = addMove(w1.id, 'd5')!;
    const w3 = addMove(w2.id, 'c4')!;

    // ── Branche 1 : 2...e6 — Défense Orthodoxe ──
    const wB1 = addMove(w3.id, 'e6')!;
    wB1.varName = 'Défense Orthodoxe';
    const wB1_Nc3 = addMove(wB1.id, 'Nc3')!;
    const wB1_Nf6 = addMove(wB1_Nc3.id, 'Nf6')!;
    const wB1_Bg5 = addMove(wB1_Nf6.id, 'Bg5')!;

    // 4...Be7 5.e3 O-O 6.Nf3
    const wB1_Be7 = addMove(wB1_Bg5.id, 'Be7')!;
    const wB1_e3a = addMove(wB1_Be7.id, 'e3')!;
    const wB1_OO = addMove(wB1_e3a.id, 'O-O')!;
    addMove(wB1_OO.id, 'Nf3');

    // 4...Nbd7 5.e3 c6 6.Nf3
    const wB1_Nbd7 = addMove(wB1_Bg5.id, 'Nbd7')!;
    const wB1_e3b = addMove(wB1_Nbd7.id, 'e3')!;
    const wB1_c6a = addMove(wB1_e3b.id, 'c6')!;
    addMove(wB1_c6a.id, 'Nf3');

    // 4...c6 5.e3 Nbd7 6.Nf3 (Meran)
    const wB1_c6b = addMove(wB1_Bg5.id, 'c6')!;
    const wB1_e3c = addMove(wB1_c6b.id, 'e3')!;
    const wB1_Nbd7b = addMove(wB1_e3c.id, 'Nbd7')!;
    addMove(wB1_Nbd7b.id, 'Nf3');

    // ── Branche 2 : 2...c6 — Défense Slave ──
    const wB2 = addMove(w3.id, 'c6')!;
    wB2.varName = 'Défense Slave';
    const wB2_Nc3 = addMove(wB2.id, 'Nc3')!;
    const wB2_Nf6 = addMove(wB2_Nc3.id, 'Nf6')!;
    const wB2_Nf3 = addMove(wB2_Nf6.id, 'Nf3')!;

    // 4...e6 5.e3 a6 6.b3
    const wB2_e6 = addMove(wB2_Nf3.id, 'e6')!;
    const wB2_e3a = addMove(wB2_e6.id, 'e3')!;
    const wB2_a6 = addMove(wB2_e3a.id, 'a6')!;
    addMove(wB2_a6.id, 'b3');

    // 4...Bf5 5.cxd5 cxd5 6.Qb3 (Semi-Slave)
    const wB2_Bf5 = addMove(wB2_Nf3.id, 'Bf5')!;
    wB2_Bf5.varName = 'Semi-Slave';
    const wB2_cxd5W = addMove(wB2_Bf5.id, 'cxd5')!;
    const wB2_cxd5B = addMove(wB2_cxd5W.id, 'cxd5')!;
    addMove(wB2_cxd5B.id, 'Qb3');

    // 4...dxc4 5.e3 e6 6.Bxc4 (Slave Acceptée)
    const wB2_dxc4 = addMove(wB2_Nf3.id, 'dxc4')!;
    wB2_dxc4.varName = 'Slave Acceptée';
    const wB2_e3b = addMove(wB2_dxc4.id, 'e3')!;
    const wB2_e6b = addMove(wB2_e3b.id, 'e6')!;
    addMove(wB2_e6b.id, 'Bxc4');

    // ── Branche 3 : 2...dxc4 — Gambit Accepté ──
    const wB3 = addMove(w3.id, 'dxc4')!;
    wB3.varName = 'Gambit Accepté';
    const wB3_e4 = addMove(wB3.id, 'e4')!;

    // 3...e5 4.Nf3 exd4 5.Bxc4 Nc6 6.O-O
    const wB3_e5 = addMove(wB3_e4.id, 'e5')!;
    const wB3_Nf3a = addMove(wB3_e5.id, 'Nf3')!;
    const wB3_exd4 = addMove(wB3_Nf3a.id, 'exd4')!;
    const wB3_Bxc4 = addMove(wB3_exd4.id, 'Bxc4')!;
    const wB3_Nc6 = addMove(wB3_Bxc4.id, 'Nc6')!;
    addMove(wB3_Nc6.id, 'O-O');

    // 3...Nf6 4.e5 Nd5 5.Nf3 Nb6 6.Bxc4
    const wB3_Nf6 = addMove(wB3_e4.id, 'Nf6')!;
    const wB3_e5b = addMove(wB3_Nf6.id, 'e5')!;
    const wB3_Nd5 = addMove(wB3_e5b.id, 'Nd5')!;
    const wB3_Nf3b = addMove(wB3_Nd5.id, 'Nf3')!;
    const wB3_Nb6 = addMove(wB3_Nf3b.id, 'Nb6')!;
    addMove(wB3_Nb6.id, 'Bxc4');

    // ── Répertoire Noirs : Sicilienne ──
    const repB = createNewRepertoire('Sicilienne', 'b', undefined, true);
    const b1 = addMove(repB.id, 'e4')!;
    const b2 = addMove(b1.id, 'c5')!;

    // ── Branche A : 2.Nf3 — Système ouvert ──
    const bA = addMove(b2.id, 'Nf3')!;
    const bA_d6 = addMove(bA.id, 'd6')!;
    const bA_d4 = addMove(bA_d6.id, 'd4')!;
    const bA_cxd4 = addMove(bA_d4.id, 'cxd4')!;
    const bA_Nxd4 = addMove(bA_cxd4.id, 'Nxd4')!;
    const bA_Nf6 = addMove(bA_Nxd4.id, 'Nf6')!;
    const bA_Nc3 = addMove(bA_Nf6.id, 'Nc3')!;

    // — 5...a6 — Najdorf —
    const bA_a6 = addMove(bA_Nc3.id, 'a6')!;
    bA_a6.varName = 'Najdorf';
    const bA_Bg5a = addMove(bA_a6.id, 'Bg5')!;
    const bA_e6a = addMove(bA_Bg5a.id, 'e6')!;
    const bA_f4a = addMove(bA_e6a.id, 'f4')!;
    addMove(bA_f4a.id, 'Be7');
    const bA_Be3a = addMove(bA_a6.id, 'Be3')!;
    const bA_e5a = addMove(bA_Be3a.id, 'e5')!;
    const bA_Nb3a = addMove(bA_e5a.id, 'Nb3')!;
    addMove(bA_Nb3a.id, 'Be6');
    const bA_Bc4 = addMove(bA_a6.id, 'Bc4')!;
    const bA_e6b = addMove(bA_Bc4.id, 'e6')!;
    const bA_Bb3 = addMove(bA_e6b.id, 'Bb3')!;
    addMove(bA_Bb3.id, 'b5');

    // — 5...e5 — Sveshnikov —
    const bA_e5s = addMove(bA_Nc3.id, 'e5')!;
    bA_e5s.varName = 'Sveshnikov';
    const bA_Nb3s = addMove(bA_e5s.id, 'Nb3')!;
    const bA_Be7s = addMove(bA_Nb3s.id, 'Be7')!;
    const bA_Be2s = addMove(bA_Be7s.id, 'Be2')!;
    addMove(bA_Be2s.id, 'Be6');
    const bA_Be6s = addMove(bA_Nb3s.id, 'Be6')!;
    const bA_f4s = addMove(bA_Be6s.id, 'f4')!;
    addMove(bA_f4s.id, 'exf4');

    // — 5...Nc6 — Classique —
    const bA_Nc6c = addMove(bA_Nc3.id, 'Nc6')!;
    bA_Nc6c.varName = 'Classique';
    const bA_Bg5c = addMove(bA_Nc6c.id, 'Bg5')!;
    const bA_e6c = addMove(bA_Bg5c.id, 'e6')!;
    const bA_Qd2 = addMove(bA_e6c.id, 'Qd2')!;
    addMove(bA_Qd2.id, 'a6');
    const bA_Be3c = addMove(bA_Nc6c.id, 'Be3')!;
    const bA_e6c2 = addMove(bA_Be3c.id, 'e6')!;
    const bA_f4c = addMove(bA_e6c2.id, 'f4')!;
    addMove(bA_f4c.id, 'Nxd4');

    // ── Branche B : 2.Nc3 — Système fermé ──
    const bB = addMove(b2.id, 'Nc3')!;
    bB.varName = 'Système fermé';
    const bB_Nc6 = addMove(bB.id, 'Nc6')!;
    const bB_g3 = addMove(bB_Nc6.id, 'g3')!;
    const bB_g6 = addMove(bB_g3.id, 'g6')!;
    const bB_Bg2 = addMove(bB_g6.id, 'Bg2')!;
    const bB_Bg7 = addMove(bB_Bg2.id, 'Bg7')!;
    const bB_d3 = addMove(bB_Bg7.id, 'd3')!;

    // 5...e5 6.Be3 Nge7 7.Qd2
    const bB_e5 = addMove(bB_d3.id, 'e5')!;
    const bB_Be3 = addMove(bB_e5.id, 'Be3')!;
    const bB_Nge7 = addMove(bB_Be3.id, 'Nge7')!;
    addMove(bB_Nge7.id, 'Qd2');

    // 5...d6 6.f4 e5 7.Nf3
    const bB_d6 = addMove(bB_d3.id, 'd6')!;
    const bB_f4 = addMove(bB_d6.id, 'f4')!;
    const bB_e5f = addMove(bB_f4.id, 'e5')!;
    addMove(bB_e5f.id, 'Nf3');
  } finally {
    store.setSuppressSync(false);
    scheduleRepertoireSync();
  }

  // Reset sur le jeu libre
  useRepertoireStore.setState({ activeRepIndex: -1 });
  const { freePlayRoot } = useRepertoireStore.getState();
  if (freePlayRoot) {
    useRepertoireStore.setState({ currentNodeId: freePlayRoot.id });
    _updateChessPosition(freePlayRoot.fen);
  }
}

export function confirmDelete(targetId: string): void {
  const repStore = useRepertoireStore.getState();

  const repIdx = repStore.repertoires.findIndex(r => r.id === targetId);
  if (repIdx !== -1) {
    const repToDelete = repStore.repertoires[repIdx]!;
    const collectAllIds = (n: RepertoireNode, set: Set<string>): void => {
      set.add(n.id);
      for (const c of n.children) collectAllIds(c, set);
    };
    const allIds = new Set<string>();
    collectAllIds(repToDelete, allIds);
    for (const id of allIds) nodeMap.delete(id);

    deleteRepertoireFromBackend(repToDelete);
    const newReps = repStore.repertoires.filter((_, i) => i !== repIdx);
    repStore.setRepertoires(newReps);

    let newIdx = repStore.activeRepIndex;
    if (repStore.activeRepIndex === repIdx) {
      newIdx = -1;
    } else if (repStore.activeRepIndex > repIdx) {
      newIdx = repStore.activeRepIndex - 1;
    }

    if (newIdx === -1) {
      const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const fp = repStore.freePlayRoot;
      useRepertoireStore.setState({
        activeRepIndex: -1,
        currentNodeId: fp?.id ?? null,
        redoStack: [],
      });
      _updateChessPosition(initialFen);
    } else {
      useRepertoireStore.setState({ activeRepIndex: newIdx });
      selectRepertoire(newIdx);
    }

    _invalidateFenIndex();
    _incrementVersion();
    scheduleRepertoireSync();
    cleanupOrphanedFolders();
    return;
  }

  const node = nodeMap.get(targetId);
  if (!node || !node.parentId) return;
  const parent = nodeMap.get(node.parentId);
  if (!parent) return;

  const collectDeleted = (n: RepertoireNode, set: Set<string>): Set<string> => {
    set.add(n.id);
    for (const c of n.children) collectDeleted(c, set);
    return set;
  };
  const deletedIds = collectDeleted(node, new Set<string>());

  parent.children = parent.children.filter(c => c.id !== targetId);
  for (const id of deletedIds) nodeMap.delete(id);

  let repRoot = parent;
  while (repRoot.parentId) {
    const next = nodeMap.get(repRoot.parentId);
    if (!next) break;
    repRoot = next;
  }
  const fixTranspositions = (n: RepertoireNode) => {
    if (n.isTransposition && n.sourceNodeId && deletedIds.has(n.sourceNodeId)) {
      n.isTransposition = false;
      n.sourceNodeId = null;
    }
    for (const c of n.children) fixTranspositions(c);
  };
  fixTranspositions(repRoot);

  if (repStore.currentNodeId && deletedIds.has(repStore.currentNodeId)) {
    useRepertoireStore.setState({ currentNodeId: parent.id });
    _updateChessPosition(parent.fen);
  }

  _writeRepertoireSnapshot();
  initNodeMap();
  _invalidateFenIndex();
  _incrementVersion();
  scheduleRepertoireSync();
}

export function selectSymbol(symbol: string): void {
  const { menuTargetId } = useRepertoireStore.getState();
  if (!menuTargetId) return;
  const node = nodeMap.get(menuTargetId);
  if (!node) return;
  const source = useUiStore.getState().ctxMenu?.source;
  if (source === 'repertoire_item' || source === 'repertoire_subitem') {
    node.varAnnotation = symbol;
  } else {
    node.annotation = symbol;
  }
  _writeRepertoireSnapshot();
  initNodeMap();
  _incrementVersion();
  scheduleRepertoireSync();
}

export function renameRepertoire(name: string): void {
  const { repertoires, activeRepIndex } = useRepertoireStore.getState();
  if (activeRepIndex < 0 || !repertoires[activeRepIndex]) return;
  const root = nodeMap.get(repertoires[activeRepIndex]!.id);
  if (root) root.name = name;
  _writeRepertoireSnapshot();
  initNodeMap();
  _incrementVersion();
  scheduleRepertoireSync();
}

export function findNodeWithVarName(
  root: RepertoireNode,
  name: string,
  excludeId?: string,
): RepertoireNode | null {
  for (const child of root.children) {
    if (child.varName === name && child.id !== excludeId) return child;
    const found = findNodeWithVarName(child, name, excludeId);
    if (found) return found;
  }
  return null;
}

export function findRepsByFen(
  fen: string,
  color: 'w' | 'b',
): { repIndex: number; nodeId: string; repName: string }[] {
  const nf = normalizeFen(fen);
  const state = useRepertoireStore.getState();
  const results: { repIndex: number; nodeId: string; repName: string }[] = [];

  for (let i = 0; i < state.repertoires.length; i++) {
    const root = state.repertoires[i];
    if (root.color !== color) continue;

    let foundId: string | null = null;
    const walk = (node: RepertoireNode) => {
      if (foundId) return;
      if (normalizeFen(node.fen) === nf) {
        foundId = node.id;
      }
      for (const child of node.children) {
        if (!foundId) walk(child);
      }
    };
    walk(root);

    if (foundId) {
      results.push({ repIndex: i, nodeId: foundId, repName: root.name || `Répertoire ${i + 1}` });
    }
  }

  return results;
}

export function nameVariantNode(nodeId: string, name: string): boolean {
  const node = nodeMap.get(nodeId);
  if (!node) return false;
  node.varName = name;
  _writeRepertoireSnapshot();
  initNodeMap();
  _incrementVersion();
  scheduleRepertoireSync();
  return true;
}

export function batchSetFolderId(nodeIds: string[], folderId: string | null): void {
  const store = useRepertoireStore.getState();
  const fid = folderId ?? undefined;

  const assignInTree = (n: RepertoireNode) => {
    if (nodeIds.includes(n.id)) n.folderId = fid;
    for (const child of n.children) assignInTree(child);
  };
  for (const rep of store.repertoires) assignInTree(rep);
  if (store.freePlayRoot) assignInTree(store.freePlayRoot);

  _writeRepertoireSnapshot();
  initNodeMap();
  _incrementVersion();
  scheduleRepertoireSync();
}

export function removeFolderGroup(folderId: string): void {
  const store = useRepertoireStore.getState();
  for (const rep of store.repertoires) {
    if (rep.folderId === folderId) rep.folderId = undefined;
  }
  const clearVariantFolder = (node: RepertoireNode) => {
    for (const child of node.children) {
      if (child.folderId === folderId) child.folderId = undefined;
      clearVariantFolder(child);
    }
  };
  for (const rep of store.repertoires) clearVariantFolder(rep);
  if (store.freePlayRoot) clearVariantFolder(store.freePlayRoot);
  const folders = loadState<Record<string, string>>(FOLDERS_KEY) || {};
  if (folderId in folders) {
    delete folders[folderId];
    saveState(FOLDERS_KEY, folders);
    store.setRepFolders({ ...folders });
  }
  _writeRepertoireSnapshot();
  initNodeMap();
  _incrementVersion();
  scheduleRepertoireSync();
}

export function cleanupOrphanedFolders(): void {
  const store = useRepertoireStore.getState();
  const referenced = new Set<string>();

  const collectRefs = (n: RepertoireNode) => {
    for (const child of n.children) {
      if (child.folderId) referenced.add(child.folderId);
      collectRefs(child);
    }
  };

  for (const rep of store.repertoires) {
    if (rep.folderId) referenced.add(rep.folderId);
    collectRefs(rep);
  }
  if (store.freePlayRoot) {
    if (store.freePlayRoot.folderId) referenced.add(store.freePlayRoot.folderId);
    collectRefs(store.freePlayRoot);
  }

  const folders = loadState<Record<string, string>>(FOLDERS_KEY) || {};
  let changed = false;
  for (const fid of Object.keys(folders)) {
    if (!referenced.has(fid)) {
      delete folders[fid];
      changed = true;
    }
  }
  if (changed) {
    saveState(FOLDERS_KEY, folders);
    store.setRepFolders({ ...folders });
  }
}

export function switchToFreePlay(): void {
  const { activeRepIndex, currentNodeId } = useRepertoireStore.getState();
  if (activeRepIndex === -1) return;

  const currentNode = currentNodeId ? nodeMap.get(currentNodeId) : null;
  const fen = currentNode?.fen ?? useChessStore.getState().chess.fen();

  // Build ancestor chain from current node up to repertoire root
  const path: RepertoireNode[] = [];
  let cur: RepertoireNode | undefined = currentNode ?? undefined;
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? nodeMap.get(cur.parentId) : undefined;
  }

  // Clone the path into a detached free-play tree
  const rootId = 'fp_' + Math.random().toString(36).substr(2, 9);
  const rootFen = path[0]?.fen ?? fen;
  const rootFParts = rootFen.split(' ');
  const rootFmove = parseInt(rootFParts[rootFParts.length - 1], 10) || 0;
  const rootFTurn: Color = rootFParts[1] === 'b' ? 'w' : 'b';

  const rootClone: RepertoireNode = {
    ...(path[0] ?? {}),
    id: rootId,
    name: 'Jeu Libre',
    color: 'w',
    san: 'Initial',
    fen: rootFen,
    parentId: null,
    children: [],
    moveNum: rootFmove,
    turn: rootFTurn,
    createdAt: Date.now(),
    comment: '',
    varName: '',
    varAnnotation: '',
  };
  nodeMap.set(rootId, rootClone);

  let lastClone = rootClone;
  for (let i = 1; i < path.length; i++) {
    const orig = path[i];
    const cloneId = 'fp_' + Math.random().toString(36).substr(2, 9);
    const clone: RepertoireNode = {
      ...orig,
      id: cloneId,
      parentId: lastClone.id,
      children: [],
    };
    lastClone.children.push(clone);
    nodeMap.set(cloneId, clone);
    lastClone = clone;
  }

  _invalidateFenIndex();
  useRepertoireStore.setState({
    activeRepIndex: -1,
    freePlayRoot: rootClone,
    currentNodeId: lastClone.id,
    redoStack: [],
  });
  _updateChessPosition(fen);
}

export function resetFreePlay(
  fen: string,
  flippedColor: Color = 'w',
  path?: string[],
  rootFen?: string,
): string {
  const fenParts = fen.split(' ');
  const fullmoveNum = parseInt(fenParts[fenParts.length - 1], 10) || 0;
  const fenTurn = fenParts[1] as 'w' | 'b' | undefined;
  const turn: Color = fenTurn === 'b' ? 'w' : 'b';

  const rootId = 'fp_' + Math.random().toString(36).substr(2, 9);

  if (path && path.length > 0) {
    const baseFen = rootFen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const startChess = new Chess(baseFen);

    const rootNode: RepertoireNode = {
      id: rootId,
      name: 'Jeu Libre',
      color: flippedColor,
      san: 'Initial',
      fen: baseFen,
      parentId: null,
      children: [],
      moveNum: 0,
      turn: 'b',
      createdAt: Date.now(),
      comment: '',
      varName: '',
      varAnnotation: '',
    };
    nodeMap.set(rootId, rootNode);

    let parentNode = rootNode;
    let parentId = rootId;

    for (const san of path) {
      const childId = 'fp_' + Math.random().toString(36).substr(2, 9);
      startChess.move(san);
      const childFen = startChess.fen();
      const childParts = childFen.split(' ');
      const childMove = parseInt(childParts[childParts.length - 1], 10) || 0;
      const childTurn: Color = childParts[1] === 'b' ? 'w' : 'b';

      const childNode: RepertoireNode = {
        id: childId,
        san,
        fen: childFen,
        parentId,
        children: [],
        moveNum: childMove,
        turn: childTurn,
        createdAt: Date.now(),
        comment: '',
        varName: '',
        varAnnotation: '',
      };

      nodeMap.set(childId, childNode);
      parentNode.children.push(childNode);
      parentNode = childNode;
      parentId = childId;
    }

    _invalidateFenIndex();
    useRepertoireStore.setState({
      activeRepIndex: -1,
      freePlayRoot: rootNode,
      currentNodeId: parentId,
      redoStack: [],
    });
    useChessStore.setState({ boardFlipped: flippedColor === 'b' });
    _updateChessPosition(fen);
    return parentId;
  }

  const rootNode: RepertoireNode = {
    id: rootId,
    name: 'Jeu Libre',
    color: flippedColor,
    san: 'Initial',
    fen,
    parentId: null,
    children: [],
    moveNum: fullmoveNum,
    turn,
    createdAt: Date.now(),
    comment: '',
    varName: '',
    varAnnotation: '',
  };
  nodeMap.set(rootId, rootNode);
  _invalidateFenIndex();
  useRepertoireStore.setState({
    activeRepIndex: -1,
    freePlayRoot: rootNode,
    currentNodeId: rootId,
    redoStack: [],
  });
  useChessStore.setState({ boardFlipped: flippedColor === 'b' });
  _updateChessPosition(fen);
  return rootId;
}
