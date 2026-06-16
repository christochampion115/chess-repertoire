import { useRef, useState, useCallback } from 'react';
import { useChessStore } from '@/stores/chessStore';
import * as repertoireService from '@/services/repertoire';
import type { Square } from '@/types/chess';

const DRAG_THRESHOLD = 5;

export interface ActiveDrag {
  fromSq: Square;
  x: number;
  y: number;
  src: string;
  size: number;
}

function getSquareEl(x: number, y: number): HTMLElement | null {
  const els = document.elementsFromPoint(x, y);
  for (const el of els) {
    const sq = (el as HTMLElement).dataset?.sq;
    if (sq) return el as HTMLElement;
  }
  return null;
}

export function useDragPiece() {
  const selectSquareStore = useChessStore((s) => s.selectSquare);
  const setSkipAnimationStore = useChessStore((s) => s.setSkipNextAnimation);
  const chessStore = useChessStore((s) => s.chess);

  const selectSquareRef = useRef(selectSquareStore);
  const setSkipAnimationRef = useRef(setSkipAnimationStore);
  const chessRef = useRef(chessStore);

  selectSquareRef.current = selectSquareStore;
  setSkipAnimationRef.current = setSkipAnimationStore;
  chessRef.current = chessStore;

  const dragRef = useRef<{
    fromSq: Square;
    startX: number;
    startY: number;
    src: string;
    size: number;
    isDragging: boolean;
    pieceEl: HTMLElement;
  } | null>(null);

  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [dragTargetSq, setDragTargetSq] = useState<Square | null>(null);
  const [legalTargetsDrag, setLegalTargetsDrag] = useState<Set<string> | null>(null);

  const handleMove = useCallback((e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (!drag.isDragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      drag.isDragging = true;
      drag.pieceEl.style.opacity = '0.25';
      const moves = chessRef.current.moves({ square: drag.fromSq, verbose: true });
      setLegalTargetsDrag(new Set(moves.map((m) => m.to)));
    }

    setActiveDrag({
      fromSq: drag.fromSq,
      x: e.clientX,
      y: e.clientY,
      src: drag.src,
      size: drag.size,
    });

    const sqEl = getSquareEl(e.clientX, e.clientY);
    const sq = sqEl ? (sqEl.dataset.sq as Square) : null;
    setDragTargetSq(sq !== drag.fromSq ? sq : null);
  }, []);

  const handleUp = useCallback((e: PointerEvent) => {
    document.removeEventListener('pointermove', handleMove);
    document.removeEventListener('pointerup', handleUp);
    document.removeEventListener('pointercancel', handleCancel);

    const drag = dragRef.current;
    if (!drag) return;

    if (!drag.isDragging) {
      dragRef.current = null;
      return;
    }

    drag.pieceEl.style.opacity = '';
    setActiveDrag(null);
    setDragTargetSq(null);
    setLegalTargetsDrag(null);

    const sqEl = getSquareEl(e.clientX, e.clientY);
    const toSq = sqEl ? (sqEl.dataset.sq as Square) : null;

    if (toSq && toSq !== drag.fromSq) {
      setSkipAnimationRef.current(true);
      useChessStore.setState({ selectedSq: drag.fromSq });
      repertoireService.handleSquareClick(toSq);
    } else if (dragRef.current) {
      selectSquareRef.current(null);
    }

    dragRef.current = null;
  }, [handleMove]);

  const handleCancel = useCallback(() => {
    document.removeEventListener('pointermove', handleMove);
    document.removeEventListener('pointerup', handleUp);
    document.removeEventListener('pointercancel', handleCancel);

    const drag = dragRef.current;
    if (!drag) return;

    drag.pieceEl.style.opacity = '';
    setActiveDrag(null);
    setDragTargetSq(null);
    setLegalTargetsDrag(null);
    selectSquareRef.current(null);
    dragRef.current = null;
  }, [handleMove, handleUp]);

  const onPointerDown = useCallback((sq: Square, e: React.PointerEvent<HTMLImageElement>) => {
    if (e.button !== 0) return;

    const piece = chessRef.current.get(sq);
    if (!piece || piece.color !== chessRef.current.turn()) return;

    const imgEl = e.currentTarget;
    const rect = imgEl.getBoundingClientRect();

    dragRef.current = {
      fromSq: sq,
      startX: e.clientX,
      startY: e.clientY,
      size: rect.width,
      src: imgEl.src,
      isDragging: false,
      pieceEl: imgEl,
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
    document.addEventListener('pointercancel', handleCancel);
  }, [handleMove, handleUp, handleCancel]);

  return {
    onPointerDown,
    activeDrag,
    dragTargetSq,
    legalTargetsDrag,
  };
}
