import React from 'react';
import { useAnalysisStore } from '@/stores/analysisStore';

/**
 * Panneau déroulant des paramètres d'analyse (profondeur, MultiPV, flèches).
 * Affiché quand le bouton rouage dans le header est cliqué.
 */
export const AnalysisPanel = React.memo(function AnalysisPanel() {
  const depth          = useAnalysisStore((s) => s.depth);
  const setDepth       = useAnalysisStore((s) => s.setDepth);
  const settings       = useAnalysisStore((s) => s.settings);
  const updateSettings = useAnalysisStore((s) => s.updateSettings);

  return (
    <div className="analysis-settings-panel" id="analysis-settings-panel">
      <div className="analysis-settings-body">
        {/* Profondeur */}
        <div className="analysis-settings-row">
          <span className="analysis-settings-label">Profondeur</span>
          <div className="analysis-settings-ctrl">
            <input
              className="analysis-settings-range"
              id="asettings-depth-input"
              type="range"
              min={5}
              max={20}
              step={1}
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
            />
            <span className="analysis-settings-val" id="asettings-depth-val">{depth}</span>
          </div>
        </div>

        {/* MultiPV */}
        <div className="analysis-settings-row">
          <span className="analysis-settings-label">Lignes</span>
          <div className="analysis-settings-ctrl">
            <input
              className="analysis-settings-range"
              id="asettings-multipv-input"
              type="range"
              min={1}
              max={5}
              step={1}
              value={settings.multiPV}
              onChange={(e) => updateSettings({ multiPV: Number(e.target.value) })}
            />
            <span className="analysis-settings-val" id="asettings-multipv-val">{settings.multiPV}</span>
          </div>
        </div>

        {/* Show arrows */}
        <div className="analysis-settings-row">
          <span className="analysis-settings-label">Flèches</span>
          <div className="analysis-settings-ctrl" style={{ justifyContent: 'flex-end' }}>
            <label className="analysis-settings-toggle">
              <input
                id="asettings-arrows-input"
                type="checkbox"
                checked={settings.showArrows}
                onChange={(e) => updateSettings({ showArrows: e.target.checked })}
              />
              <span className="analysis-settings-toggle-track" />
            </label>
          </div>
        </div>

        {/* Arrow count — only visible when arrows enabled */}
        {settings.showArrows && (
          <div className="analysis-settings-row" id="asettings-arrow-count-row">
            <span className="analysis-settings-label">Nb flèches</span>
            <div className="analysis-settings-ctrl">
              <input
                className="analysis-settings-range"
                id="asettings-arrow-count-input"
                type="range"
                min={1}
                max={settings.multiPV}
                step={1}
                value={Math.min(settings.arrowCount, settings.multiPV)}
                onChange={(e) => updateSettings({ arrowCount: Number(e.target.value) })}
              />
              <span className="analysis-settings-val" id="asettings-arrow-count-val">{Math.min(settings.arrowCount, settings.multiPV)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

