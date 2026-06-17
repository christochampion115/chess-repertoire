import React from 'react';
import type { PriorityBadge } from '@/types/report';

const BADGE_STYLES: Record<string, React.CSSProperties> = {
  'badge-critical': {
    background: 'rgba(251,113,133,.14)',
    color: '#fecdd3',
    border: '1px solid rgba(251,113,133,.28)',
  },
  'badge-important': {
    background: 'rgba(245,158,11,.14)',
    color: '#fcd34d',
    border: '1px solid rgba(245,158,11,.28)',
  },
  'badge-minor': {
    background: 'rgba(234,179,8,.10)',
    color: '#fde68a',
    border: '1px solid rgba(234,179,8,.22)',
  },
};

interface ReportPriorityBadgeProps {
  badge: PriorityBadge;
}

export const ReportPriorityBadge = React.memo(function ReportPriorityBadge({ badge }: ReportPriorityBadgeProps) {
  return (
    <span
      style={{
        fontSize: '0.65rem',
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '.06em',
        padding: '2px 8px',
        borderRadius: 100,
        ...BADGE_STYLES[badge.badgeClass],
      }}
    >
      {badge.label}
    </span>
  );
});
