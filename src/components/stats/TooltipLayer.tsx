import React from 'react';
import { StatsTooltip } from './StatsTooltip';

interface TooltipData {
  x: number;
  y: number;
  content: React.ReactNode;
}

interface TooltipLayerProps {
  tooltip: TooltipData | null;
  onClose: () => void;
}

export function TooltipLayer({ tooltip, onClose }: TooltipLayerProps) {
  if (!tooltip) return null;
  return (
    <StatsTooltip x={tooltip.x} y={tooltip.y} onClose={onClose}>
      {tooltip.content}
    </StatsTooltip>
  );
}
