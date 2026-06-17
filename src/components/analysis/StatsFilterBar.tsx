import React, { useEffect, useRef, useState } from 'react';
import { useStatsStore } from '@/stores/statsStore';
import { useUiStore } from '@/stores/uiStore';
import { scheduleStatsReload } from '@/services/stats';
import type { StatsSortBy } from '@/types/stats';

const ELO_MIN = 0;
const ELO_MAX = 3000;
const ELO_MIN_GAP = 100;

const SORT_LABELS: Record<StatsSortBy, string> = {
  frequency:       'Fréquence',
  'winrate-white': 'Taux victoire blanc',
  'winrate-black': 'Taux victoire noir',
  engine:          'Préférence moteur',
};

const SORT_BADGE: Record<StatsSortBy, string> = {
  frequency:       'Fréquence',
  'winrate-white': 'Victoire blanc',
  'winrate-black': 'Victoire noir',
  engine:          'Moteur',
};

function formatEloLabel(min: number, max: number): string {
  if (min === ELO_MIN && max === ELO_MAX) return 'Any rating';
  return `${min}–${max}`;
}

function clampEloRange(
  minRaw: number,
  maxRaw: number,
  source: 'min' | 'max',
): { min: number; max: number } {
  let min = Math.min(ELO_MAX, Math.max(ELO_MIN, minRaw));
  let max = Math.min(ELO_MAX, Math.max(ELO_MIN, maxRaw));
  if (min > max) [min, max] = [max, min];
  if (max - min < ELO_MIN_GAP) {
    if (source === 'min') max = Math.min(ELO_MAX, min + ELO_MIN_GAP);
    else                  min = Math.max(ELO_MIN, max - ELO_MIN_GAP);
  }
  return { min, max };
}

export const StatsFilterBar = React.memo(function StatsFilterBar() {
  const filters    = useStatsStore((s) => s.filters);
  const setFilter  = useStatsStore((s) => s.setFilter);
  const setFilters = useStatsStore((s) => s.setFilters);
  const eloLoading = useStatsStore((s) => s.eloMiniLoading);
  const openModal  = useUiStore((s) => s.openModal);

  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  const isLichess  = filters.currentDatabase === 'lichess';
  const isMasters  = filters.currentDatabase === 'masters';
  const isPlayer   = filters.currentDatabase === 'player';
  const eloLabel   = formatEloLabel(filters.eloMin, filters.eloMax);
  const leftPct    = ((filters.eloMin - ELO_MIN) / (ELO_MAX - ELO_MIN)) * 100;
  const rightPct   = ((filters.eloMax - ELO_MIN) / (ELO_MAX - ELO_MIN)) * 100;

  const containerRef = useRef<HTMLDivElement>(null);

  // Ferme les menus en cliquant à l'extérieur
  useEffect(() => {
    if (!sortMenuOpen && !filters.eloPanelOpen) return;
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSortMenuOpen(false);
        if (filters.eloPanelOpen) setFilter('eloPanelOpen', false);
      }
    }
    document.addEventListener('click', onOutside);
    return () => document.removeEventListener('click', onOutside);
  }, [sortMenuOpen, filters.eloPanelOpen, setFilter]);

  function switchToLichess() {
    if (!isLichess) {
      setFilters({ currentDatabase: 'lichess' });
      scheduleStatsReload();
    }
  }

  function switchToMasters() {
    if (!isMasters) {
      setFilters({ currentDatabase: 'masters', eloPanelOpen: false });
      scheduleStatsReload();
    }
  }

  function toggleEloPanel(e: React.MouseEvent) {
    e.stopPropagation();
    if (!isLichess) {
      setFilters({ currentDatabase: 'lichess', eloPanelOpen: true });
      scheduleStatsReload();
    } else {
      setFilter('eloPanelOpen', !filters.eloPanelOpen);
    }
  }

  function applyElo(source: 'min' | 'max', raw: number) {
    const next = clampEloRange(
      source === 'min' ? raw : filters.eloMin,
      source === 'max' ? raw : filters.eloMax,
      source,
    );
    setFilters({ eloMin: next.min, eloMax: next.max });
    scheduleStatsReload();
  }

  function setSortBy(s: StatsSortBy) {
    setFilter('sortBy', s);
    setSortMenuOpen(false);
    // Sort ne nécessite pas un re-fetch réseau, juste un re-render
    // (les données sont déjà en mémoire, on les re-trie dans CandidatesSection)
  }

  // Tooltip joueur (affiché via CSS :hover sur le sub-label)
  const playerTooltipLines: string[] = [];
  if (isPlayer && filters.playerUsername) {
    playerTooltipLines.push(`@${filters.playerUsername}`);
    playerTooltipLines.push(`Couleur : ${filters.playerColor === 'black' ? 'Noirs' : 'Blancs'}`);
    const tcMap: Record<string, string> = { all: 'Toutes', bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapide', daily: 'Corresp.' };
    playerTooltipLines.push(`Cadence : ${tcMap[filters.playerTimeClass] ?? 'Toutes'}`);
    if (filters.playerDateFrom || filters.playerDateTo) {
      playerTooltipLines.push(`Période : ${filters.playerDateFrom || '…'} → ${filters.playerDateTo || '…'}`);
    }
    if (filters.playerEloMin > 0 || filters.playerEloMax < 3000) {
      playerTooltipLines.push(`Elo adv : ${filters.playerEloMin} – ${filters.playerEloMax}`);
    }
  }

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' }}>
      {/* ── Rangée de boutons ── */}
      <div className="stats-filter-buttons">

        {/* LICHESS — bouton split */}
        <div className="stats-filter-btn-wrap">
          <button
            type="button"
            id="stats-filter-lichess-btn"
            className={`stats-filter-btn stats-filter-btn--split${isLichess ? ' active' : ''}${eloLoading && isLichess ? ' is-loading' : ''}`}
            onClick={switchToLichess}
            title="Base Lichess"
          >
            <span className="stats-filter-btn-label">Lichess</span>
            <span
              className="stats-filter-btn-mini"
              title="Filtrer par Elo"
              onClick={toggleEloPanel}
            >
              ▾
            </span>
            <span className="elo-btn-mini-loader" />
          </button>
          {isLichess && eloLabel !== 'Any rating' && (
            <span className="stats-filter-badge stats-filter-badge--below">{eloLabel}</span>
          )}
        </div>

        {/* MASTERS */}
        <button
          type="button"
          id="stats-filter-masters-btn"
          className={`stats-filter-btn${isMasters ? ' active' : ''}`}
          onClick={switchToMasters}
          title="Base Masters (parties de haut niveau)"
        >
          Masters
        </button>

        {/* JOUEUR */}
        <div className="stats-filter-btn-wrap">
          <button
            type="button"
            id="stats-filter-player-btn"
            className={`stats-filter-btn${isPlayer ? ' active' : ''}`}
            onClick={() => openModal({ type: 'player-stats' })}
            title="Analyser les parties d'un joueur Chess.com"
          >
            Joueur
          </button>
          {isPlayer && filters.playerUsername && (
            <span className="stats-filter-sub-label">
              @{filters.playerUsername}
              {playerTooltipLines.length > 0 && (
                <span className="stats-player-tooltip">
                  {playerTooltipLines.join('\n')}
                </span>
              )}
            </span>
          )}
        </div>

        {/* TRI */}
        <div className="stats-sort-menu-wrapper" ref={sortMenuRef}>
          <button
            type="button"
            id="stats-sort-toggle-btn"
            className="stats-filter-btn"
            title={`Trier par : ${SORT_LABELS[filters.sortBy]}`}
            onClick={(e) => { e.stopPropagation(); setSortMenuOpen((v) => !v); }}
          >
            <span style={{ flex: 1, textAlign: 'center', fontSize: '0.7rem' }}>
              Affichage
            </span>
            <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>▾</span>
          </button>
          <div id="stats-sort-menu" className="stats-sort-menu" hidden={!sortMenuOpen}>
            {(Object.keys(SORT_LABELS) as StatsSortBy[]).map((s) => (
              <button
                key={s}
                type="button"
                className={`stats-sort-menu-item${filters.sortBy === s ? ' active' : ''}`}
                data-sort-type={s}
                onClick={() => setSortBy(s)}
              >
                {SORT_LABELS[s]}
              </button>
            ))}
          </div>
          <span className="stats-filter-badge stats-filter-badge--below" id="stats-sort-badge">
            {SORT_BADGE[filters.sortBy]}
          </span>
        </div>
      </div>

      {/* ── Panneau Elo (visible uniquement en mode Lichess + eloPanelOpen) ── */}
      {isLichess && filters.eloPanelOpen && (
        <div
          id="stats-filter-elo-panel"
          className="stats-filter-panel"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 50,
            marginTop: 4,
          }}
        >
          <div className="stats-filter-panel-head">
            <span className="stats-filter-title">Filtre Elo</span>
            <span className="stats-filter-value" id="stats-filter-elo-value">{eloLabel}</span>
          </div>

          {/* Slider min */}
          <div style={{ position: 'relative', height: 22, marginBottom: 6 }}>
            <div
              className="elo-range-fill"
              style={{
                position: 'absolute',
                top: '50%',
                transform: 'translateY(-50%)',
                height: 4,
                left: `${leftPct}%`,
                width: `${Math.max(0, rightPct - leftPct)}%`,
                background: 'rgba(122,174,203,0.7)',
                borderRadius: 3,
                pointerEvents: 'none',
              }}
            />
            {/* Track visuelle */}
            <div style={{
              position: 'absolute',
              top: '50%',
              transform: 'translateY(-50%)',
              left: 0, right: 0,
              height: 4,
              background: 'rgba(148,163,184,0.2)',
              borderRadius: 3,
              zIndex: 0,
            }} />
            <input
              id="elo-range-min"
              type="range"
              className="elo-range-input elo-range-min"
              min={ELO_MIN}
              max={ELO_MAX}
              step={50}
              value={filters.eloMin}
              style={{ zIndex: filters.eloMin > ELO_MAX - 300 ? 5 : 3 }}
              onChange={(e) => applyElo('min', Number(e.target.value))}
            />
            <input
              id="elo-range-max"
              type="range"
              className="elo-range-input elo-range-max"
              min={ELO_MIN}
              max={ELO_MAX}
              step={50}
              value={filters.eloMax}
              style={{ zIndex: 4 }}
              onChange={(e) => applyElo('max', Number(e.target.value))}
            />
          </div>

          {/* Affichage min / max */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>
            <span>{filters.eloMin}</span>
            <span>{filters.eloMax}</span>
          </div>

          {/* Bouton Confirmer */}
          <button
            type="button"
            className="stats-filter-btn"
            style={{ marginTop: 8, width: '100%' }}
            onClick={() => setFilter('eloPanelOpen', false)}
          >
            Confirmer
          </button>
        </div>
      )}
    </div>
  );
});
