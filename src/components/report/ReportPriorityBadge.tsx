import React from 'react';
import type { PriorityBadge } from '@/types/report';

const BADGE_STYLES: Record<string, React.CSSProperties> = {
  'badge-critical': {
    background: 'rgba(99,102,241,.12)',
    color: '#a5b4fc',
    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.45)',
  },
  'badge-important': {
    background: 'rgba(148,163,184,.1)',
    color: '#cbd5e1',
    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.45)',
  },
  'badge-minor': {
    background: 'rgba(148,163,184,.1)',
    color: '#94a3b8',
    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.45)',
  },
};

interface ReportPriorityBadgeProps {
  badge: PriorityBadge;
}

export const ReportPriorityBadge = React.memo(function ReportPriorityBadge({ badge }: ReportPriorityBadgeProps) {
  return (
    <span
      style={{
        fontSize: '0.75rem',
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '.06em',
        padding: '3px 10px',
        borderRadius: 100,
        ...BADGE_STYLES[badge.badgeClass],
      }}
    >
      {badge.label}
    </span>
  );
});
