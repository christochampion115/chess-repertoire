import React, { useState, useMemo, useCallback } from 'react';
import type { ReportGroup, PriorityBadge } from '@/types/report';
import { getOpeningNameByPath, pathToPgn, getMoveNumberFromFen } from '@/services/openings';
import { ReportMiniBoard } from './ReportMiniBoard';
import { ReportWdlBar } from './ReportWdlBar';

import { ReportPriorityBadge } from './ReportPriorityBadge';
import { ReportChildCard } from './ReportChildCard';
import { useRepertoireStore } from '@/stores/repertoireStore';
import { useReportStore } from '@/stores/reportStore';
import { cardLg, btnSecondary } from './reportStyles';
import './report.css';

interface ReportGroupCardProps {
  group: ReportGroup;
  baselineScore: number;
  rootFen?: string;
  variant?: 'weakness' | 'strength';
}

export const ReportGroupCard = React.memo(function ReportGroupCard({
  group,
  baselineScore,
  rootFen,
  variant = 'weakness',
}: ReportGroupCardProps) {
  const [expanded, setExpanded] = useState(false);
  const startMove = getMoveNumberFromFen(rootFen);
  const repertoires = useRepertoireStore((s) => s.repertoires);
  const reportColor = useReportStore((s) => s.params.color);
  console.log('[DEBUG ReportGroupCard] reportColor:', reportColor, 'flipped:', reportColor === 'black');
  const repInfo = useMemo(() => repertoires.map((r) => ({ name: r.name, fen: r.fen })), [repertoires]);

  const openInApp = useCallback(() => {
    if (!group.fen) return;
    try {
      sessionStorage.setItem('alphaChess.openAtFen', encodeURIComponent(group.fen));
      sessionStorage.setItem('alphaChess.openAtPath', group.key || '');
      sessionStorage.setItem('alphaChess.openAtRootFen', rootFen ? encodeURIComponent(rootFen) : '');
      sessionStorage.setItem('alphaChess.openFreePlay', '1');
      sessionStorage.setItem('alphaChess.openAtColor', reportColor === 'black' ? 'b' : 'w');
      window.location.href = '/app';
    } catch { /* localStorage might be full */ }
  }, [group.fen, group.key, rootFen, reportColor]);

  const hPct = (group.groupScore * 100).toFixed(0);
  const gapVal = group.groupGap * 100;
  const gapDisplay = gapVal.toFixed(0);
  const fullPath = group.key ? group.key.split(' ') : [];
  const pgnHtml = pathToPgn(fullPath, false, startMove);

  const groupBadge = useMemo((): PriorityBadge => {
    if (gapVal >= 8) return { badgeClass: 'badge-critical', itemClass: 'report-item--critical', label: 'CRITIQUE', rank: 3 };
    if (gapVal >= 6) return { badgeClass: 'badge-important', itemClass: 'report-item--important', label: 'IMPORTANT', rank: 2 };
    return { badgeClass: 'badge-minor', itemClass: 'report-item--minor', label: 'MINEUR', rank: 1 };
  }, [gapVal]);

  const borderColor = variant === 'weakness'
    ? gapVal >= 8 ? 'rgba(99,102,241,0.4)' : gapVal >= 6 ? 'rgba(99,102,241,0.25)' : 'rgba(148,163,184,0.15)'
    : 'rgba(34,211,238,0.3)';

  const allChildren = [...(group.problematicLines || []), ...(group.compensatingLines || [])];
  const hasChildren = allChildren.length > 0;

  const isStrength = variant === 'strength';

  return (
    <div
      className="rcard"
      style={{
        ...cardLg,
        borderLeft: `4px solid ${borderColor}`,
        borderRight: 'none',
        borderTop: 'none',
        borderBottom: 'none',
        marginBottom: 10,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '14px 24px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: 16, alignItems: 'start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {variant === 'weakness' && <ReportPriorityBadge badge={groupBadge} />}
              {variant === 'strength' && (
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '.06em',
                    padding: '3px 10px',
                    borderRadius: 100,
                    background: 'rgba(34,211,238,.12)',
                    color: '#67e8f9',
                    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
                  }}
                >
                  FORT
                </span>
              )}
              <div style={{ fontSize: '1.0rem', fontWeight: 700, color: '#f8fafc', flex: 1 }}>
                {getOpeningNameByPath(fullPath, group.fen ?? undefined, repInfo)}
              </div>
              <div style={{ fontSize: '0.9rem', color: '#94a3b8', whiteSpace: 'nowrap', fontWeight: 600 }}>
                {group.total} parties
              </div>
            </div>

            {pgnHtml && (
              <div
                style={{
                  fontFamily: "'Courier New',monospace",
                  fontSize: '0.82rem',
                  color: '#94a3b8',
                  background: 'rgba(8,16,29,0.7)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  marginBottom: 16,
                  lineHeight: 1.6,
                }}
                dangerouslySetInnerHTML={{ __html: pgnHtml }}
              />
            )}

            <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc' }}>
                  {hPct}%
                </div>
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  Score variante
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: variant === 'weakness' ? '#cbd5e1' : '#67e8f9' }}>
                  {gapVal >= 0 ? `−${gapDisplay}%` : `+${Math.abs(gapVal).toFixed(0)}%`}
                </div>
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  Écart
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#cbd5e1' }}>
                  {Math.round(Math.abs(group.impactElo))} pts
                </div>
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  Pertes évitables
                </div>
              </div>
            </div>

            <ReportWdlBar wins={group.wins} draws={group.draws} losses={group.losses} />

            {group.fen && (
              <div style={{ marginTop: 16 }}>
                <button
                  type="button"
                  onClick={openInApp}
                  className="rbtn-secondary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    width: '100%',
                    padding: '12px 20px',
                    background: 'linear-gradient(180deg, rgba(70,150,255,0.18), rgba(70,150,255,0.1))',
                    boxShadow: 'inset 0 1px 2px rgba(70,150,255,0.2)',
                    border: 'none',
                    borderRadius: 10,
                    color: '#fff',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'background 0.25s ease, box-shadow 0.25s ease',
                  }}
                >
                  Créer/Inspecter le répertoire
                </button>
              </div>
            )}
          </div>

            {group.fen && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginLeft: 10 }}>
              <ReportMiniBoard fen={group.fen} highlightUci={group.fenUci ?? undefined} size={26} flipped={reportColor === 'black'} />
            </div>
          )}
        </div>
      </div>

      {hasChildren && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="rtoggle"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '16px 28px',
              background: 'rgba(8,16,29,0.6)',
              border: 'none',
              borderTop: '1px solid rgba(148,163,184,0.08)',
              color: '#e2e8f0',
              fontSize: '0.85rem',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span style={{ fontSize: '0.6rem', color: '#94a3b8' }}>{expanded ? '▼' : '▶'}</span>
            <span style={{ fontWeight: 600 }}>{allChildren.length} ligne{allChildren.length > 1 ? `s ${variant === 'weakness' ? 'problématiques' : 'surperformantes'}` : ` ${variant === 'weakness' ? 'problématique' : 'surperformante'}`}</span>
          </button>
          {expanded && (
            <div style={{ background: 'rgba(8,16,29,0.5)' }}>
              {group.problematicLines.length > 0 && variant === 'weakness' && (
                <>
                  {group.problematicLines.map((child, i) => (
                    <ReportChildCard key={i} item={child} rootFen={rootFen} variant="weakness" />
                  ))}
                </>
              )}
              {group.compensatingLines.length > 0 && (
                <>
                  <div style={{ padding: '10px 28px 4px 28px', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#64748b', opacity: 0.8 }}>
                    {variant === 'weakness' ? 'Lignes compensatrices' : 'Lignes surperformantes'}
                  </div>
                  {group.compensatingLines.map((child, i) => (
                    <ReportChildCard key={i} item={child} rootFen={rootFen} variant={variant === 'strength' ? 'strength' : 'weakness'} />
                  ))}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
});
