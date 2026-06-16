import type { PriorityBadge } from '@/types/report';

export function getPriorityBadge(gap: number): PriorityBadge {
  const gapAbs = Math.abs(gap);
  if (gapAbs >= 0.08) {
    return { badgeClass: 'badge-critical', itemClass: 'report-item--critical', label: 'CRITIQUE', rank: 3 };
  }
  if (gapAbs >= 0.04) {
    return { badgeClass: 'badge-important', itemClass: 'report-item--important', label: 'IMPORTANT', rank: 2 };
  }
  return { badgeClass: 'badge-minor', itemClass: 'report-item--minor', label: 'MINEUR', rank: 1 };
}
