// ── Échiquier mini partagé ────────────────────────────────────────────────────
// Utilisé par ui.js (modale de survie) et rapport.js (cartes de résultats).
// Aucune dépendance sur state ou Chess.js.

const WIKI_PIECES = {
  'wp': '4/45/Chess_plt45.svg', 'wr': '7/72/Chess_rlt45.svg',
  'wn': '7/70/Chess_nlt45.svg', 'wb': 'b/b1/Chess_blt45.svg',
  'wq': '1/15/Chess_qlt45.svg', 'wk': '4/42/Chess_klt45.svg',
  'bp': 'c/c7/Chess_pdt45.svg', 'br': 'f/ff/Chess_rdt45.svg',
  'bn': 'e/ef/Chess_ndt45.svg', 'bb': '9/98/Chess_bdt45.svg',
  'bq': '4/47/Chess_qdt45.svg', 'bk': 'f/f0/Chess_kdt45.svg',
};

/**
 * Génère le HTML d'un échiquier mini (style tooltip) à partir d'un FEN brut.
 * Utilise les SVG Wikipédia + styles inline — aucune dépendance Chess.js.
 * @param {string} fen            FEN (3 ou 6 champs)
 * @param {string} uci            Coup UCI à surligner (ex: "e2e4"), ou ''
 * @param {{ lightSquare?: string, darkSquare?: string, flipped?: boolean }} options
 */
export function generateMiniboardHtml(fen, uci, {
  lightSquare = '#ebecd0',
  darkSquare  = '#779556',
  flipped     = false,
} = {}) {
  const fenPart = (fen || '').split(' ')[0];
  const rows = fenPart.split('/');
  if (rows.length !== 8) return '';

  const board = [];
  for (const row of rows) {
    const line = [];
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let k = 0; k < Number(ch); k++) line.push(null);
      } else {
        line.push({ color: ch === ch.toUpperCase() ? 'w' : 'b', type: ch.toLowerCase() });
      }
    }
    board.push(line);
  }
  if (board.length !== 8) return '';

  const from = uci ? uci.slice(0, 2) : '';
  const to   = uci ? uci.slice(2, 4) : '';

  let html = '<div style="display:grid;grid-template-columns:repeat(8,24px);grid-template-rows:repeat(8,24px);gap:0;background:#000;padding:1px;margin:4px 0;overflow:hidden;width:194px;height:194px;">';

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const row = flipped ? 7 - r : r;
      const col = flipped ? 7 - c : c;
      const isLight = (row + col) % 2 === 0;
      const bg = isLight ? lightSquare : darkSquare;
      const piece = board[row] && board[row][col];
      const sq = String.fromCharCode(97 + col) + (8 - row);
      const hl = (sq === from || sq === to) ? 'box-shadow:inset 0 0 0 2px #ffd700;' : '';
      const icon = piece ? WIKI_PIECES[piece.color + piece.type] : null;
      const pieceHtml = icon ? `<img src="https://upload.wikimedia.org/wikipedia/commons/${icon}" style="width:22px;height:22px;">` : '';
      html += `<div style="width:24px;height:24px;background:${bg};display:flex;align-items:center;justify-content:center;${hl}">${pieceHtml}</div>`;
    }
  }
  html += '</div>';
  return html;
}

const MINI_PIECE_MAP = {
  p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚',
  P: '♙', R: '♖', N: '♘', B: '♗', Q: '♕', K: '♔',
};

function squareName(idx) {
  return String.fromCharCode(97 + (idx % 8)) + String(8 - Math.floor(idx / 8));
}

/**
 * Génère le HTML d'un échiquier mini à partir d'un FEN (3 ou 6 champs).
 * @param {string} fen
 * @param {{ flipped?: boolean, highlightUci?: string }} options
 */
export function renderMiniBoardFromFen(fen, { flipped = false, highlightUci = '' } = {}) {
  const rows = (fen?.split(' ')[0] || '').split('/');
  if (rows.length !== 8) return '';

  const squares = [];
  for (const row of rows) {
    for (const ch of row) {
      if (/\d/.test(ch)) {
        const n = Number(ch);
        for (let k = 0; k < n; k++) squares.push('');
      } else {
        squares.push(MINI_PIECE_MAP[ch] || '');
      }
    }
  }
  if (squares.length !== 64) return '';

  const from = highlightUci ? highlightUci.slice(0, 2) : '';
  const to   = highlightUci ? highlightUci.slice(2, 4) : '';

  return `<div class="survival-mini-board">${squares.map((piece, idx) => {
    const realIdx = flipped ? 63 - idx : idx;
    const rank = Math.floor(realIdx / 8);
    const file = realIdx % 8;
    const dark = (rank + file) % 2 === 1;
    const hl = (from && (squareName(realIdx) === from || squareName(realIdx) === to)) ? ' is-highlight' : '';
    return `<div class="survival-mini-square ${dark ? 'is-dark' : 'is-light'}${hl}">${piece}</div>`;
  }).join('')}</div>`;
}
