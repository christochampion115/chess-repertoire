import { state } from './state.js';
import { handleSquareClick } from './repertoire.js';
import { eventBus } from './events.js';

// Seuil en pixels pour distinguer un clic d'un drag
const DRAG_THRESHOLD = 5;

/** État interne du drag en cours (null si aucun drag actif) */
let drag = null;

/** Élément ghost (clone de pièce suivant le curseur) */
let ghostEl = null;

/** Dernière case mise en surbrillance comme cible de drop */
let prevHighlightEl = null;

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function getSquareEl(x, y) {
  const els = document.elementsFromPoint(x, y);
  for (const el of els) {
    if (el.dataset && el.dataset.sq) return el;
  }
  return null;
}

function removeGhost() {
  if (ghostEl) { ghostEl.remove(); ghostEl = null; }
}

function clearDragTarget() {
  if (prevHighlightEl) {
    prevHighlightEl.classList.remove('drag-target');
    prevHighlightEl = null;
  }
}

/**
 * Injecte les indicateurs de coups légaux directement dans le DOM existant,
 * SANS déclencher de re-render (qui détruirait la pointer capture).
 */
function showLegalIndicators(fromSq) {
  const moves = state.chess.moves({ square: fromSq, verbose: true });
  const boardEl = state.boardEl;
  if (!boardEl) return;
  moves.forEach(m => {
    const sqEl = boardEl.querySelector(`[data-sq="${m.to}"]`);
    if (!sqEl) return;
    const hasPiece = !!sqEl.querySelector('.piece');
    const ind = document.createElement('div');
    ind.className = 'legal-indicator drag-legal ' + (hasPiece ? 'legal-indicator--ring' : 'legal-indicator--dot');
    sqEl.appendChild(ind);
  });
}

function removeLegalIndicators() {
  state.boardEl?.querySelectorAll('.drag-legal').forEach(el => el.remove());
}

// ─── Handlers pointer ─────────────────────────────────────────────────────────

function onMove(e) {
  if (!drag) return;

  const dx = e.clientX - drag.startX;
  const dy = e.clientY - drag.startY;

  // Transition : clic → drag
  if (!drag.isDragging) {
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

    drag.isDragging = true;

    // Dimmer la pièce d'origine
    drag.pieceImg.style.opacity = '0.25';

    // Injecter les indicateurs légaux SANS re-render
    showLegalIndicators(drag.fromSq);

    // Créer le ghost
    ghostEl = document.createElement('img');
    ghostEl.src = drag.src;
    ghostEl.className = 'piece-ghost';
    ghostEl.style.width = `${drag.size * 1.2}px`;
    ghostEl.style.height = `${drag.size * 1.2}px`;
    document.body.appendChild(ghostEl);
  }

  // Centrer le ghost sur le curseur
  ghostEl.style.left = `${e.clientX - drag.size * 0.6}px`;
  ghostEl.style.top = `${e.clientY - drag.size * 0.6}px`;

  // Surligner la case cible
  const sqEl = getSquareEl(e.clientX, e.clientY);
  if (sqEl !== prevHighlightEl) {
    clearDragTarget();
    if (sqEl && sqEl.dataset.sq !== drag.fromSq) {
      sqEl.classList.add('drag-target');
      prevHighlightEl = sqEl;
    }
  }
}

function onUp(e) {
  if (!drag) return;

  const { fromSq, isDragging, pieceImg } = drag;

  pieceImg.removeEventListener('pointermove', onMove);
  pieceImg.removeEventListener('pointerup', onUp);
  pieceImg.removeEventListener('pointercancel', onCancel);

  removeGhost();
  clearDragTarget();
  removeLegalIndicators();
  if (pieceImg) pieceImg.style.opacity = '';
  drag = null;

  if (!isDragging) {
    // Simple clic : émuler le clic sur la case
    handleSquareClick(fromSq);
    return;
  }

  const sqEl = getSquareEl(e.clientX, e.clientY);
  const toSq = sqEl ? sqEl.dataset.sq : null;

  if (toSq && toSq !== fromSq) {
    state.skipNextAnimation = true;
    state.selectedSq = fromSq;
    handleSquareClick(toSq);
  } else {
    // Drop invalide : nettoyer sans re-render supplémentaire
    state.selectedSq = null;
    eventBus.emit('render');
  }
}

function onCancel(e) {
  if (!drag) return;
  drag.pieceImg.removeEventListener('pointermove', onMove);
  drag.pieceImg.removeEventListener('pointerup', onUp);
  drag.pieceImg.removeEventListener('pointercancel', onCancel);
  removeGhost();
  clearDragTarget();
  removeLegalIndicators();
  if (drag.pieceImg) drag.pieceImg.style.opacity = '';
  state.selectedSq = null;
  drag = null;
  eventBus.emit('render');
}

// ─── Export principal ─────────────────────────────────────────────────────────

export function attachDragToPiece(imgEl, sq) {
  imgEl.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;

    const piece = state.chess.get(sq);
    if (!piece || piece.color !== state.chess.turn()) return;

    e.preventDefault();

    const rect = imgEl.getBoundingClientRect();
    drag = {
      fromSq: sq,
      startX: e.clientX,
      startY: e.clientY,
      size: rect.width,
      src: imgEl.src,
      isDragging: false,
      pieceImg: imgEl,
    };

    imgEl.setPointerCapture(e.pointerId);
    imgEl.addEventListener('pointermove', onMove);
    imgEl.addEventListener('pointerup', onUp);
    imgEl.addEventListener('pointercancel', onCancel);
  });
}

