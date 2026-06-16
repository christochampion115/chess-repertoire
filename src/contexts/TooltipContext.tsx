import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { StatsTooltip } from '@/components/stats/StatsTooltip';

interface TooltipContextValue {
  showTooltip: (x: number, y: number, content: React.ReactNode, delay?: number) => void;
  hideTooltip: (delay?: number) => void;
  cancelHide: () => void;
}

const TooltipContext = createContext<TooltipContextValue | null>(null);

export function useTooltipContext(): TooltipContextValue {
  const ctx = useContext(TooltipContext);
  if (!ctx) throw new Error('useTooltipContext must be used within TooltipProvider');
  return ctx;
}

interface TooltipData {
  x: number;
  y: number;
  content: React.ReactNode;
}

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout>>();
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  // Cache l'infobulle au scroll et au clic extérieur (comme le vanilla)
  useEffect(() => {
    const onScroll = () => setTooltip(null);
    const onClick = () => setTooltip(null);
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    document.addEventListener('click', onClick, { capture: false, passive: true });
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      document.removeEventListener('click', onClick);
    };
  }, []);

  const showTooltip = useCallback((x: number, y: number, content: React.ReactNode, delay = 300) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (showTimer.current) clearTimeout(showTimer.current);
    showTimer.current = setTimeout(() => {
      setTooltip({ x, y, content });
    }, delay);
  }, []);

  const hideTooltip = useCallback((delay = 200) => {
    if (showTimer.current) clearTimeout(showTimer.current);
    showTimer.current = undefined;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setTooltip(null);
    }, delay);
  }, []);

  const cancelHide = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = undefined;
    }
  }, []);

  return (
    <TooltipContext.Provider value={{ showTooltip, hideTooltip, cancelHide }}>
      {children}
      {tooltip && (
        <StatsTooltip
          x={tooltip.x}
          y={tooltip.y}
          onClose={() => setTooltip(null)}
          onMouseEnter={cancelHide}
        >
          {tooltip.content}
        </StatsTooltip>
      )}
    </TooltipContext.Provider>
  );
}
