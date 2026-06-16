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
            <div style={{ fontSize: '0.9em', color: '#666' }}>
              <b>⚠️ Il manque une réponse {info.color === 'w' ? 'blanche' : 'noire'} sur {info.missingNodes.length} ligne(s) :</b>
            </div>
            <div style={{ marginTop: 4 }}>
              {info.missingNodes.slice(0, 3).map((n) => (
                <div
                  key={n.id}
                  style={{ fontSize: '0.85em', color: '#4a9eff', cursor: 'pointer', textDecoration: 'underline', padding: '1px 0' }}
                  onClick={() => handleNavigateTo(n.id)}
                  title="Cliquer pour accéder à cette ligne"
                >
                  • {getPathString(n.id) || n.san}
                </div>
              ))}
            </div>
            {info.missingNodes.length > 3 && (
              <div style={{ fontSize: '0.85em', color: '#888', marginTop: 4 }}>
                …et {info.missingNodes.length - 3} autre(s) ligne(s).
              </div>
            )}
            <div style={{ fontSize: '0.85em', color: '#999', marginTop: 4, fontStyle: 'italic' }}>
              Ces lignes seront ignorées pendant l'entraînement.
            </div>
          </div>
        )}

        {/* Transpositions hors-variante */}
        {info.outOfScopeTranspos.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: '0.9em', color: '#666' }}>
              <b>↔️ {info.outOfScopeTranspos.length} transposition(s) vers une autre variante :</b>
            </div>
            <div style={{ fontSize: '0.85em', color: '#888', marginTop: 4 }}>
              {info.outOfScopeTranspos.slice(0, 3).map((n) => (
                <div
                  key={n.id}
                  style={{ fontSize: '0.85em', color: '#4a9eff', cursor: 'pointer', textDecoration: 'underline', padding: '1px 0' }}
                  onClick={() => handleNavigateTo(n.id)}
                  title="Cliquer pour accéder à cette ligne"
                >• {getPathString(n.id) || n.san}</div>
              ))}
            </div>
            {info.outOfScopeTranspos.length > 3 && (
              <div style={{ fontSize: '0.85em', color: '#888', marginTop: 4 }}>
                …et {info.outOfScopeTranspos.length - 3} autre(s).
              </div>
            )}
            {mode === 'survival' ? (
              <div style={{ fontSize: '0.85em', color: '#999', marginTop: 4, fontStyle: 'italic' }}>
                Ces lignes sont ignorées en mode Survie.
              </div>
            ) : (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: '0.85em', color: '#bbb', cursor: 'pointer' }}>
                <input type="checkbox" checked={includeOutOfScope} onChange={(e) => handleIncludeChange(e.target.checked)} />
                Inclure ces lignes dans l'entraînement
              </label>
            )}
          </div>
        )}

        {/* Mode selector — Survival (full-width) */}
        <div style={{ fontSize: '0.95em', color: '#ccc', marginBottom: 8 }}>
          Choisissez un mode d'entraînement :
        </div>

        {/* Survival — full width */}
        {(() => {
          const m = TRAINING_MODES.survival;
          return (
            <button
              type="button"
              onClick={() => handleModeChange('survival')}
              style={{
                display: 'block',
                width: '100%',
                padding: '10px 12px',
                marginBottom: 8,
                border: mode === 'survival' ? '2px solid #fbbf24' : '1px solid #444',
                borderRadius: 6,
                background: mode === 'survival' ? 'rgba(251,191,36,0.1)' : 'transparent',
                color: '#ddd',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '0.95em' }}>{m.label}</div>
              <div style={{ fontSize: '0.8em', color: '#888', marginTop: 2 }}>{m.description}</div>
            </button>
          );
        })()}

        {/* Other modes — grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {(['horizontal', 'vertical', 'express', 'randomizer'] as TrainingMode[]).map((modeId) => {
            const m = TRAINING_MODES[modeId];
            return (
              <button
                key={modeId}
                type="button"
                onClick={() => handleModeChange(modeId)}
                style={{
                  padding: '8px 10px',
                  border: mode === modeId ? '2px solid #4a9eff' : '1px solid #444',
                  borderRadius: 6,
                  background: mode === modeId ? 'rgba(74,158,255,0.1)' : 'transparent',
                  color: '#ddd',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.85em' }}>{m.label}</div>
                <div style={{ fontSize: '0.75em', color: '#888', marginTop: 2 }}>{m.description}</div>
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