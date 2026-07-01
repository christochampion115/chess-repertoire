import React from 'react';
import type { ReportItem } from '@/types/report';
import { pathToPgn, getMoveNumberFromFen } from '@/services/openings';
import { ReportPriorityBadge } from './ReportPriorityBadge';
import { getPriorityBadge } from './reportUtils';
import { cardLg } from './reportStyles';


interface ReportChildCardProps {
  item: ReportItem;
  rootFen?: string;
  variant?: 'weakness' | 'strength';
}

export const ReportChildCard = React.memo(function ReportChildCard({
  item,
  rootFen,
  variant = 'weakness',
}: ReportChildCardProps) {
  const fullPath = [...item.contextPath, item.playerMove];
  const startMove = getMoveNumberFromFen(rootFen);
  const pgnHtml = pathToPgn(fullPath, true, startMove);
  const linePct = (item.score * 100).toFixed(0);
  const gapPct = (item.gap * 100).toFixed(0);
  const pts = Math.round(Math.abs(item.impactElo));
  const badge = getPriorityBadge(item.gap);

  return (
    <div
      style={{
        padding: '10px 16px 10px 28px',
        borderBottom: '1px solid rgba(148,163,184,0.08)',
        background: 'linear-gradient(160deg, rgba(15,25,50,0.6), rgba(8,16,29,0.7))',
      }}
    >
      <div
        style={{
          fontSize: '0.82rem',
          fontFamily: "'SF Mono','Cascadia Code','Consolas',monospace",
          color: '#e2e8f0',
          lineHeight: 1.5,
          marginBottom: 4,
        }}
        dangerouslySetInnerHTML={{ __html: pgnHtml }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.75rem', flexWrap: 'wrap' }}>
        {variant === 'weakness' && <ReportPriorityBadge badge={badge} />}
        {variant === 'strength' && (
          <span
            style={{
              fontSize: '0.6rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '.06em',
              padding: '1px 6px',
              borderRadius: 100,
              background: 'rgba(74,222,128,.10)',
              color: '#86efac',
              border: '1px solid rgba(74,222,128,.22)',
            }}
          >
            FORT
          </span>
        )}
        <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 30, color: '#f8fafc' }}>
          {linePct}%
        </span>
        <span style={{ fontWeight: 600, minWidth: 30, color: variant === 'weakness' ? '#fca5a5' : '#86efac' }}>
          {item.gap >= 0 ? `−${gapPct}` : `+${Math.abs(item.gap * 100).toFixed(0)}`}%
        </span>
        <span style={{ color: '#3B82F6' }}>{pts} pts</span>
        <span style={{ color: '#94a3b8' }}>{item.total} parties</span>
      </div>
    </div>
  );
});
