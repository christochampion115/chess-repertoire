import { useLayoutEffect } from 'react';
import { useChessStore } from '@/stores/chessStore';

export function useBoardAnimation() {
  const pendingAnimation = useChessStore((s) => s.pendingAnimation);
  const skipNextAnimation = useChessStore((s) => s.skipNextAnimation);
  const setPendingAnimation = useChessStore((s) => s.setPendingAnimation);
  const setSkipNextAnimation = useChessStore((s) => s.setSkipNextAnimation);

  useLayoutEffect(() => {
    if (!pendingAnimation) return;

    const { fromSq, toSq } = pendingAnimation;

    if (skipNextAnimation) {
      setPendingAnimation(null);
      setSkipNextAnimation(false);
      return;
    }

    const boardEl = document.getElementById('board');
    if (!boardEl) { setPendingAnimation(null); return; }

    const fromEl = boardEl.querySelector(`[data-sq="${fromSq}"]`) as HTMLElement | null;
    const toEl = boardEl.querySelector(`[data-sq="${toSq}"]`) as HTMLElement | null;
    if (!fromEl || !toEl) { setPendingAnimation(null); return; }

    const pieceImg = toEl.querySelector('.piece') as HTMLElement | null;
    if (!pieceImg) { setPendingAnimation(null); return; }

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    const dx = fromRect.left - toRect.left;
    const dy = fromRect.top - toRect.top;

    let cancelled = false;

    pieceImg.classList.add('piece-moving');
    pieceImg.style.transition = 'none';
    pieceImg.style.transform = `translate(${dx}px, ${dy}px)`;

    pieceImg.getBoundingClientRect();

    pieceImg.style.transition = 'transform 168ms ease';
    pieceImg.style.transform = 'translate(0, 0)';

    pieceImg.addEventListener('transitionend', () => {
      if (cancelled) return;
      pieceImg.style.transition = '';
      pieceImg.style.transform = '';
      pieceImg.classList.remove('piece-moving');
      setPendingAnimation(null);
    }, { once: true });

    return () => {
      cancelled = true;
      pieceImg.style.transition = '';
      pieceImg.style.transform = '';
      pieceImg.classList.remove('piece-moving');
      setPendingAnimation(null);
    };
  }, [pendingAnimation, skipNextAnimation, setPendingAnimation, setSkipNextAnimation]);
}
