import React from 'react';
import { getMedalDisplayMeta } from '@/services/training';
import type { RepertoireNode } from '@/types/repertoire';

export interface MedalBadgeProps {
  node: RepertoireNode;
}

export const MedalBadge = React.memo(function MedalBadge({ node }: MedalBadgeProps) {
  const meta = getMedalDisplayMeta(node);
  if (!meta) return null;

  return (
    <span
      className={`rep-medal-badge tier-${meta.tier}`}
      data-shine={meta.shine}
      title={`${meta.label} · niveau ${meta.shine + 1}`}
    >
      {meta.icon}
    </span>
  );
});
