import { useCallback, useRef, useState } from 'react';

interface TooltipState {
  x: number;
  y: number;
  content: React.ReactNode;
}

export function useTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout>>();
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  const show = useCallback((x: number, y: number, content: React.ReactNode, delay = 300) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    showTimer.current = setTimeout(() => {
      setTooltip({ x, y, content });
    }, delay);
  }, []);

  const hide = useCallback((delay = 200) => {
    if (showTimer.current) clearTimeout(showTimer.current);
    hideTimer.current = setTimeout(() => {
      setTooltip(null);
    }, delay);
  }, []);

  const hideNow = useCallback(() => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setTooltip(null);
  }, []);

  return { tooltip, show, hide, hideNow };
}
