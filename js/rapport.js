import { generateMiniboardHtml } from './boardUtils.js';
import { loadState } from './storage.js';

const BOARD_THEME_KEY = 'alphaChess.boardTheme';

// ══════════════════════════════════════════════════════════════════════════════
//  rapport.js — Analyse de performances / Rapport de priorités d'entraînement
// ══════════════════════════════════════════════════════════════════════════════

// ── API base URL (même logique que stats.js) ──────────────────────────────────
function buildApiBase() {
  const configured = (window.ALPHA_CHESS_API_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  return 'http://localhost:4000/api';
}

// ── Base de données d'ouvertures (Lichess chess-openings, 3706 entrées) ──────
// Chargée à la volée depuis data/openings.json
let OPENINGS = null;

async function ensureOpeningsLoaded() {
  if (OPENINGS) return;
  const res = await fetch('data/openings.json');
  if (!res.ok) throw new Error(`Impossible de charger les ouvertures (${res.status})`);
  const data = await res.json();
  OPENINGS = data.openings;
}

function pathToString(path) {
  return path.join(' ');
}

function lookupEco(path) {
  if (!OPENINGS) return null;
  const str = pathToString(path);
  for (const entry of OPENINGS) {
    if (str.startsWith(entry.s) || str === entry.s) return entry.n;
  }
  return null;
}

// ── Numéro de coup depuis une FEN ──────────────────────────────────────────────
function getMoveNumberFromFen(fen) {
  if (!fen) return 1;
  const parts = fen.split(' ');
  return parseInt(parts[parts.length - 1], 10) || 1;
}

// ── Nommage d'ouverture (répertoires > ECO > fallback) ────────────────────────
function getOpeningName(item, repertoires) {
  const fullPath = [...item.contextPath, item.playerMove];

  // 1. Chercher dans les répertoires de l'utilisateur
  if (Array.isArray(repertoires)) {
    for (const rep of repertoires) {
      if (rep && rep.name) {
        const repFen = rep.fen ? rep.fen.split(' ')[0] : null;
        const beforeFen = item.fenBefore ? item.fenBefore.split(' ')[0] : null;
        if (repFen && beforeFen && repFen === beforeFen) return rep.name;
      }
    }
  }

  // 2. Table ECO (uniquement pour les chemins complets d'au moins 3 demi-coups,
  //    pour éviter les noms trompeurs sur les chemins relatifs à une position filtrée)
  if (fullPath.length >= 3) {
    const eco = lookupEco(fullPath);
    if (eco) return eco;
  }

  // 3. Fallback: nom du parent + derniers coups
  const parentEco = lookupEco(item.contextPath);
  if (parentEco && item.playerMove) {
    return `${parentEco} : ${item.playerMove}`;
  }

  // 4. Dernier recours: premiers coups
  if (fullPath.length > 0) return `1.${fullPath[0]}…`;
  return 'Position initiale';
}

// Variante qui prend un path directement (utile pour les groupes sans header)
function getOpeningNameByPath(fullPath, fenBefore, repertoires) {
  // 1. Répertoires
  if (Array.isArray(repertoires)) {
    for (const rep of repertoires) {
      if (rep && rep.name) {
        const repFen = rep.fen ? rep.fen.split(' ')[0] : null;
        const beforeFen = fenBefore ? fenBefore.split(' ')[0] : null;
        if (repFen && beforeFen && repFen === beforeFen) return rep.name;
      }
    }
  }
  // 2. ECO lookup (pas de limite de profondeur : le path groupe est absolu)
  if (fullPath.length >= 1) {
    const eco = lookupEco(fullPath);
    if (eco) return eco;
  }
  // 3. Fallback
  const parentEco = lookupEco(fullPath.slice(0, -1));
  if (parentEco && fullPath.length > 0) {
    return `${parentEco} : ${fullPath[fullPath.length - 1]}`;
  }
  if (fullPath.length > 0) return `1.${fullPath[0]}…`;
  return 'Position initiale';
}

// ── Notation PGN d'un chemin de coups ────────────────────────────────────────
function pathToPgn(path, highlightLast = false, startMove = 1) {
  let html = '';
  for (let i = 0; i < path.length; i++) {
    if (i % 2 === 0) {
      html += `<span class="pgn-movenum">${startMove + Math.floor(i / 2)}.</span>`;
    }
    const isLast = i === path.length - 1;
    const cls    = (isLast && highlightLast) ? ' class="pgn-player-move"' : '';
    html += `<span${cls}>${path[i]}</span> `;
  }
  return html.trimEnd();
}

// ── Priorité badge ────────────────────────────────────────────────────────────
function priorityBadge(item) {
  if (item.priority >= 5 && item.gap >= 0.10) return { badgeClass: 'badge-critical', itemClass: 'report-item--critical', label: 'CRITIQUE', rank: 3 };
  if (item.priority >= 2 || item.gap >= 0.08)  return { badgeClass: 'badge-important', itemClass: 'report-item--important', label: 'IMPORTANT', rank: 2 };
  return { badgeClass: 'badge-minor', itemClass: 'report-item--minor', label: 'MINEUR', rank: 1 };
}

function compareReportItems(a, b) {
  return (priorityBadge(b).rank - priorityBadge(a).rank)
    || (b.priority - a.priority)
    || (b.gap - a.gap)
    || (b.total - a.total);
}

// ── Barre WDL visuelle ────────────────────────────────────────────────────────
function wdlBar(wins, draws, losses) {
  const total = wins + draws + losses;
  if (!total) return '';
  const wPct = (wins  / total * 100).toFixed(1);
  const dPct = (draws / total * 100).toFixed(1);
  const lPct = (losses / total * 100).toFixed(1);
  return `
    <div class="wdl-bar" title="${wPct}% V / ${dPct}% N / ${lPct}% D">
      <div class="wdl-seg wdl-win"  style="width:${wPct}%"></div>
      <div class="wdl-seg wdl-draw" style="width:${dPct}%"></div>
      <div class="wdl-seg wdl-loss" style="width:${lPct}%"></div>
    </div>
    <div class="wdl-labels">
      <span class="wdl-w">${wins}V</span>
      <span class="wdl-d">${draws}N</span>
      <span class="wdl-l">${losses}D</span>
    </div>`;
}

// ── Confiance visuelle ─────────────────────────────────────────────────────────
function confidenceDots(total) {
  const filled = total >= 100 ? 5 : total >= 50 ? 4 : total >= 20 ? 3 : total >= 8 ? 2 : 1;
  let dots = '';
  for (let i = 0; i < 5; i++) {
    dots += `<span class="conf-dot ${i < filled ? 'filled' : ''}"></span>`;
  }
  return `<span class="conf-dots">${dots}</span>`;
}

// ── Estimation de durée (simplifiée, sans profondeur) ────────────────────────
function estimateDuration(dateFrom, dateTo) {
  let months = 12;
  if (dateFrom && dateTo) {
    const d1 = new Date(dateFrom + '-01');
    const d2 = new Date(dateTo + '-01');
    if (!isNaN(d1) && !isNaN(d2)) {
      months = Math.max(1, (d2 - d1) / (1000 * 60 * 60 * 24 * 30));
    }
  } else if (dateFrom) {
    const now = new Date();
    const d1 = new Date(dateFrom + '-01');
    if (!isNaN(d1)) months = Math.max(1, (now - d1) / (1000 * 60 * 60 * 24 * 30));
  }
  return Math.min(90, Math.round(15 + months * 3));
}

// ── Lire les répertoires en localStorage ─────────────────────────────────────
function loadRepertoires() {
  try {
    const raw = localStorage.getItem('alphaChess.repertoires');
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const PIECE_GLYPHS = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', 
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' 
};
const METRIC_HELP = {
  foundGames: 'Nombre de parties qui correspondent aux filtres choisis et, si une position de départ est définie, qui atteignent réellement cette position.',
  analyzedGames: 'Nombre de parties effectivement utilisées pour comparer les lignes. Ici il correspond au sous-ensemble retenu pour le rapport.',
  baselineScore: 'Score moyen du joueur sur cet échantillon. Une victoire vaut 1, une nulle vaut 0,5, une défaite vaut 0.',
  lineScore: 'Score moyen obtenu dans cette ligne précise sur les parties de l’échantillon.',
  gap: 'Différence entre le score global et le score de cette ligne. Plus l’écart est grand, plus la ligne sous-performe.',
  avoidable: 'Estimation du nombre de points perdus sur 100 parties à cause de cette ligne si elle reste sous votre moyenne globale.',
};
const POSITION_PALETTE = [
  { piece: 'K', label: '♔' }, { piece: 'Q', label: '♕' }, { piece: 'R', label: '♖' },
  { piece: 'B', label: '♗' }, { piece: 'N', label: '♘' }, { piece: 'P', label: '♙' },
  { piece: 'k', label: '♚' }, { piece: 'q', label: '♛' }, { piece: 'r', label: '♜' }, 
  { piece: 'b', label: '♝' }, { piece: 'n', label: '♞' }, { piece: 'p', label: '♟' }, 
  { piece: '', label: '·', title: 'Effacer' }, 
];
const positionEditorState = {
  enabled: false,
  flipped: false,
  chess: null,
  selectedSq: null,
  legalTargets: new Set(),
  lastMove: null,
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMetricLabel(label, helpText) {
  return `<span class="metric-help">${label}<span class="metric-help-icon">i</span><span class="metric-help-bubble">${escapeHtml(helpText)}</span></span>`;
}

function formatTimeClassLabel(value) {
  const map = {
    all: 'toutes cadences',
    bullet: 'bullet',
    blitz: 'blitz',
    rapid: 'rapide',
    classical: 'classique',
    daily: 'correspondance'
  };
  return map[value] || value || 'toutes cadences';
}

function formatColorLabel(value) {
  return value === 'black' ? 'Noirs' : 'Blancs';
}

function formatMonthRangeValue(value) {
  if (!value) return 'origine';
  const [year, month] = value.split('/');
  const monthLabels = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const index = Number.parseInt(month, 10) - 1;
  if (index < 0 || index > 11 || !year) return value;
  return `${monthLabels[index]} ${year}`;
}

function formatEloLabel(min, max) {
  if (min > 0 && max < 3000) return `${min}-${max} Elo`;
  if (min > 0) return `>= ${min} Elo`;
  if (max < 3000) return `<= ${max} Elo`;
  return 'tous Elo';
}

function summarizeParams(params, data) {
  const parts = [
    `parties de ${params.username}`,
    formatColorLabel(params.color),
    `en ${formatTimeClassLabel(params.timeClass)}`,
  ];

  if (params.dateFrom || params.dateTo) {
    const from = formatMonthRangeValue(params.dateFrom || 'origine');
    const to = formatMonthRangeValue(params.dateTo || 'aujourd’hui');
    parts.push(`de ${from} à ${to}`);
  }

  parts.push(`contre ${formatEloLabel(params.eloMin, params.eloMax)}`);
  if (data.positionFiltered) parts.push('depuis la position sélectionnée');
  if (data.focusMoveNumber) parts.push(`comparées au ${data.focusMoveNumber}e coup du joueur`);
  return parts.join(' · ');
}

function parseFen(fen) {
  const raw = String(fen || '').trim();
  if (!raw) return null;

  const parts = raw.split(/\s+/);
  const boardPart = parts[0];
  const turn = parts[1] === 'b' ? 'b' : 'w';
  const castling = parts[2] && parts[2] !== '-' ? parts[2] : '';
  const rows = boardPart.split('/');
  if (rows.length !== 8) return null;

  const squares = [];
  for (const row of rows) {
    let count = 0;
    for (const char of row) {
      if (/\d/.test(char)) {
        const empties = Number.parseInt(char, 10);
        count += empties;
        for (let i = 0; i < empties; i++) squares.push('');
      } else if (PIECE_GLYPHS[char]) {
        squares.push(char);
        count++;
      } else {
        return null;
      }
    }
    if (count !== 8) return null;
  }
  if (squares.length !== 64) return null;

  return { squares, turn, castling };
}

function serializeFen(editor) {
  const rows = [];
  for (let rank = 0; rank < 8; rank++) {
    let row = '';
    let empties = 0;
    for (let file = 0; file < 8; file++) {
      const piece = editor.squares[rank * 8 + file] || '';
      if (!piece) {
        empties++;
      } else {
        if (empties) {
          row += String(empties);
          empties = 0;
        }
        row += piece;
      }
    }
    if (empties) row += String(empties);
    rows.push(row);
  }
  const castling = editor.castling || '-';
  return `${rows.join('/')} ${editor.turn || 'w'} ${castling} - 0 1`;
}

function squareNameFromIndex(index) {
  const file = String.fromCharCode(97 + (index % 8));
  const rank = 8 - Math.floor(index / 8);
  return `${file}${rank}`;
}

function getMiniBoardPieceIcon(piece) {
  const map = {
    wp: '4/45/Chess_plt45.svg',
    wr: '7/72/Chess_rlt45.svg',
    wn: '7/70/Chess_nlt45.svg',
    wb: 'b/b1/Chess_blt45.svg',
    wq: '1/15/Chess_qlt45.svg',
    wk: '4/42/Chess_klt45.svg',
    bp: 'c/c7/Chess_pdt45.svg',
    br: 'f/ff/Chess_rdt45.svg',
    bn: 'e/ef/Chess_ndt45.svg',
    bb: '9/98/Chess_bdt45.svg',
    bq: '4/47/Chess_qdt45.svg',
    bk: 'f/f0/Chess_kdt45.svg',
  };
  return map[piece.color + piece.type];
}

function renderFenBoardHtml(fen, { highlightUci = '', flipped = false, lightSquare, darkSquare } = {}) {
  return generateMiniboardHtml(fen, highlightUci, { flipped, lightSquare, darkSquare });
}

function resetPositionEditor(fen = START_FEN) {
  positionEditorState.chess = new Chess();
  positionEditorState.chess.load(fen);
  positionEditorState.selectedSq = null;
  positionEditorState.legalTargets = new Set();
  positionEditorState.lastMove = null;
}

function syncPositionFenField() {
  const input = document.getElementById('rapport-position-fen-input');
  if (input && positionEditorState.chess) input.value = positionEditorState.chess.fen();
}

function renderPositionBoard() {
  const board = document.getElementById('rapport-position-board');
  if (!board) return;

  const theme = loadState(BOARD_THEME_KEY);
  if (theme?.light && theme?.dark) {
    board.style.setProperty('--fen-light', theme.light);
    board.style.setProperty('--fen-dark', theme.dark);
  }

  const chess = positionEditorState.chess || new Chess();
  const matrix = chess.board();
  const flipped = positionEditorState.flipped;

  positionEditorState.legalTargets = new Set();
  if (positionEditorState.selectedSq) {
    chess.moves({ square: positionEditorState.selectedSq, verbose: true }).forEach(move => {
      positionEditorState.legalTargets.add(move.to);
    });
  }

  board.innerHTML = Array.from({ length: 64 }, (_, index) => {
    const viewIndex = flipped ? 63 - index : index;
    const rank = Math.floor(viewIndex / 8);
    const file = viewIndex % 8;
    const square = squareNameFromIndex(viewIndex);
    const tone = (rank + file) % 2 === 0 ? 'is-light' : 'is-dark';
    const piece = matrix[rank][file];
    const isSelected = positionEditorState.selectedSq === square;
    const isLegal = positionEditorState.legalTargets.has(square);
    const isLast = positionEditorState.lastMove && (positionEditorState.lastMove.from === square || positionEditorState.lastMove.to === square);
    const imgHtml = piece
      ? `<img src="https://upload.wikimedia.org/wikipedia/commons/${getMiniBoardPieceIcon(piece)}" alt="" />`
      : '';
    const legalHtml = isLegal
      ? (piece ? '<span class="legal-ring"></span>' : '<span class="legal-dot"></span>')
      : '';
    return `<button type="button" class="fen-square ${tone}${isSelected ? ' is-selected' : ''}${isLast ? ' is-lastmove' : ''}" data-square="${square}">${imgHtml}${legalHtml}</button>`;
  }).join('');

  board.querySelectorAll('[data-square]').forEach(squareEl => {
    squareEl.addEventListener('click', () => handlePositionSquareClick(squareEl.dataset.square));
  });

  syncPositionFenField();
}

function handlePositionSquareClick(square) {
  const chess = positionEditorState.chess;
  if (!chess) return;

  if (positionEditorState.selectedSq === square) {
    positionEditorState.selectedSq = null;
    renderPositionBoard();
    return;
  }

  if (positionEditorState.selectedSq) {
    const move = chess.move({ from: positionEditorState.selectedSq, to: square, promotion: 'q' });
    if (move) {
      positionEditorState.lastMove = { from: move.from, to: move.to };
      positionEditorState.selectedSq = null;
      renderPositionBoard();
      return;
    }
    positionEditorState.selectedSq = null;
  }

  const piece = chess.get(square);
  if (piece && piece.color === chess.turn()) {
    positionEditorState.selectedSq = square;
  }
  renderPositionBoard();
}

function syncPositionEditorOrientation() {
  const color = document.querySelector('input[name="rapport-color"]:checked')?.value || 'white';
  positionEditorState.flipped = color === 'black';
  renderPositionBoard();
}

function initPositionEditor() {
  resetPositionEditor();
  renderPositionBoard();
  syncPositionFenField();

  const enabled = document.getElementById('rapport-position-enabled');
  const builder = document.getElementById('rapport-position-builder');
  const fenInput = document.getElementById('rapport-position-fen-input');
  const caption = document.getElementById('rapport-position-caption');
  const colorRadios = document.querySelectorAll('input[name="rapport-color"]');

  enabled?.addEventListener('change', () => {
    positionEditorState.enabled = enabled.checked;
    if (builder) builder.classList.toggle('visible', enabled.checked);
  });

  colorRadios.forEach(radio => radio.addEventListener('change', syncPositionEditorOrientation));
  syncPositionEditorOrientation();

  fenInput?.addEventListener('change', () => {
    const board = new Chess();
    if (!board.load(fenInput.value)) {
      if (caption) caption.textContent = 'FEN invalide. Utilisez le mini-échiquier ou corrigez le champ.';
      return;
    }
    positionEditorState.chess = board;
    positionEditorState.selectedSq = null;
    positionEditorState.legalTargets = new Set();
    positionEditorState.lastMove = null;
    if (caption) caption.textContent = 'Position chargée depuis la FEN.';
    renderPositionBoard();
    syncPositionFenField();
  });

  document.getElementById('rapport-position-reset')?.addEventListener('click', () => {
    resetPositionEditor();
    if (caption) caption.textContent = 'Position initiale restaurée.';
    renderPositionBoard();
    syncPositionFenField();
  });

  document.getElementById('rapport-position-undo')?.addEventListener('click', () => {
    if (positionEditorState.chess?.history().length) {
      positionEditorState.chess.undo();
      positionEditorState.selectedSq = null;
      positionEditorState.legalTargets = new Set();
      positionEditorState.lastMove = null;
      if (caption) caption.textContent = 'Dernier coup annulé.';
      renderPositionBoard();
      syncPositionFenField();
    }
  });

  document.getElementById('rapport-position-clear')?.addEventListener('click', () => {
    resetPositionEditor();
    if (caption) caption.textContent = 'Position réinitialisée.';
    renderPositionBoard();
    syncPositionFenField();
  });
}

// ── Regroupement hiérarchique ────────────────────────────────────────────────
// Sans filtre : on groupe les items depth >= 4 par les 4 premiers demi-coups.
// Le groupe est valide si son gap global (baseline - groupScore) > 0.02 et total >= 10.
// Les lignes critiques sont les items depth >= 6, triées par score croissant.
// Avec filtre de position : comportement original (depth 0 = header).
function groupItems(items, positionFiltered, baselineScore) {
  if (positionFiltered) {
    return groupItemsLegacy(items, baselineScore);
  }

  const groups = new Map();
  for (const item of items) {
    if (item.depth < 4) continue;
    const ply = Math.min(item.contextPath.length, 4);
    const key = item.contextPath.slice(0, ply).join(' ');
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, { key, children: [], total: 0, wins: 0, draws: 0, losses: 0, lossesAvoided: 0, fen: null, fenUci: null });
    }
    const g = groups.get(key);
    g.total  += item.total;
    g.wins   += item.wins;
    g.draws  += item.draws;
    g.losses += item.losses;
    g.lossesAvoided += item.lossesAvoided;
    g.children.push(item);
  }

  // Reconstruire la FEN de chaque groupe en rejouant les coups de la clé
  for (const g of groups.values()) {
    const moves = g.key.split(' ');
    try {
      const chess = new Chess();
      for (const m of moves) chess.move(m);
      g.fen    = chess.fen();
      g.fenUci = null;
    } catch (e) {
      g.fen = null;
    }

    // Calculer les métriques du groupe
    const groupScore = g.total > 0 ? (g.wins + 0.5 * g.draws) / g.total : 0;
    g.groupScore = groupScore;
    g.groupGap   = baselineScore - groupScore;
    g.groupPriority = g.groupGap > 0
      ? g.groupGap * Math.sqrt(g.total) * (g.total / (g.total + 15))
      : 0;

    // Lignes critiques = items depth >= 6, triées par score croissant (pires winrates en premier)
    g.criticalLines = g.children
      .filter(c => c.depth >= 6)
      .sort((a, b) => a.score - b.score);
  }

  // Ne garder que les groupes valides : gap global > 2% et minimum 10 parties
  return Array.from(groups.values())
    .filter(g => g.groupGap > 0.02 && g.total >= 10)
    .sort((a, b) => b.groupPriority - a.groupPriority);
}

// Version legacy pour le mode avec filtre de position
function groupItemsLegacy(items, baselineScore) {
  const groups = new Map();
  for (const item of items) {
    if (item.depth === 0) {
      const key = item.playerMove;
      if (!groups.has(key)) {
        groups.set(key, { key, header: null, children: [], total: 0, wins: 0, draws: 0, losses: 0, lossesAvoided: 0, fen: null, fenUci: null });
      }
      const g = groups.get(key);
      g.header = item;
      g.total  += item.total;
      g.wins   += item.wins;
      g.draws  += item.draws;
      g.losses += item.losses;
      g.lossesAvoided += item.lossesAvoided;
    }
  }

  for (const item of items) {
    if (item.depth === 0) continue;
    const key = item.contextPath[0];
    if (!key) continue;
    if (!groups.has(key)) {
      groups.set(key, { key, header: null, children: [], total: 0, wins: 0, draws: 0, losses: 0, lossesAvoided: 0, fen: null, fenUci: null });
    }
    const g = groups.get(key);
    g.total  += item.total;
    g.wins   += item.wins;
    g.draws  += item.draws;
    g.losses += item.losses;
    g.lossesAvoided += item.lossesAvoided;
    g.children.push(item);
  }

  for (const g of groups.values()) {
    if (g.header) {
      g.fen    = g.header.fenAfter;
      g.fenUci = g.header.playerUci;
    }
    const groupScore = g.total > 0 ? (g.wins + 0.5 * g.draws) / g.total : 0;
    g.groupScore = groupScore;
    g.groupGap   = baselineScore - groupScore;
    g.groupPriority = g.groupGap > 0
      ? g.groupGap * Math.sqrt(g.total) * (g.total / (g.total + 15))
      : 0;
    g.criticalLines = g.children
      .filter(c => c.depth >= 6)
      .sort((a, b) => a.score - b.score);
  }

  return Array.from(groups.values())
    .filter(g => g.header && g.header.gap > 0.01)
    .sort((a, b) => b.groupPriority - a.groupPriority);
}

// ── Regroupement "meilleures performances" (symétrique de groupItems) ──────
function groupBestItems(items, baselineScore, positionFiltered) {
  if (positionFiltered) {
    return groupBestItemsLegacy(items, baselineScore);
  }

  const positive = items.filter(i => i.gap < -0.01);
  const groups = new Map();
  for (const item of positive) {
    if (item.depth < 4) continue;
    const key = item.contextPath.slice(0, 4).join(' ');
    if (!key) continue;
    if (!groups.has(key)) {
      groups.set(key, { key, children: [], total: 0, wins: 0, draws: 0, losses: 0, lossesAvoided: 0, fen: null, fenUci: null });
    }
    const g = groups.get(key);
    g.total  += item.total;
    g.wins   += item.wins;
    g.draws  += item.draws;
    g.losses += item.losses;
    g.lossesAvoided += item.lossesAvoided;
    g.children.push(item);
  }

  for (const g of groups.values()) {
    const moves = g.key.split(' ');
    try {
      const chess = new Chess();
      for (const m of moves) chess.move(m);
      g.fen    = chess.fen();
      g.fenUci = null;
    } catch (e) {
      g.fen = null;
    }
    const groupScore = g.total > 0 ? (g.wins + 0.5 * g.draws) / g.total : 0;
    g.groupScore = groupScore;
    g.groupGap   = baselineScore - groupScore;
    g.criticalLines = g.children
      .filter(c => c.depth >= 6)
      .sort((a, b) => b.score - a.score);
  }

  return Array.from(groups.values())
    .filter(g => g.groupGap < -0.02 && g.total >= 10)
    .sort((a, b) => a.groupGap - b.groupGap);
}

function groupBestItemsLegacy(items, baselineScore) {
  const positive = items.filter(i => i.gap < -0.01);
  const groups = new Map();
  for (const item of positive) {
    if (item.depth === 0) {
      const key = item.playerMove;
      if (!groups.has(key)) {
        groups.set(key, { key, header: null, children: [], total: 0, wins: 0, draws: 0, losses: 0, lossesAvoided: 0, fen: null, fenUci: null });
      }
      const g = groups.get(key);
      g.header = item;
      g.total  += item.total;
      g.wins   += item.wins;
      g.draws  += item.draws;
      g.losses += item.losses;
      g.lossesAvoided += item.lossesAvoided;
    }
  }
  for (const item of positive) {
    if (item.depth === 0) continue;
    const key = item.contextPath[0];
    if (!key) continue;
    if (!groups.has(key)) {
      groups.set(key, { key, header: null, children: [], total: 0, wins: 0, draws: 0, losses: 0, lossesAvoided: 0, fen: null, fenUci: null });
    }
    const g = groups.get(key);
    g.total  += item.total;
    g.wins   += item.wins;
    g.draws  += item.draws;
    g.losses += item.losses;
    g.lossesAvoided += item.lossesAvoided;
    g.children.push(item);
  }
  for (const g of groups.values()) {
    if (g.header) {
      g.fen    = g.header.fenAfter;
      g.fenUci = g.header.playerUci;
    }
    const groupScore = g.total > 0 ? (g.wins + 0.5 * g.draws) / g.total : 0;
    g.groupScore = groupScore;
    g.groupGap   = baselineScore - groupScore;
    g.criticalLines = g.children
      .filter(c => c.depth >= 6)
      .sort((a, b) => b.score - a.score);
  }
  return Array.from(groups.values())
    .filter(g => g.header && g.header.gap < -0.01)
    .sort((a, b) => a.groupGap - b.groupGap);
}

// ── Carte variante large (carte heavy complète : board, WDL, stats) ────────
function renderGroupAsHeavyCard(group, baselineScore, params, boardTheme, repertoires, startMove) {
  const h = group.header;
  const hPct = (group.groupScore * 100).toFixed(0);
  const hGapVal = group.groupGap * 100;
  const hGap = hGapVal.toFixed(0);
  const basePct = (baselineScore * 100).toFixed(0);
  const fullPath = h ? [...h.contextPath, h.playerMove] : (group.key ? group.key.split(' ') : []);
  const pgnHtml = pathToPgn(fullPath, false, startMove) || '';
  const lossPct = group.total > 0 ? ((group.losses / group.total) * 100).toFixed(0) : '—';

  // FEN pour le board
  const fenForBoard       = h ? h.fenAfter : group.fen;
  const groupHighlightUci = h ? h.playerUci : group.fenUci;

  // Badge basé sur le gap global du groupe
  const groupBadge = h ? priorityBadge(h) : { badgeClass: group.groupGap >= 0.08 ? 'badge-critical' : group.groupGap >= 0.06 ? 'badge-important' : 'badge-minor', itemClass: group.groupGap >= 0.08 ? 'report-item--critical' : group.groupGap >= 0.06 ? 'report-item--important' : '', label: group.groupGap >= 0.08 ? 'CRITIQUE' : group.groupGap >= 0.06 ? 'IMPORTANT' : 'MINEUR', rank: group.groupGap >= 0.08 ? 3 : group.groupGap >= 0.06 ? 2 : 1 };

  // Texte d'explication
  let explanation = '';
  if (group.criticalLines.length > 0) {
    const childLossShare = group.criticalLines.reduce((s, c) => s + c.losses, 0);
    const ratio = childLossShare / Math.max(1, group.losses);
    if (ratio > 0.7) {
      explanation = `⚠️ ${(ratio * 100).toFixed(0)}% de vos défaites dans cette ouverture sont concentrées dans ${group.criticalLines.length} ligne${group.criticalLines.length > 1 ? 's' : ''} spécifique${group.criticalLines.length > 1 ? 's' : ''}.`;
    } else if (ratio > 0.3) {
      explanation = `📊 ${(ratio * 100).toFixed(0)}% des défaites sont capturées par ces lignes spécifiques — le reste est réparti sur d'autres variantes.`;
    } else {
      explanation = `📊 Les pertes sont réparties uniformément — aucun problème de ligne particulière, l'ouverture entière est difficile.`;
    }
  } else {
    const lossRate = group.losses / Math.max(1, group.total);
    const baselineLossRate = 1 - baselineScore;
    if (lossRate > baselineLossRate * 1.3) {
      explanation = `⚠️ Score anormalement bas sur cette ouverture dans son ensemble (${lossPct}% de défaites).`;
    } else {
      explanation = `📊 Légère sous-performance globale — pas de ligne spécifique à cibler.`;
    }
  }

  return `
    <div class="report-group-card report-item ${groupBadge.itemClass}">
      <div class="report-item-layout">
        <div>
            <div class="report-item-header">
              <span class="priority-badge ${groupBadge.badgeClass}">${groupBadge.label}</span>
              <div class="report-item-name">${h ? getOpeningName(h, repertoires) : getOpeningNameByPath(fullPath, fenForBoard, repertoires)}</div>
              <div class="report-item-meta">${group.total} parties · ${lossPct}% de défaites</div>
            </div>

          ${pgnHtml ? `<div class="report-item-line">${pgnHtml}</div>` : ''}

          <div class="report-item-stats">
            <div class="stat-block">
              <div class="stat-block-val ${parseInt(hPct, 10) < parseInt(basePct, 10) ? 'stat-bad' : ''}">${hPct}%</div>
              <div class="stat-block-lbl">${renderMetricLabel('Score variante', METRIC_HELP.lineScore)}</div>
            </div>
            <div class="stat-block stat-block--gap">
              <div class="stat-block-val stat-bad ${hGapVal >= 0 ? '' : 'stat-good'}">${hGapVal >= 0 ? `−${hGap}%` : `+${Math.abs(hGapVal).toFixed(0)}%`}</div>
              <div class="stat-block-lbl">${renderMetricLabel('Écart', METRIC_HELP.gap)}</div>
            </div>
            <div class="stat-block stat-block--loss">
              <div class="stat-block-val stat-bad">${Math.round(group.lossesAvoided * 16)} pts</div>
              <div class="stat-block-lbl">Pertes Evitables</div>
            </div>
          </div>

          ${wdlBar(group.wins, group.draws, group.losses)}

          <div class="report-group-explanation">${explanation}</div>

          <div class="report-item-footer">
            ${confidenceDots(group.total)}
            <span class="conf-label">${group.total >= 100 ? 'Très fiable' : group.total >= 30 ? 'Fiable' : group.total >= 10 ? 'Échantillon moyen' : 'Peu de données'}</span>
          </div>
        </div>
          ${fenForBoard ? `<div class="report-item-board">
          ${renderFenBoardHtml(fenForBoard, { highlightUci: groupHighlightUci, flipped: params.color === 'black', lightSquare: boardTheme?.light, darkSquare: boardTheme?.dark })}
        </div>` : ''}
      </div>
      ${group.criticalLines.length > 0 ? `<button class="report-group-toggle" aria-expanded="true">
        <span class="report-group-arrow">▼</span>
        <span>${group.criticalLines.length} ligne${group.criticalLines.length > 1 ? 's' : ''} critique${group.criticalLines.length > 1 ? 's' : ''}</span>
      </button>` : ''}
    </div>`;
}

// ── Carte variante large "meilleures performances" ─────────────────────────
function renderGroupAsHeavyCardStrengths(group, baselineScore, params, boardTheme, repertoires, startMove) {
  const h = group.header;
  const hPct = (group.groupScore * 100).toFixed(0);
  const hGapVal = Math.abs(group.groupGap * 100);
  const hGap = hGapVal.toFixed(0);
  const basePct = (baselineScore * 100).toFixed(0);
  const fullPath = h ? [...h.contextPath, h.playerMove] : (group.key ? group.key.split(' ') : []);
  const pgnHtml = pathToPgn(fullPath, false, startMove) || '';
  const winPct = group.total > 0 ? ((group.wins / group.total) * 100).toFixed(0) : '—';
  const fenForBoard       = h ? h.fenAfter : group.fen;
  const groupHighlightUci = h ? h.playerUci : group.fenUci;

  let explanation = '';
  if (group.criticalLines.length > 0) {
    const childWinShare = group.criticalLines.reduce((s, c) => s + c.wins, 0);
    const ratio = childWinShare / Math.max(1, group.wins);
    if (ratio > 0.7) {
      explanation = `🏆 ${(ratio * 100).toFixed(0)}% de vos victoires dans ce groupe sont concentrées dans ${group.criticalLines.length} ligne${group.criticalLines.length > 1 ? 's' : ''} spécifique${group.criticalLines.length > 1 ? 's' : ''}.`;
    } else if (ratio > 0.3) {
      explanation = `📊 ${(ratio * 100).toFixed(0)}% des victoires sont capturées par ces lignes spécifiques — le reste est réparti sur d'autres variantes.`;
    } else {
      explanation = `📊 Les gains sont répartis uniformément — pas de ligne particulière qui domine.`;
    }
  } else {
    const winRate = group.wins / Math.max(1, group.total);
    const baselineWinRate = baselineScore;
    if (winRate > baselineWinRate * 1.3) {
      explanation = `🏆 Score anormalement élevé sur cette ouverture dans son ensemble (${winPct}% de victoires).`;
    } else {
      explanation = `📊 Légère surperformance globale — pas de ligne spécifique à cibler.`;
    }
  }

  return `
    <div class="report-group-card report-item--good">
      <div class="report-item-layout">
        <div>
            <div class="report-item-header">
              <span class="priority-badge badge-good">FORT</span>
              <div class="report-item-name">${h ? getOpeningName(h, repertoires) : getOpeningNameByPath(fullPath, fenForBoard, repertoires)}</div>
              <div class="report-item-meta">${group.total} parties · ${winPct}% de victoires</div>
            </div>

          ${pgnHtml ? `<div class="report-item-line">${pgnHtml}</div>` : ''}

          <div class="report-item-stats">
            <div class="stat-block">
              <div class="stat-block-val stat-good">${hPct}%</div>
              <div class="stat-block-lbl">${renderMetricLabel('Score variante', METRIC_HELP.lineScore)}</div>
            </div>
            <div class="stat-block stat-block--gap">
              <div class="stat-block-val stat-good">+${hGap}%</div>
              <div class="stat-block-lbl">${renderMetricLabel('Avance', METRIC_HELP.gap)}</div>
            </div>
            <div class="stat-block stat-block--loss">
              <div class="stat-block-val stat-good">+${Math.round(Math.abs(group.lossesAvoided) * 16)} pts</div>
              <div class="stat-block-lbl">Bonus Elo</div>
            </div>
          </div>

          ${wdlBar(group.wins, group.draws, group.losses)}

          <div class="report-group-explanation">${explanation}</div>

          <div class="report-item-footer">
            ${confidenceDots(group.total)}
            <span class="conf-label">${group.total >= 100 ? 'Très fiable' : group.total >= 30 ? 'Fiable' : group.total >= 10 ? 'Échantillon moyen' : 'Peu de données'}</span>
          </div>
        </div>
          ${fenForBoard ? `<div class="report-item-board">
          ${renderFenBoardHtml(fenForBoard, { highlightUci: groupHighlightUci, flipped: params.color === 'black', lightSquare: boardTheme?.light, darkSquare: boardTheme?.dark })}
        </div>` : ''}
      </div>
      ${group.criticalLines.length > 0 ? `<button class="report-group-toggle" aria-expanded="true">
        <span class="report-group-arrow">▼</span>
        <span>${group.criticalLines.length} meilleure${group.criticalLines.length > 1 ? 's' : ''} ligne${group.criticalLines.length > 1 ? 's' : ''}</span>
      </button>` : ''}
    </div>`;
}

// ── Carte ligne critique (compacte : sans board, sans WDL) ─────────────────
function renderChildCard(item, baselineScore, repertoires, startMove) {
  const badge = priorityBadge(item);
  const fullPath = [...item.contextPath, item.playerMove];
  const pgnHtml = pathToPgn(fullPath, true, startMove) || 'Position sélectionnée';
  const linePct = (item.score * 100).toFixed(0);
  const gapPct  = (item.gap * 100).toFixed(0);
  const gainMiss = Math.round(item.lossesAvoided * 16);
  const confidenceLabel = item.total >= 100 ? 'Très fiable' : item.total >= 30 ? 'Fiable' : item.total >= 10 ? 'Échantillon moyen' : 'Peu de données';

  return `
    <div class="report-child-card">
      <div class="report-child-line">${pgnHtml}</div>
      <div class="report-child-stats">
        <span class="priority-badge ${badge.badgeClass}">${badge.label}</span>
        <span class="report-child-score">${linePct}%</span>
        <span class="report-child-gap">${item.gap >= 0 ? `−${gapPct}` : `+${Math.abs(item.gap * 100).toFixed(0)}`}%</span>
        <span class="report-child-losses">${gainMiss} pts</span>
        <span class="report-child-total">${item.total} parties</span>
        ${confidenceDots(item.total)}
        <span class="report-child-conf">${confidenceLabel}</span>
      </div>
    </div>`;
}

// ── Carte ligne "meilleure performance" (compacte : sans board, sans WDL) ──
function renderChildCardStrengths(item, baselineScore, repertoires, startMove) {
  const fullPath = [...item.contextPath, item.playerMove];
  const pgnHtml = pathToPgn(fullPath, true, startMove) || 'Position sélectionnée';
  const linePct = (item.score * 100).toFixed(0);
  const gapPct  = (Math.abs(item.gap) * 100).toFixed(0);
  const gainBonus = Math.round(Math.abs(item.lossesAvoided) * 16);
  const confidenceLabel = item.total >= 100 ? 'Très fiable' : item.total >= 30 ? 'Fiable' : item.total >= 10 ? 'Échantillon moyen' : 'Peu de données';

  return `
    <div class="report-child-card">
      <div class="report-child-line">${pgnHtml}</div>
      <div class="report-child-stats">
        <span class="priority-badge badge-good">FORT</span>
        <span class="report-child-score">${linePct}%</span>
        <span class="report-child-gap">+${gapPct}%</span>
        <span class="report-child-losses">+${gainBonus} pts</span>
        <span class="report-child-total">${item.total} parties</span>
        ${confidenceDots(item.total)}
        <span class="report-child-conf">${confidenceLabel}</span>
      </div>
    </div>`;
}

// ── Rendu du rapport ──────────────────────────────────────────────────────────
function renderReport(data, params) {
  const boardTheme = loadState(BOARD_THEME_KEY);
  const repertoires = loadRepertoires();
  const { totalGames, parsedGames: parsedCount, filteredGames, baselineScore, items, truncated, focusDepth: effectiveDepth } = data;
  const analyzed = parsedCount !== undefined ? parsedCount : totalGames;
  const worstItems = items.filter(i => i.gap > 0.01).sort(compareReportItems);
  const bestItems  = items.filter(i => i.gap < -0.01);
  const totalAvoidable = worstItems.reduce((sum, item) => sum + item.lossesAvoided, 0);

  const titleSub = document.getElementById('results-title-sub');
  if (titleSub) titleSub.textContent = summarizeParams(params, data);

  const startMove = getMoveNumberFromFen(data.rootFen);

  let html = `
    <div class="report-summary-grid">
      <div class="report-summary-card">
        <div class="rsc-value">${analyzed}</div>
        <div class="rsc-label">${renderMetricLabel('Parties analysées', METRIC_HELP.analyzedGames)}</div>
      </div>
      <div class="report-summary-card">
        <div class="rsc-value">${(baselineScore * 100).toFixed(0)}%</div>
        <div class="rsc-label">${renderMetricLabel('Moyenne', METRIC_HELP.baselineScore)}</div>
      </div>
      <div class="report-summary-card report-summary-card--alert">
        <div class="rsc-value">${Math.round(totalAvoidable * 16)} pts elo</div>
        <div class="rsc-label">${renderMetricLabel('Gain manqué', METRIC_HELP.avoidable)}</div>
      </div>
    </div>
    ${effectiveDepth ? `<p class="report-scope-note">🔍 Analyse fiable jusqu'au ${data.focusMoveNumber || ''}e coup du joueur (${effectiveDepth} demi-coups).</p>` : ''}
    ${truncated ? `<p class="report-warning">⚠️ Analyse limitée (${totalGames} parties max). Réduisez la période pour plus de précision.</p>` : ''}
  `;

  if (data.positionFiltered && filteredGames > totalGames) {
    html += `<div class="report-scope-note">${totalGames} parties atteignent la position sélectionnée sur ${filteredGames} parties correspondant aux autres filtres.</div>`;
  }

  const groups = groupItems(items, data.positionFiltered, baselineScore);

  if (!groups.length) {
    html += `<div class="report-empty">
      <div style="font-size:2.5rem;margin-bottom:12px;">🎉</div>
      <div style="font-size:1.1rem;font-weight:700;margin-bottom:8px;">Aucun point faible détecté.</div>
      <div style="color:var(--text-muted);font-size:0.9rem;">Soit vos résultats sont homogènes, soit l'échantillon est insuffisant pour détecter des tendances fiables.</div>
    </div>`;
    document.getElementById('view-results').innerHTML = html;
    return;
  }

  html += `<div class="report-tabs">
    <button class="report-tab-btn report-tab-btn--active" data-tab="priorities">Priorités d'entraînement</button>
    <button class="report-tab-btn" data-tab="strengths">Meilleures performances</button>
  </div>
  <div id="tab-priorities" class="report-tab-content">`;

  groups.forEach((group) => {
    html += `<div class="report-group">`;
    html += renderGroupAsHeavyCard(group, baselineScore, params, boardTheme, repertoires, startMove);

    if (group.criticalLines.length > 0) {
      html += `<div class="report-group-body">`;
      group.criticalLines.forEach(child => {
        html += renderChildCard(child, baselineScore, repertoires, startMove);
      });
      html += `</div>`;
    } else {
      html += `<div class="report-group-note">Toute cette variante est problématique. Les sous-lignes ne sont pas significativement pires les unes que les autres.</div>`;
    }

    html += `</div>`;
  });

  html += `</div>
  <div id="tab-strengths" class="report-tab-content" style="display:none">`;

  const bestGroups = groupBestItems(bestItems, baselineScore, data.positionFiltered);

  if (!bestGroups.length) {
    html += `<div class="report-empty"><div style="font-size:2rem;margin-bottom:8px;">🏆</div><div style="font-size:1rem;font-weight:600;">Pas encore assez de données pour identifier vos meilleures lignes.</div><div style="color:var(--text-muted);font-size:0.9rem;">Soit vos résultats sont trop homogènes, soit l'échantillon est insuffisant pour dégager des tendances fiables.</div></div>`;
  } else {
    bestGroups.forEach((group) => {
      html += `<div class="report-group">`;
      html += renderGroupAsHeavyCardStrengths(group, baselineScore, params, boardTheme, repertoires, startMove);

      if (group.criticalLines.length > 0) {
        html += `<div class="report-group-body">`;
        group.criticalLines.forEach(child => {
          html += renderChildCardStrengths(child, baselineScore, repertoires, startMove);
        });
        html += `</div>`;
      }

      html += `</div>`;
    });
  }

  html += '</div>';

  document.getElementById('view-results').innerHTML = html;

  // Tab switching
  document.querySelectorAll('.report-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.report-tab-btn').forEach(b => b.classList.toggle('report-tab-btn--active', b === btn));
      document.querySelectorAll('.report-tab-content').forEach(el => {
        el.style.display = el.id === `tab-${tab}` ? 'block' : 'none';
      });
    });
  });

  document.querySelectorAll('[data-action="open-app"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const fen = decodeURIComponent(btn.dataset.fen);
      sessionStorage.setItem('alphaChess.openAtFen', fen);
      sessionStorage.setItem('alphaChess.openFreePlay', '1');
      window.location.href = 'index.html';
    });
  });

  // Accordéon toggles
  document.querySelectorAll('.report-group-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', !expanded);
      btn.querySelector('.report-group-arrow').textContent = expanded ? '▶' : '▼';
      const body = btn.closest('.report-group').querySelector('.report-group-body');
      if (body) body.style.display = expanded ? 'none' : '';
    });
  });
}

// ── Mise à jour de la barre de progression ──────────────────────────────
function updateLoadingProgress(pct, detail) {
  const fill = document.getElementById('loading-bar-fill');
  const step = document.getElementById('loading-step-label');
  if (fill) {
    fill.style.transition = 'width 0.3s ease';
    fill.style.width = Math.min(100, Math.max(0, pct)) + '%';
  }
  if (step) step.textContent = detail;
}

// ── Vues ──────────────────────────────────────────────────────────────────────
function showView(id) {
  ['view-form', 'view-loading', 'view-results-wrap'].forEach(v => {
    const el = document.getElementById(v);
    if (el) el.style.display = (v === id) ? 'block' : 'none';
  });
}

// ── Validation du formulaire ──────────────────────────────────────────────────
function getFormParams() {
  const username = document.getElementById('rapport-username').value.trim();
  const color = document.querySelector('input[name="rapport-color"]:checked')?.value || 'white';
  const timeClass = document.getElementById('rapport-timeclass').value;
  const dfYear = document.getElementById('rapport-datefrom-year').value;
  const dfMonth = document.getElementById('rapport-datefrom-month').value;
  const dtYear = document.getElementById('rapport-dateto-year').value;
  const dtMonth = document.getElementById('rapport-dateto-month').value;
  const eloMin = parseInt(document.getElementById('rapport-elomin').value, 10) || 0;
  const eloMax = parseInt(document.getElementById('rapport-elomax').value, 10) || 3000;
  const dateFrom = (dfYear && dfMonth) ? `${dfYear}/${dfMonth}` : '';
  const dateTo = (dtYear && dtMonth) ? `${dtYear}/${dtMonth}` : '';
  const startFen = document.getElementById('rapport-position-enabled')?.checked
    ? document.getElementById('rapport-position-fen-input')?.value.trim() || ''
    : '';

  return { username, color, timeClass, dateFrom, dateTo, eloMin, eloMax, startFen };
}

// ── Fetch du rapport via SSE avec progression temps réel ──────────────────────
let currentAbortController = null;

async function runAnalysis(params, onProgress, signal) {
  const apiBase = buildApiBase();
  const url = new URL(`${apiBase}/chesscom/report/stream`);
  console.log('[rapport] runAnalysis URL:', url.toString());
  url.searchParams.set('username', params.username);
  url.searchParams.set('color', params.color);
  url.searchParams.set('timeClass', params.timeClass);
  if (params.dateFrom) url.searchParams.set('dateFrom', params.dateFrom);
  if (params.dateTo) url.searchParams.set('dateTo', params.dateTo);
  if (params.eloMin > 0) url.searchParams.set('eloMin', params.eloMin);
  if (params.eloMax < 3000) url.searchParams.set('eloMax', params.eloMax);
  if (params.startFen) url.searchParams.set('startFen', params.startFen);

  console.log('[rapport] fetch start');
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'text/event-stream' },
    signal,
  });
  console.log('[rapport] fetch done, status:', res.status, 'ok:', res.ok);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `Erreur ${res.status}` }));
    throw new Error(err.error || `Erreur serveur ${res.status}`);
  }

  console.log('[rapport] body reader start, type:', typeof res.body);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const raw = line.slice(6);
        console.log('[rapport] sse event:', raw.substring(0, 150));
        const data = JSON.parse(raw);
        if (data.type === 'archive' || data.type === 'phase') {
          onProgress(data);
        } else if (data.type === 'complete') {
          return data.data;
        } else if (data.type === 'error') {
          throw new Error(data.error);
        }
      }
    }
  }
  throw new Error('Connexion interrompue');
}

// ── Mise à jour de l'estimation (date uniquement) ────────────────────────────
function updateEstimateLabel() {
  const dfYear = document.getElementById('rapport-datefrom-year').value;
  const dfMonth = document.getElementById('rapport-datefrom-month').value;
  const dtYear = document.getElementById('rapport-dateto-year').value;
  const dtMonth = document.getElementById('rapport-dateto-month').value;
  const dateFrom = (dfYear && dfMonth) ? `${dfYear}-${dfMonth}` : '';
  const dateTo = (dtYear && dtMonth) ? `${dtYear}-${dtMonth}` : '';
  const estSec = estimateDuration(dateFrom, dateTo);

  const label = document.getElementById('form-estimate-label');
  if (label) {
    label.textContent = `~${estSec}s estimés`;
  }
}

// ── Initialisation des menus d'années (dynamique) ────────────────────────────
function initYearSelects() {
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = String(now.getMonth() + 1).padStart(2, '0');
  const minYear = 2010;

  function populateYears(selectEl, selectedYear) {
    selectEl.innerHTML = '<option value="">Année</option>';
    for (let y = curYear; y >= minYear; y--) {
      const opt = document.createElement('option');
      opt.value = String(y);
      opt.textContent = String(y);
      if (y === selectedYear) opt.selected = true;
      selectEl.appendChild(opt);
    }
  }

  const fromYear = document.getElementById('rapport-datefrom-year');
  const toYear = document.getElementById('rapport-dateto-year');
  const toMonth = document.getElementById('rapport-dateto-month');
  if (fromYear) populateYears(fromYear, null);
  if (toYear) populateYears(toYear, curYear);
  if (toMonth) toMonth.value = curMonth;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initYearSelects();
  initPositionEditor();
  showView('view-form');

  ['rapport-datefrom-year', 'rapport-datefrom-month', 'rapport-dateto-year', 'rapport-dateto-month'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updateEstimateLabel);
  });

  updateEstimateLabel();

  document.getElementById('btn-rapport-run')?.addEventListener('click', async () => {
    const params = getFormParams();
    const errEl = document.getElementById('rapport-error');
    if (!params.username) {
      if (errEl) {
        errEl.textContent = 'Veuillez entrer un pseudo Chess.com.';
        errEl.style.display = 'block';
      }
      return;
    }
    if (params.startFen && !parseFen(params.startFen)) {
      if (errEl) {
        errEl.textContent = 'La position fournie n’est pas une FEN valide.';
        errEl.style.display = 'block';
      }
      return;
    }
    if (errEl) errEl.style.display = 'none';

    const fillReset = document.getElementById('loading-bar-fill');
    if (fillReset) {
      fillReset.style.transition = 'none';
      fillReset.style.width = '0%';
      fillReset.style.background = '';
    }
    showView('view-loading');
    updateLoadingProgress(0, 'Connexion au serveur…');

    const loadUser = document.getElementById('loading-username');
    if (loadUser) loadUser.textContent = `${params.username} · ${params.color === 'white' ? 'Blancs' : 'Noirs'}`;

    currentAbortController = new AbortController();

    try {
      const data = await runAnalysis(params, (evt) => {
        if (evt.type === 'archive') {
          const pct = Math.round((evt.current / evt.total) * 85);
          updateLoadingProgress(pct, `Mois ${evt.current}/${evt.total} : ${evt.gamesInArchive} partie${evt.gamesInArchive > 1 ? 's' : ''}`);
        } else if (evt.type === 'phase') {
          if (evt.phase === 'position-map') {
            updateLoadingProgress(85, `Construction de l'arbre des positions… (${evt.positions} positions)`);
          } else if (evt.phase === 'scoring') {
            const pct = 85 + Math.round((evt.depth / evt.maxDepth) * 13);
            updateLoadingProgress(pct, `Analyse des variantes… profondeur ${evt.depth}/${evt.maxDepth}`);
          } else if (evt.phase === 'complete') {
            updateLoadingProgress(98, 'Génération du rapport…');
          }
        }
      }, currentAbortController.signal);

      console.log('[rapport] data received, items:', data.items?.length);
      console.log('[rapport] loading openings...');
      await ensureOpeningsLoaded();
      console.log('[rapport] openings loaded, updating bar to 100%');
      updateLoadingProgress(100, 'Terminé ✓');
      const fill = document.getElementById('loading-bar-fill');
      if (fill) fill.style.background = 'linear-gradient(90deg, #22c55e, #4ade80)';
      await new Promise(resolve => setTimeout(resolve, 400));
      console.log('[rapport] switching to results view');
      showView('view-results-wrap');
      console.log('[rapport] calling renderReport');
      renderReport(data, params);
      console.log('[rapport] renderReport done');
    } catch (err) {
      console.log('[rapport] catch error:', err.name, err.message);
      if (err.name === 'AbortError') return;
      showView('view-form');
      if (errEl) {
        errEl.textContent = `Erreur : ${err.message}`;
        errEl.style.display = 'block';
      }
    }
  });

  document.getElementById('btn-loading-cancel')?.addEventListener('click', () => {
    if (currentAbortController) currentAbortController.abort();
    showView('view-form');
  });

  document.getElementById('btn-new-analysis')?.addEventListener('click', () => {
    showView('view-form');
  });
});
