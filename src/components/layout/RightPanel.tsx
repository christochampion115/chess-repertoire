import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Chess } from 'chess.js';
import { Monitor } from '@/components/monitor/Monitor';
import { AnalysisPanel } from '@/components/analysis/AnalysisPanel';
import { AnalysisRow } from '@/components/analysis/AnalysisRow';
import { CandidatesSection } from '@/components/analysis/CandidatesSection';
import { StatsFilterBar } from '@/components/analysis/StatsFilterBar';
import { Spinner } from '@/components/common/Spinner';
import { SurvivalMonitor } from '@/components/training/SurvivalMonitor';
import { useAnalysisStore } from '@/stores/analysisStore';
import { useChessStore } from '@/stores/chessStore';
import { useUiStore } from '@/stores/uiStore';
import { useRepertoireStore } from '@/stores/repertoireStore';
import { useStatsStore } from '@/stores/statsStore';
import { useTrainingStore } from '@/stores/trainingStore';
import * as repertoireService from '@/services/repertoire';
import { nodeMap, getVariantPath } from '@/services/repertoire';

function uciLineToSan(fen: string, uciLine: string): { bestMoveSan: string; pvSan: string } {
  const ucis = uciLine.split(/\s+/).filter(Boolean);
  const chess = new Chess();
  try { chess.load(fen); } catch { return { bestMoveSan: ucis[0] ?? '', pvSan: ucis.slice(1).join(' ') }; }
  const sans: string[] = [];
  for (const uci of ucis) {
    if (uci.length < 4) { sans.push(uci); continue; }
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? (uci[4] as 'n' | 'b' | 'r' | 'q') : undefined;
    try {
      const move = chess.move({ from, to, promotion });
      sans.push(move.san);
    } catch { sans.push(uci); }
  }
  return { bestMoveSan: sans[0] ?? '', pvSan: sans.slice(1).join(' ') };
}

/**
 * Colonne droite — structure plate game-monitor alignée sur le CSS vanilla.
 *
 * Sections (dans l'ordre du HTML original) :
 *   monitor-menu-trigger · monitor-header · monitor-pgn · monitor-comment ·
 *   opening-info · monitor-analysis-section · candidates-section
 */
export const RightPanel = React.memo(function RightPanel() {
  const isEnabled      = useAnalysisStore((s) => s.isEnabled);
  const toggle         = useAnalysisStore((s) => s.toggle);
  const results        = useAnalysisStore((s) => s.results);
  const chess          = useChessStore((s) => s.chess);
  const openModal      = useUiStore((s) => s.openModal);
  const activeRepIndex = useRepertoireStore((s) => s.activeRepIndex);
  const repertoires    = useRepertoireStore((s) => s.repertoires);
  const candidatesOpen = useStatsStore((s) => s.filters.candidatesOpen);
  const setFilter      = useStatsStore((s) => s.setFilter);
  const fen            = chess.fen();
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  const closeSettings = useCallback(() => setShowSettings(false), []);

  useEffect(() => {
    if (!showSettings) return;
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        closeSettings();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSettings, closeSettings]);
  const trainingPhase  = useTrainingStore((s) => s.phase);
  const trainingMode   = useTrainingStore((s) => s.mode);
  const trainingRoot   = useTrainingStore((s) => s.root);
  const isTraining = trainingPhase !== 'idle';
  const isSurvival = isTraining && trainingMode === 'survival';
  const currentNodeId  = useRepertoireStore((s) => s.currentNodeId);

  const monitorInfo = useMemo(() => {
    if (activeRepIndex < 0 || !repertoires[activeRepIndex]) {
      return { repName: 'Jeu Libre', varPath: [] as string[] };
    }
    if (isTraining && trainingRoot) {
      return getVariantPath(trainingRoot);
    }
    if (currentNodeId) {
      const node = nodeMap.get(currentNodeId);
      if (node) return getVariantPath(node);
    }
    return { repName: repertoires[activeRepIndex]?.name ?? 'Répertoire', varPath: [] as string[] };
  }, [activeRepIndex, repertoires, isTraining, trainingRoot, currentNodeId]);

  return (
    <>
    <div className="game-monitor" id="monitor-box">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="monitor-header">
          <div>
            <div className="monitor-title" id="mon-title">
              <span className="monitor-title-name">{monitorInfo.repName}</span>
              {monitorInfo.varPath.length > 0 && (
                <div className="monitor-title-vars">
                  {monitorInfo.varPath.join(', ')}
                </div>
              )}
            </div>
          </div>
          {!isTraining && (activeRepIndex >= 0 ? (
            <button className="btn-switch-freeplay" id="btn-switch-free-play" onClick={() => repertoireService.switchToFreePlay()}>Passer en jeu libre</button>
          ) : (
            <button className="btn-open-new-rep" id="btn-open-new-rep" onClick={() => openModal({ type: 'new-repertoire' })}>Créer un répertoire</button>
          ))}
        </div>

        {/* ── PGN + commentaire (Monitor) ────────────────────── */}
        <Monitor />

        {/* ── Ouverture (Phase 5) ────────────────────────────── */}
        <div id="opening-info" />

        {/* ── Moniteur Survie (remplace l'analyse en training survie) ── */}
        {isSurvival && <SurvivalMonitor />}

        {/* ── Section Analyse (masquée pendant l'entraînement) ─── */}
        {!isTraining && (
        <div className="monitor-analysis-section" id="monitor-analysis-section">
          <div className="monitor-analysis-header">

            {/* Titre + toggle switch */}
            <div className="monitor-analysis-title-row">
              <span className="monitor-analysis-title">Analyse</span>
              <label className="analysis-switch" htmlFor="analysis-toggle-switch">
                <input
                  type="checkbox"
                  id="analysis-toggle-switch"
                  checked={isEnabled}
                  onChange={toggle}
                />
                <span className="analysis-switch-track" />
              </label>
            </div>

            <div ref={settingsRef} style={{ display: 'contents' }}>
              {/* Bouton rouage paramètres (id analysis-depth-inline pour compat vanilla) */}
              {isEnabled && (
                <button
                  className="analysis-settings-btn"
                  id="analysis-settings-btn"
                  aria-expanded={showSettings}
                  onClick={() => setShowSettings((v) => !v)}
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="8" cy="8" r="2.5" />
                    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.5 2.5l1.5 1.5M12 12l1.5 1.5M2.5 13.5l1.5-1.5M12 4l1.5-1.5" />
                  </svg>
                </button>
              )}

              {/* Panneau déroulant paramètres — enfant du header pour position fixe */}
              {isEnabled && showSettings && (
                <AnalysisPanel />
              )}
            </div>
          </div>

          {/* Lignes de résultats */}
          <div id="analysis-panel">
            {isEnabled && results.length === 0 && (
              <div className="analysis-loading" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0' }}>
                <Spinner size="sm" />
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Analyse en cours…</span>
              </div>
            )}
            {isEnabled && results.map((line, idx) => {
              const { bestMoveSan, pvSan } = uciLineToSan(fen, line.pv);
              return (
                <AnalysisRow
                  key={idx}
                  line={line}
                  bestMoveSan={bestMoveSan}
                  pvSan={pvSan}
                />
              );
            })}
          </div>
        </div>
        )}

    </div>

    {/* COUPS CANDIDATS (masqué pendant l'entraînement) */}
    {!isTraining && (
    <div className="cands-section" id="cands-section">
      <button
        type="button"
        className="cands-toggle-btn"
        id="cands-toggle-btn"
        aria-expanded={candidatesOpen ? 'true' : 'false'}
        aria-controls="cands-body"
        onClick={() => setFilter('candidatesOpen', !candidatesOpen)}
      >
        <span>COUPS CANDIDATS</span>
        <span className="cands-arrow">▶</span>
      </button>
      <div className={`cands-body${candidatesOpen ? '' : ' is-collapsed'}`} id="cands-body">
        <div className="stats-filter-shell" id="stats-filter-shell">
          <StatsFilterBar />
        </div>
        <CandidatesSection />
        <div className="stats-details" id="stats-details" />
      </div>
    </div>
    )}
    </>);
});
