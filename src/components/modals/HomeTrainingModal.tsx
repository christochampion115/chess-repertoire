import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useRepertoireStore } from '@/stores/repertoireStore';
import { prepareTraining, setPendingTrainingMode, confirmTrainingStart } from '@/services/training';
import type { TrainingMode } from '@/types/training';
import type { RepertoireNode } from '@/types/repertoire';
import { ModalBox } from './ModalBox';

const TRAINING_MODES: Record<TrainingMode, { label: string; description: string }> = {
  survival: { label: 'Survie', description: '3 vies, les erreurs font avancer la ligne, objectif: couvrir tout le répertoire.' },
  horizontal: { label: 'Mode horizontal', description: 'Va au bout d\'une variante, puis remonte à la bifurcation la plus proche de sa fin.' },
  vertical: { label: 'Mode vertical', description: 'Fait tous les coups 1, puis tous les coups 2, puis tous les coups 3.' },
  express: { label: 'Express', description: 'Teste uniquement les positions finales des lignes, sans reroll depuis le départ.' },
  randomizer: { label: 'Randomizer', description: 'Affiche des positions de test totalement au hasard dans l\'arbre, sans reroll.' },
};

function findNodeById(node: RepertoireNode, id: string): RepertoireNode | null {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return null;
}

interface VariantEntry {
  node: RepertoireNode;
  children: VariantEntry[];
}

function collectVariantTree(node: RepertoireNode): VariantEntry[] {
  const result: VariantEntry[] = [];
  for (const child of node.children) {
    if (child.varName && child.varName.length > 0) {
      result.push({ node: child, children: collectVariantTree(child) });
    } else {
      result.push(...collectVariantTree(child));
    }
  }
  return result;
}

export function HomeTrainingModal() {
  const closeModal = useUiStore((s) => s.closeModal);
  const openModal = useUiStore((s) => s.openModal);
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const repertoires = useRepertoireStore((s) => s.repertoires);
  const activeRepIndex = useRepertoireStore((s) => s.activeRepIndex);

  const [selectedIdx, setSelectedIdx] = useState<number | null>(() =>
    repertoires.length > 0
      ? (activeRepIndex >= 0 && activeRepIndex < repertoires.length ? activeRepIndex : 0)
      : null
  );
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (repertoires.length === 0) return null;
    const idx = activeRepIndex >= 0 && activeRepIndex < repertoires.length ? activeRepIndex : 0;
    return repertoires[idx].id;
  });
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<TrainingMode>('vertical');

  const handleStart = () => {
    if (selectedIdx === null || !repertoires[selectedIdx] || !selectedId) return;
    const rep = repertoires[selectedIdx];
    const repColor = rep.color ?? 'w';

    if (selectedId === rep.id) {
      prepareTraining(rep, repColor);
    } else {
      const targetNode = findNodeById(rep, selectedId);
      if (!targetNode) return;
      prepareTraining(targetNode, repColor);
    }

    setPendingTrainingMode(mode);
    navigate('/app');
    confirmTrainingStart();
    closeModal();
  };

  const handleSelectRep = (idx: number) => {
    setSelectedIdx(idx);
    setSelectedId(repertoires[idx].id);
    setExpandedIds(new Set());
  };

  const handleModeChange = (m: TrainingMode) => {
    setMode(m);
  };

  const selectNode = (nodeId: string) => {
    setSelectedId(nodeId);
  };

  const toggleExpand = (nodeId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  return (
    <ModalBox title="Lancer un entraînement" onClose={closeModal} width={540}>
      <div className="modal-body">
        {repertoires.length === 0 ? (
          <div className="htr-status-msg">
            {!user ? (
              <>Aucun répertoire pour l&apos;instant. Créez un compte pour sauvegarder vos répertoires ou créez-en un en mode invité depuis l&apos;éditeur.</>
            ) : (
              <>Aucun répertoire — créez-en un d&apos;abord depuis l&apos;éditeur.</>
            )}
          </div>
        ) : (
          <>
            <div className="htr-section-label" style={{ marginBottom: 8 }}>Choisir un répertoire</div>
            <div className="htr-rep-list">
              {repertoires.map((rep, idx) => {
                const isSelected = selectedIdx === idx;
                const variantTree = collectVariantTree(rep);
                const isExpanded = expandedIds.has(rep.id);
                const hasVariants = variantTree.length > 0;
                const rootSelected = selectedId === rep.id;

                return (
                  <div key={rep.id} className={'htr-rep-item' + (isSelected ? ' active' : '')}>
                    <div
                      className={'htr-rep-btn' + (rootSelected ? ' selected' : '')}
                      onClick={() => {
                        if (isSelected) {
                          selectNode(rep.id);
                        } else {
                          handleSelectRep(idx);
                        }
                      }}
                      data-selected={rootSelected ? 'true' : 'false'}
                    >
                      <span className={'htr-rep-color-dot htr-rep-color-dot--' + (rep.color || 'w')} />
                      <span className="htr-rep-name">{rep.name || `Répertoire ${idx + 1}`}</span>
                      {hasVariants && (
                        <span
                          className="htr-tree-arrow"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (expandedIds.has(rep.id)) {
                              toggleExpand(rep.id);
                            } else {
                              if (!isSelected) {
                                handleSelectRep(idx);
                              } else if (selectedId === null) {
                                selectNode(rep.id);
                              }
                              toggleExpand(rep.id);
                            }
                          }}
                        >
                          {isExpanded ? '▾' : '▸'}
                        </span>
                      )}
                    </div>

                    {isSelected && isExpanded && hasVariants && (
                      <div className="htr-tree-children">
                        <div className="htr-tree-row" onClick={() => selectNode(rep.id)}>
                          <input type="checkbox" className="htr-tree-cb" checked={rootSelected} readOnly />
                          <span className="htr-tree-label">Tout le répertoire</span>
                        </div>
                        {variantTree.map(entry => (
                          <VariantTreeItem
                            key={entry.node.id}
                            node={entry.node}
                            subEntries={entry.children}
                            depth={1}
                            selectedId={selectedId}
                            expandedIds={expandedIds}
                            onSelect={selectNode}
                            onToggleExpand={toggleExpand}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {repertoires.length === 0 && !user && (
          <div className="modal-actions" style={{ marginTop: 12 }}>
            <button className="ctrl-btn" onClick={() => { closeModal(); openModal({ type: 'auth' }); }}>
              Se connecter
            </button>
            <button className="ctrl-btn" onClick={() => { closeModal(); openModal({ type: 'new-repertoire' }); }}>
              Créer un répertoire
            </button>
          </div>
        )}

        {repertoires.length === 0 && user && (
          <div className="modal-actions" style={{ marginTop: 12 }}>
            <button className="ctrl-btn" onClick={() => { closeModal(); openModal({ type: 'new-repertoire' }); }}>
              Créer un répertoire
            </button>
          </div>
        )}

        {repertoires.length > 0 && (
          <>
            <div className="htr-section-label" style={{ marginTop: 18 }}>Mode d&apos;entraînement</div>

            <div className="htr-modes-grid">
              {(() => {
                const m = TRAINING_MODES.survival;
                return (
                  <button
                    type="button"
                    className={'htr-mode-btn htr-mode-survival' + (mode === 'survival' ? ' selected' : '')}
                    onClick={() => handleModeChange('survival')}
                    data-selected={mode === 'survival' ? 'true' : 'false'}
                  >
                    <span className="htr-mode-name">{m.label}</span>
                    <span className="htr-mode-desc">{m.description}</span>
                  </button>
                );
              })()}

              {(['horizontal', 'vertical', 'express', 'randomizer'] as TrainingMode[]).map((modeId) => {
                const m = TRAINING_MODES[modeId];
                return (
                  <button
                    key={modeId}
                    type="button"
                    className={'htr-mode-btn' + (mode === modeId ? ' selected' : '')}
                    onClick={() => handleModeChange(modeId)}
                    data-selected={mode === modeId ? 'true' : 'false'}
                  >
                    <span className="htr-mode-name">{m.label}</span>
                    <span className="htr-mode-desc">{m.description}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {repertoires.length > 0 && (
        <div className="modal-actions" style={{ marginTop: 4 }}>
          <button className="ctrl-btn" onClick={closeModal}>Annuler</button>
          <button className="ctrl-btn ctrl-btn--primary" onClick={handleStart} disabled={selectedId === null}>
            Démarrer →
          </button>
        </div>
      )}
    </ModalBox>
  );
}

/* ───────── Composant récursif pour l'arbre de variantes ───────── */

interface TreeItemProps {
  node: RepertoireNode;
  subEntries: VariantEntry[];
  depth: number;
  selectedId: string | null;
  expandedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
}

function VariantTreeItem({ node, subEntries, depth, selectedId, expandedIds, onSelect, onToggleExpand }: TreeItemProps) {
  const hasVariants = subEntries.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;
  const label = node.varName || 'Variante';

  return (
    <div>
      <div
        className="htr-tree-row"
        style={{ paddingLeft: 12 + depth * 20 }}
        onClick={() => onSelect(node.id)}
      >
        <input type="checkbox" className="htr-tree-cb" checked={isSelected} readOnly />
        <span className="htr-tree-label">{label}</span>
        {hasVariants && (
          <span
            className="htr-tree-arrow"
            onClick={(e) => {
              e.stopPropagation();
              if (expandedIds.has(node.id)) {
                onToggleExpand(node.id);
              } else {
                if (!isSelected) {
                  onSelect(node.id);
                }
                onToggleExpand(node.id);
              }
            }}
          >
            {isExpanded ? '▾' : '▸'}
          </span>
        )}
      </div>
      {isExpanded && hasVariants && (
        <div>
          {subEntries.map(entry => (
            <VariantTreeItem
              key={entry.node.id}
              node={entry.node}
              subEntries={entry.children}
              depth={depth + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}
