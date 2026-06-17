import React, { useState, useMemo, useCallback } from 'react';
import type { ReportGroup, PriorityBadge } from '@/types/report';
import { getOpeningNameByPath, pathToPgn, getMoveNumberFromFen } from '@/services/openings';
import { ReportMiniBoard } from './ReportMiniBoard';
import { ReportWdlBar } from './ReportWdlBar';
import { ReportConfidence } from './ReportConfidence';
import { ReportPriorityBadge } from './ReportPriorityBadge';
import { ReportChildCard } from './ReportChildCard';
import { useRepertoireStore } from '@/stores/repertoireStore';

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
  const [expanded, setExpanded] = useState(true);
  const startMove = getMoveNumberFromFen(rootFen);
  const repertoires = useRepertoireStore((s) => s.repertoires);
  const repInfo = useMemo(() => repertoires.map((r) => ({ name: r.name, fen: r.fen })), [repertoires]);

  const openInApp = useCallback(() => {
    if (!group.fen) return;
    try {
      sessionStorage.setItem('alphaChess.openAtFen', encodeURIComponent(group.fen));
      sessionStorage.setItem('alphaChess.openFreePlay', '1');
      window.location.href = 'index.html';
    } catch { /* localStorage might be full */ }
  }, [group.fen]);

  const hPct = (group.groupScore * 100).toFixed(0);
  const basePct = (baselineScore * 100).toFixed(0);
  const gapVal = group.groupGap * 100;
  const gapDisplay = gapVal.toFixed(0);
  const fullPath = group.key ? group.key.split(' ') : [];
  const pgnHtml = pathToPgn(fullPath, false, startMove);
  const lossPct = group.total > 0 ? ((group.losses / group.total) * 100).toFixed(0) : '—';

  const groupBadge = useMemo((): PriorityBadge => {
    if (gapVal >= 8) return { badgeClass: 'badge-critical', itemClass: 'report-item--critical', label: 'CRITIQUE', rank: 3 };
    if (gapVal >= 6) return { badgeClass: 'badge-important', itemClass: 'report-item--important', label: 'IMPORTANT', rank: 2 };
    return { badgeClass: 'badge-minor', itemClass: 'report-item--minor', label: 'MINEUR', rank: 1 };
  }, [gapVal]);

  const borderColor = variant === 'weakness'
    ? gapVal >= 8 ? 'rgba(251,113,133,0.55)' : gapVal >= 6 ? 'rgba(251,191,36,0.55)' : 'rgba(253,230,138,0.45)'
    : '#6ee7b7';

  const allChildren = [...(group.problematicLines || []), ...(group.compensatingLines || [])];
  const hasChildren = allChildren.length > 0;

  let explanation = '';
  const isStrength = variant === 'strength';

  if (hasChildren) {
    const childShare = allChildren.reduce((s, c) => s + (isStrength ? c.wins : c.losses), 0);
    const totalShare = isStrength ? group.wins : group.losses;
    const ratio = childShare / Math.max(1, totalShare);
    if (ratio > 0.7) {
      explanation = isStrength
        ? `🏆 ${(ratio * 100).toFixed(0)}% de vos victoires dans ce groupe sont concentrées dans ${allChildren.length} ligne${allChildren.length > 1 ? 's' : ''} spécifique${allChildren.length > 1 ? 's' : ''}.`
        : `⚠️ ${(ratio * 100).toFixed(0)}% de vos défaites dans cette ouverture sont concentrées dans ${allChildren.length} ligne${allChildren.length > 1 ? 's' : ''} spécifique${allChildren.length > 1 ? 's' : ''}.`;
    } else if (ratio > 0.3) {
      explanation = isStrength
        ? `📊 ${(ratio * 100).toFixed(0)}% des victoires sont capturées par ces lignes spécifiques.`
        : `📊 ${(ratio * 100).toFixed(0)}% des défaites sont capturées par ces lignes spécifiques.`;
    } else {
      explanation = isStrength
        ? '📊 Les gains sont répartis uniformément.'
        : '📊 Les pertes sont réparties uniformément.';
    }
  } else {
    const rate = (isStrength ? group.wins : group.losses) / Math.max(1, group.total);
    const baselineRate = isStrength ? baselineScore : (1 - baselineScore);
    if (rate > baselineRate * 1.3) {
      explanation = isStrength
        ? `🏆 Score anormalement élevé (${lossPct}% de victoires).`
        : `⚠️ Score anormalement bas (${lossPct}% de défaites).`;
    } else {
      explanation = isStrength
        ? '📊 Légère surperformance globale.'
        : '📊 Légère sous-performance globale.';
    }
  }

  return (
    <div
      style={{
        background: 'rgba(17,24,39,0.96)',
        border: `1px solid rgba(148,163,184,0.18)`,
        borderLeft: `4px solid ${borderColor}`,
        borderRadius: 10,
        marginBottom: 10,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '16px 18px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 16, alignItems: 'start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              {variant === 'weakness' && <ReportPriorityBadge badge={groupBadge} />}
              {variant === 'strength' && (
                <span
                  style={{
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '.06em',
                    padding: '2px 8px',
                    borderRadius: 100,
                    background: 'rgba(74,222,128,.10)',
                    color: '#86efac',
                    border: '1px solid rgba(74,222,128,.22)',
                  }}
                >
                  FORT
                </span>
              )}
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f8fafc', flex: 1 }}>
                {getOpeningNameByPath(fullPath, group.fen ?? undefined, repInfo)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                {group.total} parties · {lossPct}% de défaites
              </div>
            </div>

            {pgnHtml && (
              <div
                style={{
                  fontFamily: "'Courier New',monospace",
                  fontSize: '0.82rem',
                  color: '#94a3b8',
                  background: 'rgba(15,23,42,0.96)',
                  borderRadius: 6,
                  padding: '6px 10px',
                  marginBottom: 14,
                  lineHeight: 1.6,
                }}
                dangerouslySetInnerHTML={{ __html: pgnHtml }}
              />
            )}

            <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: parseInt(hPct) < parseInt(basePct) ? '#f9a8b8' : '#f8fafc' }}>
                  {hPct}%
                </div>
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  Score variante
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fca5a5' }}>
                  {gapVal >= 0 ? `−${gapDisplay}%` : `+${Math.abs(gapVal).toFixed(0)}%`}
                </div>
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  Écart
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fdba74' }}>
                  {Math.round(Math.abs(group.impactElo))} pts
                </div>
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  Pertes Evitables
                </div>
              </div>
            </div>

            <ReportWdlBar wins={group.wins} draws={group.draws} losses={group.losses} />

            <div style={{ fontSize: '0.78rem', color: '#94a3b8', padding: '6px 0', lineHeight: 1.45 }}>
              {explanation}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ReportConfidence total={group.total} />
            </div>
          </div>

          {group.fen && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <ReportMiniBoard fen={group.fen} highlightUci={group.fenUci ?? undefined} size={20} />
              <button
                type="button"
                onClick={openInApp}
                title="Ouvrir cette position dans l'application"
                style={{
                  background: 'none',
                  border: '1px solid rgba(148,163,184,0.18)',
                  color: '#94a3b8',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: '0.68rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Ouvrir →
              </button>
            </div>
          )}
        </div>
      </div>

      {hasChildren && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '8px 16px',
              background: 'rgba(15,23,42,0.5)',
              border: 'none',
              borderTop: '1px solid rgba(148,163,184,0.18)',
              color: '#e2e8f0',
              fontSize: '0.80rem',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span style={{ fontSize: '0.6rem', color: '#94a3b8' }}>{expanded ? '▼' : '▶'}</span>
            <span>{allChildren.length} ligne{allChildren.length > 1 ? 's' : ''}</span>
          </button>
          {expanded && (
            <div style={{ background: 'rgba(15,23,42,0.5)' }}>
              {group.problematicLines.length > 0 && variant === 'weakness' && (
                <>
                  <div style={{ padding: '10px 16px 4px 28px', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#94a3b8', opacity: 0.7 }}>
                    Lignes problématiques
                  </div>
                  {group.problematicLines.map((child, i) => (
                    <ReportChildCard key={i} item={child} rootFen={rootFen} variant="weakness" />
                  ))}
                </>
              )}
              {group.compensatingLines.length > 0 && (
                <>
                  <div style={{ padding: '10px 16px 4px 28px', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#94a3b8', opacity: 0.7 }}>
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
