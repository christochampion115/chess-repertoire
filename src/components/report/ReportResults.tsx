import React, { useState, useMemo, useTransition } from 'react';
import type { ReportData, ReportGroup, ReportParams } from '@/types/report';
import { FORMAT_LABELS } from '@/services/openings';
import { ReportGroupCard } from './ReportGroupCard';
import { cardLg } from './reportStyles';
import './report.css';

interface ReportResultsProps {
  data: ReportData;
  params: ReportParams;
  onNewAnalysis: () => void;
}

export const ReportResults = React.memo(function ReportResults({ data, params, onNewAnalysis }: ReportResultsProps) {
  const [activeTab, setActiveTab] = useState<'priorities' | 'strengths'>('priorities');
  // Lazy-mount : le panel est monté une seule fois au premier clic,
  // puis conservé en DOM (display:none) pour éviter le coût de remontage.
  const [mountedTabs, setMountedTabs] = useState<Set<'priorities' | 'strengths'>>(
    new Set(['priorities'])
  );
  const [isPending, startTransition] = useTransition();

  const handleSetTab = (tab: 'priorities' | 'strengths') => {
    // startTransition : rendu en arrière-plan, l'UI reste réactive pendant le premier montage
    startTransition(() => {
      setActiveTab(tab);
      setMountedTabs((prev) => {
        if (prev.has(tab)) return prev;
        const next = new Set(prev);
        next.add(tab);
        return next;
      });
    });
  };

  const { totalGames, parsedGames, baselineScore, items, truncated, rootFen, positionFiltered, groups, honorables: rawHonorables } = data;
  const analyzed = parsedGames !== undefined ? parsedGames : totalGames;
  const worstItems = items.filter((i) => i.gap > 0.01);
  const bestItems = items.filter((i) => i.gap < -0.01);
  const totalImpact = worstItems.reduce((sum, item) => sum + item.impactElo, 0);

  // Mode position: flat heavy cards
  // Mode libre: groupes pré-calculés par le backend
  const priorityGroups = useMemo(
    () => groups
      ? groups.filter((g) => g.groupGap > 0)
      : [],
    [groups]
  );
  const strengthGroups = useMemo(
    () => groups
      ? groups.filter((g) => g.groupGap < 0).sort((a, b) => b.impactElo - a.impactElo)
      : [],
    [groups]
  );

  const honorables = useMemo(() => {
    if (positionFiltered) return [];
    return (rawHonorables || [])
      .filter(i => i.gap > 0.01)
      .sort((a, b) => a.impactElo - b.impactElo)
      .slice(0, 5);
  }, [rawHonorables, positionFiltered]);

  const hasPriorities = positionFiltered ? worstItems.length > 0 : priorityGroups.length > 0 || honorables.length > 0;
  const hasStrengths = positionFiltered ? bestItems.length > 0 : strengthGroups.length > 0;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div className="report-filter-bar" style={{ display: 'flex', alignItems: 'stretch', gap: 12 }}>
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '0 24px',
              background: 'rgba(15,23,42,0.6)',
              borderRadius: 10,
              border: '1px solid rgba(148,163,184,0.08)',
            }}
          >
            <span style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
              Filtres :
            </span>
            <span style={{ color: '#475569', fontSize: '0.9rem' }}>|</span>
            <span style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}>{FORMAT_LABELS.color(params.color)}</span>
            <span style={{ color: '#475569', fontSize: '0.9rem' }}>|</span>
            <span style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}>{FORMAT_LABELS.timeClass(params.timeClass)}</span>
            <span style={{ color: '#475569', fontSize: '0.9rem' }}>|</span>
            <span style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}>{FORMAT_LABELS.elo(params.eloMin, params.eloMax)}</span>
            {data.positionFiltered && (
              <>
                <span style={{ color: '#475569', fontSize: '0.9rem' }}>|</span>
                <span style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}>Position filtrée</span>
              </>
            )}
          </div>
          <button
          type="button"
          onClick={onNewAnalysis}
          className="rbtn-secondary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '14px 28px',
            background: 'linear-gradient(135deg, #2dd4bf, #6366f1)',
            color: '#030712',
            border: 'none',
            borderRadius: 10,
            fontSize: '0.95rem',
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: 'inset 0 1px 3px rgba(255,255,255,0.2), 0 2px 10px rgba(45,212,191,0.3)',
            whiteSpace: 'nowrap',
            transition: 'transform 0.18s ease, box-shadow 0.18s ease',
          }}
        >
          <span className="report-btn-arrow">←</span> Nouvelle analyse
        </button>
        </div>
      </div>

      <div
        className="report-stats-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div
          className="rcard"
          style={{
            ...cardLg,
            padding: '22px 16px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc', marginBottom: 4 }}>{analyzed}</div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Parties analysées
          </div>
        </div>
        <div
          className="rcard"
          style={{
            ...cardLg,
            padding: '22px 16px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc', marginBottom: 4 }}>
            {(baselineScore * 100).toFixed(0)}%
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Moyenne
          </div>
        </div>
        <div
          className="rcard"
          style={{
            ...cardLg,
            padding: '22px 16px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc', marginBottom: 4 }}>
            {Math.round(Math.abs(totalImpact))} pts elo
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Gain manqué
          </div>
        </div>
      </div>

      {truncated && (
        <div
          style={{
            fontSize: '0.82rem',
            color: '#fde68a',
            padding: '8px 14px',
            background: 'rgba(234,179,8,.08)',
            border: '1px solid rgba(234,179,8,.2)',
            borderRadius: 7,
            marginBottom: 16,
          }}
        >
          ⚠️ Analyse limitée ({totalGames} parties max). Réduisez la période pour plus de précision.
        </div>
      )}

      {!hasPriorities && !hasStrengths && (
        <div
          className="rcard"
          style={{
            ...cardLg,
            textAlign: 'center',
            padding: '48px 24px',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🎉</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 8, color: '#f8fafc' }}>
            Aucun point faible détecté.
          </div>
          <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
            Soit vos résultats sont homogènes, soit l'échantillon est insuffisant pour dégager des tendances fiables.
          </div>
        </div>
      )}

      {hasPriorities && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid rgba(148,163,184,0.1)' }}>
            {(['priorities', 'strengths'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                className="rtab"
                onClick={() => handleSetTab(tab)}
                style={{
                  background: activeTab === tab
                    ? 'linear-gradient(180deg, rgba(99,102,241,0.12), rgba(99,102,241,0.04))'
                    : 'none',
                  border: 'none',
                  borderBottom: `2px solid ${activeTab === tab ? '#6366F1' : 'transparent'}`,
                  marginBottom: -2,
                  padding: '10px 20px',
                  fontSize: '0.85rem',
                  fontWeight: activeTab === tab ? 700 : 600,
                  color: activeTab === tab ? '#a5b4fc' : '#94a3b8',
                  cursor: isPending ? 'wait' : 'pointer',
                  transition: 'background 0.2s ease, opacity 0.15s ease',
                  opacity: isPending ? 0.65 : 1,
                }}
              >
                {tab === 'priorities' ? "Priorités d'entraînement" : 'Meilleures performances'}
              </button>
            ))}
          </div>

          <div style={{ display: activeTab === 'priorities' ? '' : 'none' }}>
          {mountedTabs.has('priorities') && (
            <div>
              {positionFiltered ? (
                worstItems
                  .sort((a, b) => a.impactElo - b.impactElo)
                  .map((item, i) => {
                    const fakeGroup: ReportGroup = {
                      key: [params.startPath || '', ...item.contextPath, item.playerMove].filter(Boolean).join(' '),
                      children: [item],
                      total: item.total,
                      wins: item.wins,
                      draws: item.draws,
                      losses: item.losses,
                      impactElo: item.impactElo,
                      fen: item.fenAfter,
                      fenUci: item.playerUci,
                      groupScore: item.score,
                      groupGap: item.gap,
                      problematicLines: [item],
                      compensatingLines: [],
                    };
                    return (
                      <div key={i} style={{ marginBottom: 10 }}>
                        <ReportGroupCard group={fakeGroup} baselineScore={baselineScore} rootFen={rootFen} />
                      </div>
                    );
                  })
              ) : (
                priorityGroups.map((group, i) => (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <ReportGroupCard group={group} baselineScore={baselineScore} rootFen={rootFen} />
                  </div>
                ))
              )}

              {!positionFiltered && honorables.length > 0 && (
                <div style={{ marginTop: 24, borderTop: '2px dashed rgba(148,163,184,0.12)', paddingTop: 16 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>
                    Mentions honorables
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: 12 }}>
                    Lignes coûteuses qui n'appartiennent pas aux priorités principales.
                  </div>
                  {honorables.map((item, i) => {
                    const g: ReportGroup = {
                      key: [...item.contextPath, item.playerMove].join(' '),
                      children: [],
                      total: item.total, wins: item.wins, draws: item.draws, losses: item.losses,
                      impactElo: item.impactElo,
                      fen: item.fenAfter, fenUci: item.playerUci,
                      groupScore: item.score, groupGap: item.gap,
                      problematicLines: [], compensatingLines: [],
                    };
                    return (
                      <div key={i} style={{ marginBottom: 10 }}>
                        <ReportGroupCard group={g} baselineScore={baselineScore} rootFen={rootFen} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          </div>

          <div style={{ display: activeTab === 'strengths' ? '' : 'none' }}>
          {mountedTabs.has('strengths') && (
            <div>
              {!hasStrengths && (
                <div
                  className="rcard"
                  style={{
                    ...cardLg,
                    textAlign: 'center',
                    padding: '48px 24px',
                  }}
                >
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>🏆</div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: '#f8fafc' }}>
                    Pas encore assez de données pour identifier vos meilleures lignes.
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: 8 }}>
                    Soit vos résultats sont trop homogènes, soit l'échantillon est insuffisant.
                  </div>
                </div>
              )}
              {positionFiltered
                ? bestItems
                    .sort((a, b) => b.impactElo - a.impactElo)
                    .map((item, i) => {
                      const fakeGroup: ReportGroup = {
                        key: [params.startPath || '', ...item.contextPath, item.playerMove].filter(Boolean).join(' '),
                        children: [item],
                        total: item.total, wins: item.wins, draws: item.draws, losses: item.losses,
                        impactElo: item.impactElo,
                        fen: item.fenAfter, fenUci: item.playerUci,
                        groupScore: item.score, groupGap: item.gap,
                        problematicLines: [], compensatingLines: [item],
                      };
                      return (
                        <div key={i} style={{ marginBottom: 10 }}>
                          <ReportGroupCard group={fakeGroup} baselineScore={baselineScore} rootFen={rootFen} variant="strength" />
                        </div>
                      );
                    })
                : strengthGroups.map((group, i) => (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <ReportGroupCard group={group} baselineScore={baselineScore} rootFen={rootFen} variant="strength" />
                    </div>
                  ))}
            </div>
          )}
          </div>
        </>
      )}
    </div>
  );
});
