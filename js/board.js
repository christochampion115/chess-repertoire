import { state } from './state.js';
import { attachDragToPiece } from './drag.js';

/** Mappe une annotation sur sa couleur et un symbole unicode lisible */
export const ANNOTATION_STYLE = {
  '!!': { color: '#00d4b4', label: '!!' },   // turquoise
  '!':  { color: '#5b8fc9', label: '!' },    // bleu foncé pâle
  '*':  { color: '#4ade80', label: '★' },    // vert
  '!?': { color: '#facc15', label: '!?' },   // jaune
  '?':  { color: '#f97316', label: '?' },    // orange
  '??': { color: '#ef4444', label: '??' },   // rouge
};

export function getPieceIcon(piece) {
  const map = {
    'wp': '4/45/Chess_plt45.svg',
    'wr': '7/72/Chess_rlt45.svg',
    'wn': '7/70/Chess_nlt45.svg',
    'wb': 'b/b1/Chess_blt45.svg',
    'wq': '1/15/Chess_qlt45.svg',
    'wk': '4/42/Chess_klt45.svg',
    'bp': 'c/c7/Chess_pdt45.svg',
    'br': 'f/ff/Chess_rdt45.svg',
    'bn': 'e/ef/Chess_ndt45.svg',
    'bb': '9/98/Chess_bdt45.svg',
    'bq': '4/47/Chess_qdt45.svg',
    'bk': 'f/f0/Chess_kdt45.svg'
  };
  return map[piece.color + piece.type];
}

export function renderBoard(onSquareClick) {
  const { boardEl, chess, selectedSq, boardFlipped } = state;
  if (!boardEl) return;

  boardEl.innerHTML = '';
  const board = chess.board();
  const boardFragment = document.createDocumentFragment();

  // Reconstituer le dernier coup depuis l'arbre (chess.load() vide l'historique,
  // chess.history() est donc toujours vide — on rejoue le coup sur le parent).
  let lastFrom = null, lastTo = null;
  const cn = state.currentNode;
  if (cn && cn.parent && cn.san) {
    const tmp = new Chess(cn.parent.fen);
    const m = tmp.move(cn.san);
    if (m) { lastFrom = m.from; lastTo = m.to; }
  }

  // Annotation du coup courant (hors mode entraînement) → badge + surbrillance colorée
  const annotation = (!state.trainingActive && state.currentNode?.annotation) || '';
  const annotStyle = ANNOTATION_STYLE[annotation] || null;

  // Pré-calculer les cases accessibles depuis la pièce sélectionnée
  const legalTargets = new Set();
  if (selectedSq) {
    chess.moves({ square: selectedSq, verbose: true }).forEach(m => legalTargets.add(m.to));
  }

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const row = boardFlipped ? 7 - r : r;
      const col = boardFlipped ? 7 - c : c;
      const sq = String.fromCharCode(97 + col) + (8 - row);
      const div = document.createElement('div');
     const isLight = (r + c) % 2 === 0;
div.className = "square";
div.dataset.sq = sq;
div.style.backgroundColor = isLight ? state.boardTheme.light : state.boardTheme.dark;

      const isLastMove = (sq === lastFrom || sq === lastTo);
      if (selectedSq === sq || isLastMove) {
        div.classList.add('highlight');
        // Si annotation active, teinter le highlight vers la couleur de l'annotation
        if (annotStyle && isLastMove) {
          div.style.setProperty('--sq-highlight', hexToRgba(annotStyle.color, 0.38));
        }
      }

      // Feedback entraînement : vert (correct) ou rouge (incorrect)
      if (state.trainingFeedback) {
        const { type, from, to } = state.trainingFeedback;
        if (sq === from || sq === to) {
          if (type === 'correct') {
            div.classList.add('sq-correct');
          } else if (type === 'retry') {
            div.classList.add('sq-retry');
          } else {
            div.classList.add('sq-wrong');
          }
        }
      }

      div.onclick = () => onSquareClick(sq);
      const piece = board[row][col];
      if (piece) {
        const img = document.createElement('img');
        img.className = 'piece';
        img.src = `https://upload.wikimedia.org/wikipedia/commons/${getPieceIcon(piece)}`;
        attachDragToPiece(img, sq);
        div.appendChild(img);
      }

      // Badge d'annotation sur la case de destination du dernier coup
      if (annotStyle && sq === lastTo) {
        const badge = document.createElement('div');
        badge.className = 'annotation-badge';
        badge.style.background = annotStyle.color;
        badge.textContent = annotStyle.label;
        div.appendChild(badge);
      }

      // Indicateur de coup légal
      if (legalTargets.has(sq)) {
        const indicator = document.createElement('div');
        indicator.className = 'legal-indicator ' + (piece ? 'legal-indicator--ring' : 'legal-indicator--dot');
        div.appendChild(indicator);
      }

      boardFragment.appendChild(div);
    }
  }

  boardEl.appendChild(boardFragment);

  // Appliquer l'animation de déplacement si un coup vient d'être joué
  if (state.pendingAnimation) {
    const { fromSq, toSq } = state.pendingAnimation;
    state.pendingAnimation = null;
    requestAnimationFrame(() => applyMoveAnimation(fromSq, toSq));
  }
}

/**
 * Anime le déplacement d'une pièce du carré source vers le carré cible.
 * Utilise transform:translate() + transition CSS pour des performances GPU optimales.
 * La pièce est déjà à sa position finale dans le DOM (après re-render) ;
 * on l'offset visuellement vers la source puis on anime vers 0,0.
 *
 * @param {string} fromSq - Case algébrique source (ex: 'e2')
 * @param {string} toSq   - Case algébrique cible (ex: 'e4')
 */
function applyMoveAnimation(fromSq, toSq) {
  const { boardEl } = state;
  if (!boardEl) return;

  const fromEl = boardEl.querySelector(`[data-sq="${fromSq}"]`);
  const toEl   = boardEl.querySelector(`[data-sq="${toSq}"]`);
  if (!fromEl || !toEl) return;

  const pieceImg = toEl.querySelector('.piece');
  if (!pieceImg) return;

  // Calculer le vecteur de translation source → cible
  const fromRect = fromEl.getBoundingClientRect();
  const toRect   = toEl.getBoundingClientRect();
  const dx = fromRect.left - toRect.left;
  const dy = fromRect.top  - toRect.top;

  // 1) Positionner instantanément la pièce à la case source (sans transition)
  pieceImg.classList.add('piece-moving');
  pieceImg.style.transition = 'none';
  pieceImg.style.transform  = `translate(${dx}px, ${dy}px)`;

  // 2) Forcer un reflow pour que le navigateur enregistre l'état initial
  pieceImg.getBoundingClientRect();

  // 3) Activer la transition et revenir à la position finale
  pieceImg.style.transition = 'transform 240ms ease';
  pieceImg.style.transform  = 'translate(0, 0)';

  // 4) Nettoyer après la transition
  pieceImg.addEventListener('transitionend', () => {
    pieceImg.style.transition = '';
    pieceImg.style.transform  = '';
    pieceImg.classList.remove('piece-moving');
  }, { once: true });
}

/**
 * Convertit une couleur hex (#rrggbb) en rgba(r, g, b, a).
 */
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
