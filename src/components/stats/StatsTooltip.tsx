import React, { useRef, useEffect } from 'react';

interface StatsTooltipProps {
  x: number;
  y: number;
  children: React.ReactNode;
  onClose: () => void;
  /** Appelé quand la souris entre dans le tooltip — annule le hideTimer. */
  onMouseEnter?: () => void;
}

export function StatsTooltip({ x, y, children, onClose, onMouseEnter }: StatsTooltipProps) {
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 10;
    const maxW = Math.min(340, window.innerWidth - pad * 2);
    const clampedX = Math.max(pad, Math.min(x, window.innerWidth - rect.width - pad));
    const clampedY = Math.max(pad, Math.min(y, window.innerHeight - rect.height - pad));
    el.style.left = `${clampedX}px`;
    el.style.top = `${clampedY}px`;
    el.style.maxWidth = `${maxW}px`;
  }, [x, y]);

  return (
    <div
      ref={elRef}
      className="move-hover-tooltip"
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 10000,
        pointerEvents: 'auto',
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onClose}
    >
      {children}
    </div>
  );
}
