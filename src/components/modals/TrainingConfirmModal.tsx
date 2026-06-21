import { useState } from 'react';
import { useUiStore } from '@/stores/uiStore';
import { getPendingTrainingInfo, setPendingTrainingMode, setPendingTrainingIncludeOutOfScope, confirmTrainingStart } from '@/services/training';
import { nodeMap, navigateToNode } from '@/services/repertoire';
import type { TrainingMode } from '@/types/training';
import { ModalBox } from './ModalBox';

const TRAINING_MODES: Record<TrainingMode, { label: string; description: string }> = {
  survival: { label: 'Survie', description: '3 vies, les erreurs font avancer la ligne, objectif: couvrir tout le répertoire.' },
  horizontal: { label: 'Mode horizontal', description: 'Va au bout d\'une variante, puis remonte à la bifurcation la plus proche de sa fin.' },
  vertical: { label: 'Mode vertical', description: 'Fait tous les coups 1, puis tous les coups 2, puis tous les coups 3.' },
  express: { label: 'Express', description: 'Teste uniquement les positions finales des lignes, sans reroll depuis le départ.' },
  randomizer: { label: 'Randomizer', description: 'Affiche des positions de test totalement au hasard dans l\'arbre, sans reroll.' },
};

function getPathString(nodeId: string): string {
  const parts: string[] = [];
  let cur = nodeMap.get(nodeId);
  while (cur && cur.parentId) {
    parts.unshift(cur.san);
    cur = nodeMap.get(cur.parentId);
  }
  return parts.join(' ');
}

export function TrainingConfirmModal() {
  const closeModal = useUiStore((s) => s.closeModal);
  const info = getPendingTrainingInfo();
  const [mode, setMode] = useState<TrainingMode>(info.mode);
  const [includeOutOfScope, setIncludeOutOfScope] = useState(info.includeOutOfScope);

  const handleModeChange = (m: TrainingMode) => {
    setMode(m);
    setPendingTrainingMode(m);
  };

  const handleIncludeChange = (val: boolean) => {
    setIncludeOutOfScope(val);
    setPendingTrainingIncludeOutOfScope(val);
  };

  const handleStart = () => {
    setPendingTrainingMode(mode);
    closeModal();
    confirmTrainingStart();
  };

  const handleNavigateTo = (nodeId: string) => {
    const node = nodeMap.get(nodeId);
    if (!node) return;
    closeModal();
    navigateToNode(nodeId);
  };

  return (
    <ModalBox title="Choisir un mode d'entraînement" onClose={closeModal}>
      <div className="modal-body">
        {/* Lignes sans réponse */}
        {info.missingNodes.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div className="training-warning-header">
              ⚠ Il manque une réponse {info.color === 'w' ? 'blanche' : 'noire'} sur {info.missingNodes.length} ligne(s) :
            </div>
            <div style={{ marginTop: 4 }}>
              {info.missingNodes.slice(0, 3).map((n) => (
                <div
                  key={n.id}
                  className="training-line-link"
                  onClick={() => handleNavigateTo(n.id)}
                  title="Accéder à cette ligne"
                >
                  • {getPathString(n.id) || n.san}
                </div>
              ))}
            </div>
            {info.missingNodes.length > 3 && (
              <div className="training-line-more">
                …et {info.missingNodes.length - 3} autre(s) ligne(s).
              </div>
            )}
            <div className="training-hint">
              Ces lignes seront ignorées pendant l'entraînement.
            </div>
          </div>
        )}

        {/* Transpositions hors-variante */}
        {info.outOfScopeTranspos.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div className="training-warning-header">
              ↔ {info.outOfScopeTranspos.length} transposition(s) vers une autre variante :
            </div>
            <div style={{ marginTop: 4 }}>
              {info.outOfScopeTranspos.slice(0, 3).map((n) => (
                <div
                  key={n.id}
                  className="training-line-link"
                  onClick={() => handleNavigateTo(n.id)}
                  title="Accéder à cette ligne"
                >
                  • {getPathString(n.id) || n.san}
                </div>
              ))}
            </div>
            {info.outOfScopeTranspos.length > 3 && (
              <div className="training-line-more">
                …et {info.outOfScopeTranspos.length - 3} autre(s).
              </div>
            )}
            {mode === 'survival' ? (
              <div className="training-hint">
                Ces lignes sont ignorées en mode Survie.
              </div>
            ) : (
              <label className="training-checkbox-label">
                <input type="checkbox" checked={includeOutOfScope} onChange={(e) => handleIncludeChange(e.target.checked)} />
                Inclure ces lignes dans l'entraînement
              </label>
            )}
          </div>
        )}

        {/* Mode selector title */}
        <div className="training-mode-title">
          Choisissez un mode d'entraînement :
        </div>

        {/* Survival — full width */}
        <div className="training-mode-survival-wrap">
          <button
            type="button"
            className={'training-mode-option training-mode-option-survival' + (mode === 'survival' ? ' active' : '')}
            onClick={() => handleModeChange('survival')}
            data-selected={mode === 'survival' ? 'true' : undefined}
          >
            <div style={{ fontWeight: 600, fontSize: '0.85em' }}>{TRAINING_MODES.survival.label}</div>
            <div style={{ fontSize: '0.75em', color: 'var(--text-muted)', marginTop: 2 }}>{TRAINING_MODES.survival.description}</div>
          </button>
        </div>

        {/* Other modes — grid */}
        <div className="training-mode-options">
          {(['horizontal', 'vertical', 'express', 'randomizer'] as TrainingMode[]).map((modeId) => {
            const m = TRAINING_MODES[modeId];
            return (
              <button
                key={modeId}
                type="button"
                className={'training-mode-option' + (mode === modeId ? ' active' : '')}
                onClick={() => handleModeChange(modeId)}
                data-selected={mode === modeId ? 'true' : undefined}
              >
                <div style={{ fontWeight: 600, fontSize: '0.82em' }}>{m.label}</div>
                <div style={{ fontSize: '0.72em', color: 'var(--text-muted)', marginTop: 2 }}>{m.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="modal-actions" style={{ marginTop: 16 }}>
        <button className="ctrl-btn" onClick={closeModal}>Annuler</button>
        <button className="ctrl-btn ctrl-btn--primary" onClick={handleStart}>Démarrer</button>
      </div>
    </ModalBox>
  );
}
