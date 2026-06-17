import React, { useState, useMemo } from 'react';
import type { ReportData, ReportGroup, ReportParams } from '@/types/report';
import { summarizeParams } from '@/services/openings';
import { ReportGroupCard } from './ReportGroupCard';

interface ReportResultsProps {
  data: ReportData;
  params: ReportParams;
  onNewAnalysis: () => void;
}

export const ReportResults = React.memo(function ReportResults({ data, params, onNewAnalysis }: ReportResultsProps) {
  const [activeTab, setActiveTab] = useState<'priorities' | 'strengths'>('priorities');

  const { totalGames, parsedGames, baselineScore, items, truncated, rootFen, positionFiltered, groups, honorables: rawHonorables } = data;
  console.log('REPORT_DEBUG:', {
    totalGames, parsedGames, baselineScore,
    itemsLen: items?.length,
    impactEloFirst: items[0]?.impactElo,
    groupsLen: groups?.length,
    hasGroups: !!groups,
    firstGroup: groups?.[0] ? { impactElo: groups[0].impactElo } : null,
    honorablesLen: rawHonorables?.length,
    keys: Object.keys(data).join(', ')
  });
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
        <div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>
            Rapport d'analyse
          </div>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.45 }}>
            {summarizeParams(params, data)}
          </div>
        </div>
        <button
          type="button"
          onClick={onNewAnalysis}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'none',
            border: '1px solid rgba(148,163,184,0.18)',
            color: '#94a3b8',
            padding: '7px 14px',
            borderRadius: 7,
            fontSize: '0.82rem',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          ← Nouvelle analyse
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: 'rgba(17,24,39,0.96)',
            border: '1px solid rgba(148,163,184,0.18)',
            borderRadius: 10,
            padding: 16,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc', marginBottom: 4 }}>{analyzed}</div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Parties analysées
          </div>
        </div>
        <div
          style={{
            background: 'rgba(17,24,39,0.96)',
            border: '1px solid rgba(148,163,184,0.18)',
            borderRadius: 10,
            padding: 16,
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
          style={{
            background: 'rgba(17,24,39,0.96)',
            border: '1px solid rgba(251,113,133,.22)',
            borderRadius: 10,
            padding: 16,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f9a8b8', marginBottom: 4 }}>
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
          style={{
            textAlign: 'center',
            padding: '48px 24px',
            background: 'rgba(17,24,39,0.96)',
            border: '1px solid rgba(148,163,184,0.18)',
            borderRadius: 10,
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
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid rgba(148,163,184,0.18)' }}>
            {(['priorities', 'strengths'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: `3px solid ${activeTab === tab ? '#7aaecb' : 'transparent'}`,
                  marginBottom: -2,
                  padding: '8px 16px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: activeTab === tab ? '#7aaecb' : '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                {tab === 'priorities' ? "Priorités d'entraînement" : 'Meilleures performances'}
              </button>
            ))}
          </div>

          {activeTab === 'priorities' && (
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

          {activeTab === 'strengths' && (
            <div>
              {!hasStrengths && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '48px 24px',
                    background: 'rgba(17,24,39,0.96)',
                    border: '1px solid rgba(148,163,184,0.18)',
                    borderRadius: 10,
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
        </>
      )}
    </div>
  );
});
