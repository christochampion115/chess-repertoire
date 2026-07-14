import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { useAnalysisStore } from '@/stores/analysisStore';
import { useChessStore } from '@/stores/chessStore';
import { useTrainingStore } from '@/stores/trainingStore';
import { AnalysisRow } from '@/components/analysis/AnalysisRow';
import { AnalysisPanel } from '@/components/analysis/AnalysisPanel';
import { Spinner } from '@/components/common/Spinner';

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

export const AnalysisTabContent = React.memo(function AnalysisTabContent() {
  const isEnabled     = useAnalysisStore((s) => s.isEnabled);
  const toggle        = useAnalysisStore((s) => s.toggle);
  const results       = useAnalysisStore((s) => s.results);
  const chess         = useChessStore((s) => s.chess);
  const trainingPhase = useTrainingStore((s) => s.phase);
  const isTraining    = trainingPhase !== 'idle';
  const fen           = chess.fen();
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

  if (isTraining) {
    return <div className="panel-empty">Analyse désactivée pendant l'entraînement</div>;
  }

  return (
    <div className="mobile-analysis-tab">
      <div className="mobile-analysis-header">
        <span className="mobile-analysis-title">Analyse</span>
        <label className="analysis-switch" htmlFor="analysis-toggle-switch-mobile">
          <input
            type="checkbox"
            id="analysis-toggle-switch-mobile"
            checked={isEnabled}
            onChange={toggle}
          />
          <span className="analysis-switch-track" />
        </label>
      </div>

      {isEnabled && (
        <div ref={settingsRef} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
          <button
            className="analysis-settings-btn"
            aria-expanded={showSettings}
            onClick={() => setShowSettings((v) => !v)}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="2.5" />
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.5 2.5l1.5 1.5M12 12l1.5 1.5M2.5 13.5l1.5-1.5M12 4l1.5-1.5" />
            </svg>
          </button>
          {showSettings && <AnalysisPanel />}
        </div>
      )}

      <div className="mobile-analysis-results">
        {isEnabled && results.length === 0 && (
          <div className="analysis-loading" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0' }}>
            <Spinner size="sm" />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Analyse en cours…</span>
          </div>
        )}
        {isEnabled && results.length > 0 && results.map((line, idx) => {
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
        {!isEnabled && (
          <div style={{ padding: '12px 0', fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            Analyse désactivée
          </div>
        )}
      </div>
    </div>
  );
});
