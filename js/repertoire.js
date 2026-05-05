import { state } from './state.js';
import { eventBus } from './events.js';
import { isDescendant, getPathString } from './arbre.js';
import { scheduleRepertoireSync, registerCreatedRepertoire, deleteRepertoireFromBackend } from './auth.js';

export function normalizeFen(fen) {
  return fen.split(' ')[0];
}

/**
 * Compteur de création monotone.
 * Garantit que chaque nœud créé reçoit un createdAt strictement supérieur
 * au précédent, même quand plusieurs nœuds sont créés dans la même milliseconde
 * (cas typique des imports PGN). Crucial pour la détection de transpositions.
 */
let _lastCreatedAt = 0;
function nextCreatedAt() {
  const now = Date.now();
  _lastCreatedAt = now > _lastCreatedAt ? now : _lastCreatedAt + 1;
  return _lastCreatedAt;
}

export function createNewRepertoire(config = null) {
  if (config instanceof Event) config = null;
  const name = config ? config.name : document.getElementById('rep-name-input').value.trim();
  const color = config ? config.color : state.selectedColor;
  const isExample = config ? config.isExample : false;
  if (!name) return;

  const newRep = {
    id: 'rep_' + Math.random().toString(36).substr(2, 9),
    name,
    color,
    san: 'Initial',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    children: [],
    parent: null,
    moveNum: 0,
    turn: 'b',
    createdAt: Date.now(),
    comment: '',
    varName: '',
    varAnnotation: '',
    isExample: isExample
  };

  state.repertoires.push(newRep);
  state.activeRepIndex = state.repertoires.length - 1;
  state.boardFlipped = color === 'b';
  state.currentNode = newRep;
  state.chess.load(state.currentNode.fen);
  state.redoStack = [];
  eventBus.emit('closeModals');
  registerCreatedRepertoire(newRep);
  eventBus.emit('render');
  return newRep;
}

export function importPGN(pgn) {
  if (!window.PgnParser || typeof window.PgnParser.parse !== 'function') {
    throw new Error('Parseur PGN indisponible');
  }

  let moves = null;

  // 1) Tenter "games" : gère les en-têtes PGN et les fichiers multi-parties
  try {
    const games = window.PgnParser.parse(pgn, { startRule: 'games' });
    if (Array.isArray(games) && games.length > 0 && Array.isArray(games[0].moves) && games[0].moves.length > 0) {
      moves = games[0].moves;
    }
  } catch (_) { /* fall through */ }

  // 2) Fallback "pgn" : PGN sans en-têtes (coups bruts uniquement)
  // parse() avec startRule 'pgn' retourne { moves: [...], messages: [] }
  if (!moves) {
    try {
      const raw = window.PgnParser.parse(pgn, { startRule: 'pgn' });
      const movesArr = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.moves) ? raw.moves : null);
      if (movesArr && movesArr.length > 0) {
        moves = movesArr;
      }
    } catch (_) { /* fall through */ }
  }

  if (!moves || !moves.length) {
    throw new Error('PGN invalide');
  }

  return moves;
}

function getRepCreationMode() {
  return document.querySelector('.rep-create-mode-btn[data-selected="true"]')?.dataset.repCreateMode
    || document.querySelector('.rep-create-mode-btn[data-rep-create-mode="start"]')?.dataset.repCreateMode
    || 'start';
}

function setRepCreateError(message = '') {
  const errorEl = document.getElementById('rep-create-error');
  if (errorEl) errorEl.textContent = message;
}

function getCreationConfig(fallbackName) {
  const inputName = document.getElementById('rep-name-input')?.value.trim();
  return {
    name: inputName || fallbackName,
    color: state.selectedColor,
  };
}

function resetBoardToNewRepertoire(newRep) {
  state.currentNode = newRep;
  state.chess.load(newRep.fen);
  state.redoStack = [];
  eventBus.emit('render');
}

function buildRepertoireFromMoves(moves, fallbackName) {
  const newRep = createNewRepertoire(getCreationConfig(fallbackName));
  if (!newRep) return;

  let currentNode = newRep;
  for (const san of moves) {
    const nextNode = addMove(currentNode, san);
    if (!nextNode) {
      throw new Error('Import impossible');
    }
    currentNode = nextNode;
  }

  resetBoardToNewRepertoire(newRep);
}

function importPgnVariationTree(moves, parent) {
  // ── Passe 1 : construire TOUTE la ligne principale en premier ──────────────
  // Cela garantit que les nœuds de la ligne principale ont un createdAt
  // inférieur à ceux des variantes. Ainsi, quand une variante atteint la même
  // position (transposition réelle), c'est elle qui sera marquée ↩ et non la
  // ligne principale, ce qui préserve l'arbre de la théorie principale.
  const mainLineEntries = [];
  let currentParent = parent;

  for (const move of moves) {
    const san = move?.notation?.notation;
    if (!san) {
      throw new Error('PGN invalide');
    }

    const branchParent = currentParent;
    const nextNode = addMove(branchParent, san);
    if (!nextNode) {
      throw new Error('Import impossible');
    }

    mainLineEntries.push({ move, branchParent });
    currentParent = nextNode;
  }

  // ── Passe 2 : traiter les variantes maintenant que la ligne principale existe ─
  for (const { move, branchParent } of mainLineEntries) {
    const variations = Array.isArray(move.variations)
      ? move.variations
      : (Array.isArray(move.ravs) ? move.ravs : []);

    for (const variation of variations) {
      if (Array.isArray(variation) && variation.length) {
        importPgnVariationTree(variation, branchParent);
      }
    }
  }
}

function buildRepertoireFromPgnMoves(moves, fallbackName) {
  state.chess.reset();
  const newRep = createNewRepertoire(getCreationConfig(fallbackName));
  if (!newRep) return;

  importPgnVariationTree(moves, newRep);
  resetBoardToNewRepertoire(newRep);
}

function getCurrentLineMoves() {
  const moves = [];
  let node = state.currentNode;

  while (node && node.parent) {
    moves.push(node.san);
    node = node.parent;
  }

  return moves.reverse();
}

function readSelectedPgnFile() {
  const file = document.getElementById('pgn-file-input')?.files?.[0];
  if (!file) {
    throw new Error('Choisissez un fichier PGN.');
  }

  if (typeof file.text === 'function') {
    return file.text();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result || '');
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    reader.readAsText(file);
  });
}

export async function confirmRepertoireCreation() {
  setRepCreateError('');

  const mode = getRepCreationMode();

  try {
    if (mode === 'start') {
      createNewRepertoire();
      return;
    }

    if (mode === 'current') {
      buildRepertoireFromMoves(getCurrentLineMoves(), 'Position actuelle');
      return;
    }

    if (mode === 'pgn-file') {
      const file = document.getElementById('pgn-file-input')?.files?.[0];
      const pgn = await readSelectedPgnFile();
      const moves = importPGN(String(pgn).trim());
      if (!moves.length) return;
      const fallbackName = file?.name ? file.name.replace(/\.[^.]+$/, '') : 'Import PGN';
      buildRepertoireFromPgnMoves(moves, fallbackName || 'Import PGN');
      return;
    }

    if (mode === 'pgn-text') {
      const pgn = document.getElementById('pgn-import-input')?.value.trim() || '';
      if (!pgn) return;
      const moves = importPGN(pgn);
      if (!moves.length) return;
      buildRepertoireFromPgnMoves(moves, 'Import PGN');
    }
  } catch (error) {
    setRepCreateError(error?.message === 'PGN invalide' ? 'PGN invalide.' : (error?.message || 'Import impossible.'));
  }
}

export function initExampleData() {
  // ── Répertoire Blancs : Gambit Dame avec bifurcations côté noir ──
  const repW = createNewRepertoire({ name: 'Gambit Dame', color: 'w', isExample: true });
  state.activeRepIndex = state.repertoires.indexOf(repW);
  const w1 = addMove(repW, 'd4');
  const w2 = addMove(w1, 'd5');
  const w3 = addMove(w2, 'c4'); // 1.d4 d5 2.c4

  // ── Branche 1 : 2...e6 — Défense Orthodoxe ──
  const wB1 = addMove(w3, 'e6');
  wB1.varName = 'Défense Orthodoxe';
  const wB1_Nc3 = addMove(wB1, 'Nc3');    // 3.Nc3
  const wB1_Nf6 = addMove(wB1_Nc3, 'Nf6'); // 3...Nf6
  const wB1_Bg5 = addMove(wB1_Nf6, 'Bg5'); // 4.Bg5

  // 4...Be7 5.e3 O-O 6.Nf3
  const wB1_Be7  = addMove(wB1_Bg5, 'Be7');
  const wB1_e3a  = addMove(wB1_Be7, 'e3');
  const wB1_OO   = addMove(wB1_e3a, 'O-O');
  addMove(wB1_OO, 'Nf3');                  // 6.Nf3 (ligne principale)

  // 4...Nbd7 5.e3 c6 6.Nf3
  const wB1_Nbd7 = addMove(wB1_Bg5, 'Nbd7');
  const wB1_e3b  = addMove(wB1_Nbd7, 'e3');
  const wB1_c6a  = addMove(wB1_e3b, 'c6');
  addMove(wB1_c6a, 'Nf3');                 // 6.Nf3

  // 4...c6 5.e3 Nbd7 6.Nf3 (Meran)
  const wB1_c6b  = addMove(wB1_Bg5, 'c6');
  const wB1_e3c  = addMove(wB1_c6b, 'e3');
  const wB1_Nbd7b = addMove(wB1_e3c, 'Nbd7');
  addMove(wB1_Nbd7b, 'Nf3');               // 6.Nf3

  // ── Branche 2 : 2...c6 — Défense Slave ──
  const wB2 = addMove(w3, 'c6');
  wB2.varName = 'Défense Slave';
  const wB2_Nc3 = addMove(wB2, 'Nc3');    // 3.Nc3
  const wB2_Nf6 = addMove(wB2_Nc3, 'Nf6'); // 3...Nf6
  const wB2_Nf3 = addMove(wB2_Nf6, 'Nf3'); // 4.Nf3

  // 4...e6 5.e3 a6 6.b3
  const wB2_e6   = addMove(wB2_Nf3, 'e6');
  const wB2_e3a  = addMove(wB2_e6, 'e3');
  const wB2_a6   = addMove(wB2_e3a, 'a6');
  addMove(wB2_a6, 'b3');                   // 6.b3

  // 4...Bf5 5.cxd5 cxd5 6.Qb3  (Semi-Slave)
  const wB2_Bf5  = addMove(wB2_Nf3, 'Bf5');
  wB2_Bf5.varName = 'Semi-Slave';
  const wB2_cxd5W = addMove(wB2_Bf5, 'cxd5');
  const wB2_cxd5B = addMove(wB2_cxd5W, 'cxd5');
  addMove(wB2_cxd5B, 'Qb3');              // 6.Qb3

  // 4...dxc4 5.e3 e6 6.Bxc4  (Slave Acceptée)
  const wB2_dxc4 = addMove(wB2_Nf3, 'dxc4');
  wB2_dxc4.varName = 'Slave Acceptée';
  const wB2_e3b  = addMove(wB2_dxc4, 'e3');
  const wB2_e6b  = addMove(wB2_e3b, 'e6');
  addMove(wB2_e6b, 'Bxc4');               // 6.Bxc4

  // ── Branche 3 : 2...dxc4 — Gambit Dame Accepté ──
  const wB3 = addMove(w3, 'dxc4');
  wB3.varName = 'Gambit Accepté';
  const wB3_e4   = addMove(wB3, 'e4');    // 3.e4

  // 3...e5 4.Nf3 exd4 5.Bxc4 Nc6 6.O-O
  const wB3_e5   = addMove(wB3_e4, 'e5');
  const wB3_Nf3a = addMove(wB3_e5, 'Nf3');
  const wB3_exd4 = addMove(wB3_Nf3a, 'exd4');
  const wB3_Bxc4 = addMove(wB3_exd4, 'Bxc4');
  const wB3_Nc6  = addMove(wB3_Bxc4, 'Nc6');
  addMove(wB3_Nc6, 'O-O');               // 6.O-O

  // 3...Nf6 4.e5 Nd5 5.Nf3 Nb6 6.Bxc4
  const wB3_Nf6  = addMove(wB3_e4, 'Nf6');
  const wB3_e5b  = addMove(wB3_Nf6, 'e5');
  const wB3_Nd5  = addMove(wB3_e5b, 'Nd5');
  const wB3_Nf3b = addMove(wB3_Nd5, 'Nf3');
  const wB3_Nb6  = addMove(wB3_Nf3b, 'Nb6');
  addMove(wB3_Nb6, 'Bxc4');             // 6.Bxc4

  // ── Répertoire Noirs : Sicilienne ──
  const repB = createNewRepertoire({ name: 'Sicilienne', color: 'b', isExample: true });
  state.activeRepIndex = state.repertoires.indexOf(repB);
  const b1 = addMove(repB, 'e4');  // 1.e4
  const b2 = addMove(b1, 'c5');   // 1...c5

  // ── Branche A : 2.Nf3 — Système ouvert ──
  const bA      = addMove(b2, 'Nf3');
  const bA_d6   = addMove(bA, 'd6');    // 2...d6
  const bA_d4   = addMove(bA_d6, 'd4');
  const bA_cxd4 = addMove(bA_d4, 'cxd4');
  const bA_Nxd4 = addMove(bA_cxd4, 'Nxd4');
  const bA_Nf6  = addMove(bA_Nxd4, 'Nf6');
  const bA_Nc3  = addMove(bA_Nf6, 'Nc3'); // 5.Nc3

  // — 5...a6  Najdorf —
  const bA_a6   = addMove(bA_Nc3, 'a6');
  bA_a6.varName = 'Najdorf';

  // 6.Bg5 e6 7.f4 Be7
  const bA_Bg5a = addMove(bA_a6, 'Bg5');
  const bA_e6a  = addMove(bA_Bg5a, 'e6');
  const bA_f4a  = addMove(bA_e6a, 'f4');
  addMove(bA_f4a, 'Be7');              // 7...Be7

  // 6.Be3 e5 7.Nb3 Be6
  const bA_Be3a = addMove(bA_a6, 'Be3');
  const bA_e5a  = addMove(bA_Be3a, 'e5');
  const bA_Nb3a = addMove(bA_e5a, 'Nb3');
  addMove(bA_Nb3a, 'Be6');            // 7...Be6

  // 6.Bc4 e6 7.Bb3 b5
  const bA_Bc4  = addMove(bA_a6, 'Bc4');
  const bA_e6b  = addMove(bA_Bc4, 'e6');
  const bA_Bb3  = addMove(bA_e6b, 'Bb3');
  addMove(bA_Bb3, 'b5');              // 7...b5

  // — 5...e5  Sveshnikov —
  const bA_e5s  = addMove(bA_Nc3, 'e5');
  bA_e5s.varName = 'Sveshnikov';
  const bA_Nb3s = addMove(bA_e5s, 'Nb3'); // 6.Nb3

  // 6...Be7 7.Be2 Be6
  const bA_Be7s = addMove(bA_Nb3s, 'Be7');
  const bA_Be2s = addMove(bA_Be7s, 'Be2');
  addMove(bA_Be2s, 'Be6');            // 7...Be6

  // 6...Be6 7.f4 exf4
  const bA_Be6s = addMove(bA_Nb3s, 'Be6');
  const bA_f4s  = addMove(bA_Be6s, 'f4');
  addMove(bA_f4s, 'exf4');           // 7...exf4

  // — 5...Nc6  Classique —
  const bA_Nc6c = addMove(bA_Nc3, 'Nc6');
  bA_Nc6c.varName = 'Classique';

  // 6.Bg5 e6 7.Qd2 a6
  const bA_Bg5c = addMove(bA_Nc6c, 'Bg5');
  const bA_e6c  = addMove(bA_Bg5c, 'e6');
  const bA_Qd2  = addMove(bA_e6c, 'Qd2');
  addMove(bA_Qd2, 'a6');             // 7...a6

  // 6.Be3 e6 7.f4 Nxd4
  const bA_Be3c = addMove(bA_Nc6c, 'Be3');
  const bA_e6c2 = addMove(bA_Be3c, 'e6');
  const bA_f4c  = addMove(bA_e6c2, 'f4');
  addMove(bA_f4c, 'Nxd4');           // 7...Nxd4

  // ── Branche B : 2.Nc3 — Système fermé ──
  const bB      = addMove(b2, 'Nc3');
  bB.varName    = 'Système fermé';
  const bB_Nc6  = addMove(bB, 'Nc6');   // 2...Nc6
  const bB_g3   = addMove(bB_Nc6, 'g3');
  const bB_g6   = addMove(bB_g3, 'g6');
  const bB_Bg2  = addMove(bB_g6, 'Bg2');
  const bB_Bg7  = addMove(bB_Bg2, 'Bg7');
  const bB_d3   = addMove(bB_Bg7, 'd3');  // 5.d3

  // 5...e5 6.Be3 Nge7 7.Qd2
  const bB_e5   = addMove(bB_d3, 'e5');
  const bB_Be3  = addMove(bB_e5, 'Be3');
  const bB_Nge7 = addMove(bB_Be3, 'Nge7');
  addMove(bB_Nge7, 'Qd2');           // 7.Qd2

  // 5...d6 6.f4 e5 7.Nf3
  const bB_d6   = addMove(bB_d3, 'd6');
  const bB_f4   = addMove(bB_d6, 'f4');
  const bB_e5f  = addMove(bB_f4, 'e5');
  addMove(bB_e5f, 'Nf3');            // 7.Nf3

  state.activeRepIndex = -1;
  state.currentNode = state.freePlayRoot;
  state.chess.reset();
  eventBus.emit('render');
}

export function confirmRenameRep() {
  const name = document.getElementById('rep-name-input').value.trim();
  if (name && state.activeRepIndex !== -1) {
    state.repertoires[state.activeRepIndex].name = name;
    scheduleRepertoireSync();
  }
  eventBus.emit('closeModals');
  eventBus.emit('render');
}

function findNodeWithVarName(node, name) {
  if (node.varName && node.varName === name) return node;
  for (const child of (node.children || [])) {
    const found = findNodeWithVarName(child, name);
    if (found) return found;
  }
  return null;
}

export function confirmNameVar() {
  if (state.trainingActive) return;
  if (!state.menuTarget) return;

  const newName = document.getElementById('var-name-input').value.trim();
  const warning = document.getElementById('var-name-warning');
  const btn = document.getElementById('btn-var-save');

  // Vérifier si un autre nœud porte déjà ce nom
  if (newName && !state.varNameConflictConfirmed) {
    const rep = state.activeRepIndex !== -1 ? state.repertoires[state.activeRepIndex] : null;
    if (rep) {
      const duplicate = findNodeWithVarName(rep, newName);
      // C'est un conflit seulement si c'est un nœud différent du cible actuel
      if (duplicate && duplicate !== state.menuTarget) {
        if (warning) {
          warning.textContent = `⚠️ Le nom "${newName}" est déjà utilisé pour une autre variante. Cliquez à nouveau pour confirmer quand même.`;
          warning.style.display = 'block';
        }
        if (btn) btn.textContent = 'Confirmer quand même';
        state.varNameConflictConfirmed = true;
        return;
      }
    }
  }

  state.menuTarget.varName = newName;
  state.varNameConflictConfirmed = false;
  scheduleRepertoireSync();
  eventBus.emit('closeModals');
  eventBus.emit('render');
}

export function addMove(parent, san) {
  if (state.trainingActive) return null;
  if (!parent) return null;
  const tmp = new Chess(parent.fen);
  const move = tmp.move(san);
  if (!move) return null;
  const targetFen = tmp.fen();
  const existing = parent.children.find(child => child.san === move.san);
  if (existing) return existing;

  // Synchronise activeRepIndex depuis l'arbre du nœud parent, au cas où il serait
  // resté à -1 (navigation par clic arbre avant que handleNodeSelect ne soit appelé,
  // ou tout autre chemin qui ne met pas à jour activeRepIndex explicitement).
  // Cette correction est nécessaire AVANT scheduleRepertoireSync qui peut émettre
  // un render synchrone depuis l'intérieur d'addMove.
  if (state.activeRepIndex === -1) {
    let temp = parent;
    while (temp.parent) temp = temp.parent;
    const repIdx = state.repertoires.findIndex(r => r.id === temp.id);
    if (repIdx !== -1) state.activeRepIndex = repIdx;
  }

  const now = nextCreatedAt();
  const transpo = state.activeRepIndex !== -1 ? findTranspositionInActiveRep(targetFen, now) : null;
  const node = {
    id: Math.random().toString(36).substr(2, 9),
    san: move.san,
    fen: targetFen,
    parent,
    children: [],
    moveNum: tmp.turn() === 'w' ? parent.moveNum : parent.moveNum + 1,
    turn: tmp.turn() === 'b' ? 'w' : 'b',
    createdAt: now,
    annotation: transpo ? transpo.annotation : '',
    comment: transpo ? transpo.comment : '',
    isTransposition: !!transpo,
    sourceNode: transpo || null,
    varName: '',
    varAnnotation: ''
  };
  parent.children.push(node);
  state.treeExpanded.add(parent.id);
  scheduleRepertoireSync();
  return node;
}

function findTranspositionInActiveRep(fen, currentTime) {
  if (state.activeRepIndex === -1) return null;
  const target = normalizeFen(fen);
  let found = null;

  function search(node) {
    if (found) return;
    if (normalizeFen(node.fen) === target && node.createdAt < currentTime) {
      found = node;
      return;
    }
    node.children.forEach(search);
  }

  search(state.repertoires[state.activeRepIndex]);
  return found;
}

export function selectSymbol(symbol) {
  if (state.trainingActive) return;
  if (!state.menuTarget) return;
  if (state.contextMenuSource === 'repertoire_item' || state.contextMenuSource === 'repertoire_subitem') {
    state.menuTarget.varAnnotation = symbol;
  } else {
    state.menuTarget.annotation = symbol;
  }
  scheduleRepertoireSync();
  eventBus.emit('hideMenus');
  eventBus.emit('render');
}

export function handleSquareClick(sq) {
  if (state.selectedSq === sq) {
    state.selectedSq = null;
  } else if (state.selectedSq) {
    const fromSq = state.selectedSq; // capturer avant mutation
    const move = state.chess.move({ from: fromSq, to: sq, promotion: 'q' });
    if (move) {
      state.chess.undo();

      if (state.trainingActive) {
        const wasDirectTargetMode = state.trainingMode === 'express' || state.trainingMode === 'randomizer';
        const testedNodeId = state.currentNode.id;
        const existing = state.currentNode.children.find(c => c.san === move.san);
        const expectedChild = state.currentNode.children.find(c => c.id === state.trainingExpectedChildId)
          || state.currentNode.children[0]
          || null;
        const isExpectedMove = Boolean(existing && expectedChild && existing.id === expectedChild.id);
        const isAlternativeRepertoireMove = Boolean(existing && expectedChild && existing.id !== expectedChild.id);
        state.selectedSq = null;
        if (isExpectedMove || (existing && !expectedChild)) {
          // Coup correct : bouger la pièce immédiatement + feedback simultané
          state.trainingAnswered.add(testedNodeId);
          state.trainingSkippedByError.delete(testedNodeId);
          state.trainingCompletedTargets.add(testedNodeId);
          if (wasDirectTargetMode) {
            state.trainingVisited.add(testedNodeId);
          }
          state.currentNode = existing;
          state.chess.load(existing.fen);
          state.redoStack = [];
          expandPathToCurrentNode();
          if (!state.skipNextAnimation) state.pendingAnimation = { fromSq, toSq: sq };
          state.skipNextAnimation = false;
          state.trainingFeedback = { type: 'correct', from: fromSq, to: sq };
          eventBus.emit('render');
          // Effacer le feedback après 200ms et lancer l'autoplay immédiatement
          setTimeout(() => {
            if (!state.trainingActive) return;
            state.trainingFeedback = null;
            eventBus.emit('render');
            eventBus.emit(wasDirectTargetMode ? 'trainingTargetCompleted' : 'trainingPlayerMoved');
          }, 200);
        } else if (isAlternativeRepertoireMove) {
          // Coup jouable dans le répertoire mais pas celui attendu : demander de réessayer.
          state.trainingFeedback = { type: 'retry', from: fromSq, to: sq };
          eventBus.emit('render');
          setTimeout(() => {
            if (!state.trainingActive) return;
            state.trainingFeedback = null;
            eventBus.emit('render');
          }, 420);
        } else {
          // Coup incorrect : en survie, on consomme une vie puis on passe à la suite.
          state.trainingFeedback = { type: 'wrong', from: fromSq, to: sq };
          if (state.trainingMode === 'survival') {
            state.trainingSurvivalLives = Math.max(0, (state.trainingSurvivalLives || 0) - 1);
            state.trainingSkippedByError.add(testedNodeId);
            state.trainingCompletedTargets.add(testedNodeId);
            state.trainingVisited.add(testedNodeId);
            state.trainingSurvivalMistakes.push({
              nodeId: testedNodeId,
              fen: state.currentNode.fen,
              path: getPathString(state.currentNode),
              expectedSan: expectedChild?.san || '(aucun)',
              playedSan: move.san,
              nodeTurn: state.currentNode.turn,
            });
          }
          eventBus.emit('render');
          setTimeout(() => {
            if (!state.trainingActive) return;
            state.trainingFeedback = null;
            eventBus.emit('render');
            if (state.trainingMode === 'survival') {
              if (state.trainingSurvivalLives <= 0) {
                eventBus.emit('trainingSurvivalDefeat');
              } else {
                eventBus.emit('trainingPlayerMoved');
              }
            }
          }, 500);
        }
        return;
      }

      state.currentNode = addMove(state.currentNode, move.san);
      if (state.currentNode) {
        state.chess.load(state.currentNode.fen);
      }
      state.redoStack = [];
      state.selectedSq = null;
      expandPathToCurrentNode();
      if (!state.skipNextAnimation) state.pendingAnimation = { fromSq, toSq: sq };
      state.skipNextAnimation = false;
    } else {
      state.skipNextAnimation = false;
      const piece = state.chess.get(sq);
      state.selectedSq = piece && piece.color === state.chess.turn() ? sq : null;
    }
  } else {
    const piece = state.chess.get(sq);
    state.selectedSq = piece && piece.color === state.chess.turn() ? sq : null;
  }
  eventBus.emit('render');
}

export function playUciMove(uci) {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const move = state.chess.move({ from, to, promotion: 'q' });
  if (!move) {
    return false;
  }
  state.chess.undo();
  state.currentNode = addMove(state.currentNode, move.san);
  if (state.currentNode) {
    state.chess.load(state.currentNode.fen);
  }
  state.redoStack = [];
  state.selectedSq = null;
  expandPathToCurrentNode();
  state.pendingAnimation = { fromSq: from, toSq: to };
  return true;
}

export function expandPathToCurrentNode() {
  let temp = state.currentNode;
  if (temp) {
    state.treeExpanded.add(temp.id);
  }
  while (temp && temp.parent) {
    state.treeExpanded.add(temp.parent.id);
    temp = temp.parent;
  }
}

export function confirmDelete() {
  if (state.trainingActive) return;
  if (state.deleteTargetIdx !== -1) {
    deleteRepertoireFromBackend(state.repertoires[state.deleteTargetIdx]);
    state.repertoires.splice(state.deleteTargetIdx, 1);
    if (state.activeRepIndex === state.deleteTargetIdx) {
      state.activeRepIndex = -1;
      state.currentNode = state.freePlayRoot;
      state.chess.reset();
    } else if (state.activeRepIndex > state.deleteTargetIdx) {
      state.activeRepIndex -= 1;
    }
  } else if (state.menuTarget && state.menuTarget.parent) {
    const parent = state.menuTarget.parent;
    parent.children = parent.children.filter(child => child.id !== state.menuTarget.id);
    if (state.currentNode.id === state.menuTarget.id || isDescendant(state.menuTarget, state.currentNode)) {
      state.currentNode = parent;
      state.chess.load(parent.fen);
    }
  }

  state.deleteTargetIdx = -1;
  eventBus.emit('closeModals');
  scheduleRepertoireSync();
  eventBus.emit('render');
}
