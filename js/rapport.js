import { generateMiniboardHtml } from './boardUtils.js';

// ══════════════════════════════════════════════════════════════════════════════
//  rapport.js — Analyse de performances / Rapport de priorités d'entraînement
// ══════════════════════════════════════════════════════════════════════════════

// ── API base URL (même logique que stats.js) ──────────────────────────────────
function buildApiBase() {
  const configured = (window.ALPHA_CHESS_API_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  return 'http://localhost:4000/api';
}

// ── Table ECO (prefix matching, du plus long au plus court) ──────────────────
const ECO_TABLE = [
  // Ouvertures italiennes / Ruy Lopez
  { s: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O',   n: 'Ruy Lopez — Variante Ouverte' },
  { s: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6',        n: 'Ruy Lopez — Variante Morphy' },
  { s: 'e4 e5 Nf3 Nc6 Bb5 a6',                n: 'Ruy Lopez — Défense Morphy' },
  { s: 'e4 e5 Nf3 Nc6 Bb5 Nf6',              n: 'Ruy Lopez — Variante Berlin' },
  { s: 'e4 e5 Nf3 Nc6 Bb5',                  n: 'Ruy Lopez' },
  { s: 'e4 e5 Nf3 Nc6 Bc4 Bc5',             n: 'Partie Italienne — Giuoco Piano' },
  { s: 'e4 e5 Nf3 Nc6 Bc4 Nf6',             n: 'Partie Italienne — Deux Cavaliers' },
  { s: 'e4 e5 Nf3 Nc6 Bc4',                 n: 'Partie Italienne' },
  { s: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4',       n: 'Partie Écossaise' },
  { s: 'e4 e5 Nf3 Nc6 d4',                  n: 'Partie Écossaise' },
  { s: 'e4 e5 Nf3 Nf6',                     n: 'Défense Petroff' },
  { s: 'e4 e5 Nf3 f5',                      n: 'Contre-Gambit Lettish' },
  { s: 'e4 e5 Nf3 d6',                      n: 'Défense Philidor' },
  { s: 'e4 e5 f4 exf4',                     n: 'Gambit du Roi accepté' },
  { s: 'e4 e5 f4 Bc5',                      n: 'Gambit du Roi — Défense classique' },
  { s: 'e4 e5 f4',                           n: 'Gambit du Roi' },
  { s: 'e4 e5 Nc3 Nc6 f4',                  n: 'Partie des Quatre Cavaliers — Gambit' },
  { s: 'e4 e5 Nc3 Nf6 f4',                  n: 'Partie des Trois Cavaliers' },
  { s: 'e4 e5 Nc3 Nc6',                     n: 'Partie des Quatre Cavaliers' },
  // Sicilienne
  { s: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6', n: 'Sicilienne — Najdorf' },
  { s: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6', n: 'Sicilienne — Scheveningen' },
  { s: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6', n: 'Sicilienne — Dragon' },
  { s: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 d6', n: 'Sicilienne — Classique' },
  { s: 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6',     n: 'Sicilienne — Kan / Taimanov' },
  { s: 'e4 c5 Nf3 e6 d4 cxd4 Nxd4',         n: 'Sicilienne — Kan' },
  { s: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4',         n: 'Sicilienne — Ouverte' },
  { s: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4',        n: 'Sicilienne — Ouverte (4.Nxd4)' },
  { s: 'e4 c5 c3',                           n: 'Sicilienne — Alapin' },
  { s: 'e4 c5 Nc3',                          n: 'Sicilienne — Grand Prix Attack' },
  { s: 'e4 c5 f4',                           n: 'Sicilienne — McDonnell Attack' },
  { s: 'e4 c5',                              n: 'Défense Sicilienne' },
  // Française
  { s: 'e4 e6 d4 d5 Nc3 Bb4',              n: 'Défense Française — Winawer' },
  { s: 'e4 e6 d4 d5 Nc3 Nf6',             n: 'Défense Française — Classique' },
  { s: 'e4 e6 d4 d5 e5',                  n: 'Défense Française — Advance' },
  { s: 'e4 e6 d4 d5 exd5',               n: 'Défense Française — Échange' },
  { s: 'e4 e6 d4 d5',                    n: 'Défense Française' },
  { s: 'e4 e6',                           n: 'Défense Française' },
  // Caro-Kann
  { s: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5', n: 'Caro-Kann — Classique' },
  { s: 'e4 c6 d4 d5 e5',                n: 'Caro-Kann — Advance' },
  { s: 'e4 c6 d4 d5 exd5',             n: 'Caro-Kann — Échange' },
  { s: 'e4 c6 d4 d5',                  n: 'Caro-Kann' },
  { s: 'e4 c6',                         n: 'Défense Caro-Kann' },
  // Pirc / Moderne
  { s: 'e4 d6 d4 Nf6 Nc3 g6',           n: 'Défense Pirc — Classique' },
  { s: 'e4 d6 d4 Nf6 Nc3',              n: 'Défense Pirc' },
  { s: 'e4 g6',                          n: 'Défense Moderne' },
  // Scandinave
  { s: 'e4 d5 exd5 Qxd5 Nc3 Qa5',      n: 'Scandinave — Classique' },
  { s: 'e4 d5 exd5 Nf6',               n: 'Scandinave — Islandais' },
  { s: 'e4 d5',                          n: 'Défense Scandinave' },
  // Ouvertures du pion dame
  { s: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6',   n: 'Défense Est-Indienne — Sämisch' },
  { s: 'd4 Nf6 c4 g6 Nc3 Bg7 e4',      n: 'Défense Est-Indienne' },
  { s: 'd4 Nf6 c4 g6 Nc3 d5',          n: 'Grünfeld — Classique' },
  { s: 'd4 Nf6 c4 g6 Nc3',             n: 'Grünfeld / Est-Indienne' },
  { s: 'd4 Nf6 c4 e6 Nc3 Bb4',        n: 'Défense Nimzo-Indienne' },
  { s: 'd4 Nf6 c4 e6 Nc3 d5',         n: 'Gambit Dame — Orthodoxe' },
  { s: 'd4 Nf6 c4 e6 Nf3 b6',         n: 'Défense Reine-Indienne' },
  { s: 'd4 Nf6 c4 c5',                n: 'Défense Benko / Volga' },
  { s: 'd4 d5 c4 e6 Nc3 Nf6 Bg5',     n: 'Gambit Dame — Tartakover' },
  { s: 'd4 d5 c4 e6 Nc3 Nf6 Nf3',     n: 'Gambit Dame' },
  { s: 'd4 d5 c4 e6 Nc3 Nf6',         n: 'Gambit Dame' },
  { s: 'd4 d5 c4 dxc4',               n: 'Gambit Dame accepté' },
  { s: 'd4 d5 c4 c6 Nf3 Nf6',        n: 'Défense Slave' },
  { s: 'd4 d5 c4 c6',                n: 'Défense Slave' },
  { s: 'd4 d5 c4',                   n: 'Gambit Dame' },
  { s: 'd4 d5',                      n: 'Gambit Dame (préliminaire)' },
  { s: 'd4 e6 c4 Nf6',              n: 'Indien du Roi' },
  { s: 'd4 f5 c4 Nf6 g3',           n: 'Défense Néerlandaise — Leningrad' },
  { s: 'd4 f5',                      n: 'Défense Néerlandaise' },
  // Ouvertures anglaise / Réti / Flank
  { s: 'c4 e5 Nc3 Nf6 Nf3',        n: 'Anglaise — Variante symétrique' },
  { s: 'c4 c5 Nf3 Nf6 d4',         n: 'Anglaise — Accélérée' },
  { s: 'c4 e5',                     n: 'Ouverture Anglaise' },
  { s: 'c4 Nf6 Nc3 d5 cxd5',       n: 'Anglaise — Réti' },
  { s: 'c4',                        n: 'Ouverture Anglaise' },
  { s: 'Nf3 d5 c4',                n: 'Réti — Gambit Dame inversé' },
  { s: 'Nf3 Nf6 g3 d5',           n: 'Système Réti' },
  { s: 'Nf3 Nf6 g3',              n: 'Système Réti' },
  { s: 'Nf3',                      n: 'Ouverture Réti' },
  { s: 'g3',                       n: 'Fianchetto du Roi' },
  { s: 'f4',                       n: 'Attaque Bird' },
  { s: 'b3',                       n: 'Ouverture Nimzovitch-Larsen' },
  { s: 'b4',                       n: 'Gambit Sokolsky (Orang-outan)' },
  { s: 'd4 Nf6',                   n: 'Indien du Roi (prél.)' },
  { s: 'd4',                       n: 'Ouverture pion dame' },
  { s: 'e4',                       n: 'Ouverture pion roi' },
];

// Trier du plus long au plus court pour le matching greedy
ECO_TABLE.sort((a, b) => b.s.length - a.s.length);

function pathToString(path) {
  return path.join(' ');
}

function lookupEco(path) {
  const str = pathToString(path);
  for (const entry of ECO_TABLE) {
    if (str.startsWith(entry.s) || str === entry.s) return entry.n;
  }
  return null;
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

  // 2. Table ECO
  const eco = lookupEco(fullPath);
  if (eco) return eco;

  // 3. Fallback: nom du parent + derniers coups
  const parentEco = lookupEco(item.contextPath);
  if (parentEco && item.playerMove) {
    return `${parentEco} : ${item.playerMove}`;
  }

  // 4. Dernier recours: premiers coups
  if (fullPath.length > 0) return `1.${fullPath[0]}…`;
  return 'Position initiale';
}

// ── Notation PGN d'un chemin de coups ────────────────────────────────────────
function pathToPgn(path, highlightLast = false) {
  let html = '';
  for (let i = 0; i < path.length; i++) {
    if (i % 2 === 0) html += `<span class="pgn-movenum">${Math.floor(i / 2) + 1}.</span>`;
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

// ── Estimation de durée en fonction des paramètres ───────────────────────────
function estimateDuration(dateFrom, dateTo, maxDepth) {
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
  const base = 20;
  const perMonth = 3;
  const perDepth = maxDepth > 8 ? (maxDepth - 8) * 3 : 0;
  return Math.min(120, Math.round(base + months * perMonth + perDepth));
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

function renderFenBoardHtml(fen, { highlightUci = '', flipped = false } = {}) {
  return generateMiniboardHtml(fen, highlightUci, { flipped });
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

// ── Rendu du rapport ──────────────────────────────────────────────────────────
function renderReport(data, params) {
  const repertoires = loadRepertoires();
  const { totalGames, parsedGames: parsedCount, filteredGames, baselineScore, items, truncated, notEnoughData } = data;
  const analyzed = parsedCount !== undefined ? parsedCount : totalGames;
  const positiveItems = items.filter(i => i.gap > 0.01).sort(compareReportItems);
  const bestItems     = items.filter(i => i.gap < -0.01).sort((a, b) => a.gap - b.gap).slice(0, 30);
  const totalAvoidable = positiveItems.reduce((sum, item) => sum + item.lossesAvoided, 0);
  const topItems = positiveItems.slice(0, 30);

  const titleSub = document.getElementById('results-title-sub');
  if (titleSub) titleSub.textContent = summarizeParams(params, data);

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
    ${truncated ? `<p class="report-warning">⚠️ Analyse limitée (${totalGames} parties max). Réduisez la période pour plus de précision.</p>` : ''}
    ${notEnoughData ? `<p class="report-warning report-warning--info">ℹ️ Moins de 10 lignes significatives trouvées (${positiveItems.length} résultat${positiveItems.length !== 1 ? 's' : ''}). Réduisez la profondeur d'analyse dans les filtres pour voir davantage de priorités.</p>` : ''}
  `;

  if (data.positionFiltered && filteredGames > totalGames) {
    html += `<div class="report-scope-note">${totalGames} parties atteignent la position sélectionnée sur ${filteredGames} parties correspondant aux autres filtres.</div>`;
  }

  if (!topItems.length) {
    html += `<div class="report-empty">
      <div style="font-size:2.5rem;margin-bottom:12px;">🎉</div>
      <div style="font-size:1.1rem;font-weight:700;margin-bottom:8px;">Aucun point faible détecté à cette profondeur.</div>
      <div style="color:var(--text-muted);font-size:0.9rem;">Soit vos résultats sont homogènes sur cette couche d'analyse, soit l'échantillon qui atteint cette position est trop petit.</div>
    </div>`;
    document.getElementById('view-results').innerHTML = html;
    return;
  }

  html += `<div class="report-tabs">
    <button class="report-tab-btn report-tab-btn--active" data-tab="priorities">Priorités d'entraînement</button>
    <button class="report-tab-btn" data-tab="strengths">Meilleures performances</button>
  </div>
  <div id="tab-priorities" class="report-tab-content">`;

  topItems.forEach((item, idx) => {
    const name = getOpeningName(item, repertoires);
    const badge = priorityBadge(item);
    const fullPath = [...item.contextPath, item.playerMove];
    const pgnHtml = pathToPgn(fullPath, true) || 'Position sélectionnée';
    const linePct = (item.score * 100).toFixed(0);
    const basePct = (baselineScore * 100).toFixed(0);
    const gapPct  = (item.gap * 100).toFixed(0);
    const gainMiss = Math.round(item.lossesAvoided * 16);
    const confidenceLabel = item.total >= 100 ? 'Très fiable' : item.total >= 30 ? 'Fiable' : item.total >= 10 ? 'Échantillon moyen' : 'Peu de données';

    html += `
      <div class="report-item ${badge.itemClass}">
        <div class="report-item-layout">
          <div>
            <div class="report-item-header">
              <div class="report-item-rank">#${idx + 1}</div>
              <span class="priority-badge ${badge.badgeClass}">${badge.label}</span>
              <div class="report-item-name">${name}</div>
              <div class="report-item-meta">${item.total} parties · coup ${item.moveNumber || Math.floor((item.depth || 0) / 2) + 1}</div>
            </div>

            <div class="report-item-line">${pgnHtml}</div>

            <div class="report-item-stats">
              <div class="stat-block">
                <div class="stat-block-val ${parseInt(linePct, 10) < parseInt(basePct, 10) ? 'stat-bad' : ''}">${linePct}%</div>
                <div class="stat-block-lbl">${renderMetricLabel('Score ligne', METRIC_HELP.lineScore)}</div>
              </div>
              <div class="stat-block stat-block--gap">
                <div class="stat-block-val stat-bad">−${gapPct}%</div>
                <div class="stat-block-lbl">${renderMetricLabel('Écart', METRIC_HELP.gap)}</div>
              </div>
              <div class="stat-block stat-block--loss">
                <div class="stat-block-val stat-bad">${gainMiss} pts elo</div>
                <div class="stat-block-lbl">${renderMetricLabel('Gain manqué', METRIC_HELP.avoidable)}</div>
              </div>
            </div>

            ${wdlBar(item.wins, item.draws, item.losses)}

            <div class="report-item-footer">
              ${confidenceDots(item.total)}
              <span class="conf-label">${confidenceLabel}</span>
              <div class="report-item-actions">
                <button class="report-btn report-btn--primary" data-fen="${encodeURIComponent(item.fenBefore)}" data-action="open-app">
                  Explorer
                </button>
              </div>
            </div>
          </div>
          <div class="report-item-board">
            ${renderFenBoardHtml(item.fenBefore, { highlightUci: item.playerUci, flipped: params.color === 'black' })}
          </div>
        </div>
      </div>`;
  });

  html += `</div>
  <div id="tab-strengths" class="report-tab-content" style="display:none">`;
    if (bestItems.length === 0) {
      html += `<div class="report-empty"><div style="font-size:2rem;margin-bottom:8px;">🏆</div><div style="font-size:1rem;font-weight:600;">Pas encore assez de données pour identifier vos meilleures lignes.</div><pre style='font-size:0.8rem;color:#aaa;background:#222;padding:8px;border-radius:6px;margin-top:10px;'>DEBUG: bestItems.length=${bestItems.length}\n${JSON.stringify(bestItems,null,2)}</pre></div>`;
    } else {
    bestItems.forEach((item, idx) => {
      const name = getOpeningName(item, repertoires);
      const fullPath = [...item.contextPath, item.playerMove];
      const pgnHtml = pathToPgn(fullPath, true) || 'Position sélectionnée';
      const linePct = (item.score * 100).toFixed(0);
      const basePct = (baselineScore * 100).toFixed(0);
      const gainBonus = Math.round(Math.abs(item.lossesAvoided) * 16);
      const overPct  = (Math.abs(item.gap) * 100).toFixed(0);
      const confidenceLabel = item.total >= 100 ? 'Très fiable' : item.total >= 30 ? 'Fiable' : item.total >= 10 ? 'Échantillon moyen' : 'Peu de données';

      html += `
        <div class="report-item report-item--good">
          <div class="report-item-layout">
            <div>
              <div class="report-item-header">
                <div class="report-item-rank">#${idx + 1}</div>
                <span class="priority-badge badge-good">FORT</span>
                <div class="report-item-name">${name}</div>
                <div class="report-item-meta">${item.total} parties · coup ${item.moveNumber || Math.floor((item.depth || 0) / 2) + 1}</div>
              </div>

              <div class="report-item-line">${pgnHtml}</div>

              <div class="report-item-stats">
                <div class="stat-block">
                  <div class="stat-block-val stat-good">${linePct}%</div>
                  <div class="stat-block-lbl">${renderMetricLabel('Score ligne', METRIC_HELP.lineScore)}</div>
                </div>
                <div class="stat-block stat-block--gap">
                  <div class="stat-block-val stat-good">+${overPct}%</div>
                  <div class="stat-block-lbl">${renderMetricLabel('Avance', METRIC_HELP.gap)}</div>
                </div>
                <div class="stat-block stat-block--loss">
                  <div class="stat-block-val stat-good">+${gainBonus} pts elo</div>
                  <div class="stat-block-lbl">Bonus Elo</div>
                </div>
              </div>

              ${wdlBar(item.wins, item.draws, item.losses)}

              <div class="report-item-footer">
                ${confidenceDots(item.total)}
                <span class="conf-label">${confidenceLabel}</span>
                <div class="report-item-actions">
                  <button class="report-btn report-btn--primary" data-fen="${encodeURIComponent(item.fenBefore)}" data-action="open-app">
                    Explorer
                  </button>
                </div>
              </div>
            </div>
            <div class="report-item-board">
              ${renderFenBoardHtml(item.fenBefore, { highlightUci: item.playerUci, flipped: params.color === 'black' })}
            </div>
          </div>
        </div>`;
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
}

// ── Barre de chargement simulée ───────────────────────────────────────────────
let _progressTimer = null;

function startProgress(estimatedSeconds) {
  const bar = document.getElementById('loading-bar-fill');
  const label = document.getElementById('loading-step-label');
  const estEl = document.getElementById('loading-estimate');
  if (!bar) return;

  bar.style.width = '0%';
  const steps = [
    { pct: 18, label: 'Récupération des archives Chess.com…', delay: 1200 },
    { pct: 40, label: 'Chargement des parties…', delay: Math.min(estimatedSeconds * 300, 18000) },
    { pct: 65, label: 'Analyse des ouvertures…', delay: Math.min(estimatedSeconds * 400, 25000) },
    { pct: 82, label: 'Calcul des priorités…', delay: Math.min(estimatedSeconds * 250, 15000) },
    { pct: 92, label: 'Génération du rapport…', delay: 2000 },
  ];

  let idx = 0;
  if (estEl) estEl.textContent = `Estimation : ~${estimatedSeconds}s`;

  function next() {
    if (idx >= steps.length) return;
    const step = steps[idx++];
    bar.style.width = step.pct + '%';
    if (label) label.textContent = step.label;
    _progressTimer = setTimeout(next, step.delay);
  }

  next();
}

function stopProgress(success) {
  if (_progressTimer) {
    clearTimeout(_progressTimer);
    _progressTimer = null;
  }
  const bar = document.getElementById('loading-bar-fill');
  if (bar) {
    bar.style.width = '100%';
    bar.style.background = success
      ? 'linear-gradient(90deg, #22c55e, #4ade80)'
      : 'linear-gradient(90deg, #ef4444, #f87171)';
  }
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
  const maxDepth = parseInt(document.getElementById('rapport-depth').value, 10) || 10;
  const dateFrom = (dfYear && dfMonth) ? `${dfYear}/${dfMonth}` : '';
  const dateTo = (dtYear && dtMonth) ? `${dtYear}/${dtMonth}` : '';
  const startFen = document.getElementById('rapport-position-enabled')?.checked
    ? document.getElementById('rapport-position-fen-input')?.value.trim() || ''
    : '';

  return { username, color, timeClass, dateFrom, dateTo, eloMin, eloMax, maxDepth, startFen };
}

// ── Fetch du rapport ──────────────────────────────────────────────────────────
async function runAnalysis(params) {
  const apiBase = buildApiBase();
  const url = new URL(`${apiBase}/chesscom/report`);
  url.searchParams.set('username', params.username);
  url.searchParams.set('color', params.color);
  url.searchParams.set('timeClass', params.timeClass);
  if (params.dateFrom) url.searchParams.set('dateFrom', params.dateFrom);
  if (params.dateTo) url.searchParams.set('dateTo', params.dateTo);
  if (params.eloMin > 0) url.searchParams.set('eloMin', params.eloMin);
  if (params.eloMax < 3000) url.searchParams.set('eloMax', params.eloMax);
  url.searchParams.set('maxDepth', params.maxDepth);
  if (params.startFen) url.searchParams.set('startFen', params.startFen);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(180000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `Erreur ${res.status}` }));
    throw new Error(err.error || `Erreur serveur ${res.status}`);
  }

  return res.json();
}

// ── Mise à jour de l'estimation dans le formulaire ───────────────────────────
function updateEstimateLabel() {
  const dfYear = document.getElementById('rapport-datefrom-year').value;
  const dfMonth = document.getElementById('rapport-datefrom-month').value;
  const dtYear = document.getElementById('rapport-dateto-year').value;
  const dtMonth = document.getElementById('rapport-dateto-month').value;
  const depth = parseInt(document.getElementById('rapport-depth').value, 10) || 10;
  const dateFrom = (dfYear && dfMonth) ? `${dfYear}-${dfMonth}` : '';
  const dateTo = (dtYear && dtMonth) ? `${dtYear}-${dtMonth}` : '';
  const estSec = estimateDuration(dateFrom, dateTo, depth);

  const label = document.getElementById('form-estimate-label');
  if (label) {
    let depthLabel;
    if (depth <= 6) depthLabel = 'Aperçu';
    else if (depth <= 8) depthLabel = 'Standard';
    else if (depth <= 10) depthLabel = 'Approfondi';
    else depthLabel = 'Exhaustif';
    label.textContent = `${depthLabel} · ~${estSec}s estimés`;
  }

  const depthVal = document.getElementById('rapport-depth-val');
  if (depthVal) depthVal.textContent = `${depth} demi-coups (${Math.ceil(depth / 2)} coups)`;
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

  const depthSlider = document.getElementById('rapport-depth');
  if (depthSlider) depthSlider.addEventListener('input', updateEstimateLabel);

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

    const dfYear = document.getElementById('rapport-datefrom-year').value;
    const dfMonth = document.getElementById('rapport-datefrom-month').value;
    const dtYear = document.getElementById('rapport-dateto-year').value;
    const dtMonth = document.getElementById('rapport-dateto-month').value;
    const dateFrom = (dfYear && dfMonth) ? `${dfYear}-${dfMonth}` : '';
    const dateTo = (dtYear && dtMonth) ? `${dtYear}-${dtMonth}` : '';
    const estSec = estimateDuration(dateFrom, dateTo, params.maxDepth);

    showView('view-loading');
    startProgress(estSec);

    const loadUser = document.getElementById('loading-username');
    if (loadUser) loadUser.textContent = `${params.username} · ${params.color === 'white' ? 'Blancs' : 'Noirs'}`;

    try {
      const data = await runAnalysis(params);
      stopProgress(true);
      await new Promise(resolve => setTimeout(resolve, 400));
      showView('view-results-wrap');
      renderReport(data, params);
    } catch (err) {
      stopProgress(false);
      await new Promise(resolve => setTimeout(resolve, 300));
      showView('view-form');
      if (errEl) {
        errEl.textContent = `Erreur : ${err.message}`;
        errEl.style.display = 'block';
      }
    }
  });

  document.getElementById('btn-loading-cancel')?.addEventListener('click', () => {
    if (_progressTimer) {
      clearTimeout(_progressTimer);
      _progressTimer = null;
    }
    showView('view-form');
  });

  document.getElementById('btn-new-analysis')?.addEventListener('click', () => {
    showView('view-form');
  });
});
