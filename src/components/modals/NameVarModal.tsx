import { useState, useEffect } from 'react';
import { useUiStore } from '@/stores/uiStore';
import { useRepertoireStore } from '@/stores/repertoireStore';
import { nodeMap, findNodeWithVarName, nameVariantNode, batchSetFolderId } from '@/services/repertoire';
import { loadState, saveState } from '@/services/storage';
import { syncUserSettings } from '@/services/authService';
import { type RepertoireNode } from '@/types/repertoire';
import { ModalBox } from './ModalBox';

const FOLDERS_KEY = 'alphaChess.repFolders';

function collectVariantFolderIds(root: RepertoireNode): Set<string> {
  const ids = new Set<string>();
  const walk = (n: RepertoireNode) => {
    for (const child of n.children) {
      if (child.varName && child.folderId) ids.add(child.folderId);
      walk(child);
    }
  };
  walk(root);
  return ids;
}

function isTopLevelVariant(nodeId: string): boolean {
  const { repertoires } = useRepertoireStore.getState();
  let current = nodeMap.get(nodeId);
  while (current?.parentId) {
    const parent = nodeMap.get(current.parentId);
    if (!parent) break;
    if (parent.varName) return false;
    if (repertoires.some(r => r.id === parent.id)) return true;
    current = parent;
  }
  return true;
}

function findRootRep(store: ReturnType<typeof useRepertoireStore.getState>, nodeId: string): RepertoireNode | null {
  const isInTree = (n: RepertoireNode): boolean => {
    if (n.id === nodeId) return true;
    return n.children.some(isInTree);
  };
  for (const rep of store.repertoires) {
    if (isInTree(rep)) return rep;
  }
  if (store.freePlayRoot && isInTree(store.freePlayRoot)) return store.freePlayRoot;
  return null;
}

export function NameVarModal() {
  const modal = useUiStore((s) => s.activeModal);
  const closeModal = useUiStore((s) => s.closeModal);
  const repFolders = useRepertoireStore((s) => s.repFolders);
  const [name, setName] = useState('');
  const [hint, setHint] = useState('');
  const [originalName, setOriginalName] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string>('__none__');
  const [folderName, setFolderName] = useState('');

  useEffect(() => {
    if (modal?.type !== 'name-variant') return;
    const node = nodeMap.get(modal.nodeId);
    if (!node) return;
    const existing = node.varName || '';
    setName(existing);
    setOriginalName(existing);
    setHint(existing ? `⚠️ Ce coup est déjà nommé "${existing}" — vous pouvez modifier le nom.` : '');
    if (node.folderId) {
      setSelectedFolderId(node.folderId);
      setFolderName(repFolders[node.folderId] || '');
    } else {
      setSelectedFolderId('__none__');
      setFolderName('');
    }
  }, [modal, repFolders]);

  const handleSave = () => {
    if (modal?.type !== 'name-variant') return;
    const trimmed = name.trim();
    if (!trimmed) return;

    if (trimmed !== originalName) {
      const { repertoires, activeRepIndex } = useRepertoireStore.getState();
      const rep = activeRepIndex >= 0 ? repertoires[activeRepIndex] : null;
      if (rep) {
        const existing = findNodeWithVarName(rep, trimmed, modal.nodeId);
        if (existing) {
          setHint(`⚠️ Le nom "${trimmed}" est déjà utilisé par "${existing.san}". Choisissez un autre nom.`);
          return;
        }
      }
    }

    setHint('');
    nameVariantNode(modal.nodeId, trimmed);

    if (isTopLevelVariant(modal.nodeId) && selectedFolderId !== '__none__') {
      let fid = selectedFolderId;
      if (fid === '__new__') {
        const fname = folderName.trim();
        if (fname) {
          fid = 'folder_' + Math.random().toString(36).substr(2, 9);
          const folders = loadState<Record<string, string>>(FOLDERS_KEY) || {};
          folders[fid] = fname;
          saveState(FOLDERS_KEY, folders);
          useRepertoireStore.getState().setRepFolders({ ...folders });
        }
      }
      if (fid !== '__new__') {
        batchSetFolderId([modal.nodeId], fid!);
      }
    }

    syncUserSettings();
    closeModal();
  };

  const handleCancel = () => {
    setHint('');
    closeModal();
  };

  const isTopLevel = modal?.type === 'name-variant'
    ? isTopLevelVariant(modal.nodeId)
    : false;

  const availableFolders = (() => {
    if (!isTopLevel || modal?.type !== 'name-variant' || !modal.nodeId) return [];
    const root = findRootRep(useRepertoireStore.getState(), modal.nodeId);
    if (!root) return [];
    const usedIds = collectVariantFolderIds(root);
    return Object.entries(repFolders)
      .filter(([id]) => usedIds.has(id))
      .map(([id, name]) => ({ id, name }));
  })();

  return (
    <ModalBox title="Nommer la variante">
      {hint && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 8 }}>
          {hint}
        </p>
      )}
      <input
        type="text"
        placeholder="Nom de la variante"
        value={name}
        onChange={(e) => { setName(e.target.value); setHint(''); }}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
        autoFocus
        style={{ marginBottom: 10 }}
      />

      {isTopLevel && (
        <>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            Dossier (optionnel)
          </label>
          <select
            value={selectedFolderId}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedFolderId(val);
              if (val !== '__new__' && val !== '__none__') {
                setFolderName(repFolders[val] || '');
              }
            }}
            style={{ padding: '6px 8px', width: '100%', marginBottom: selectedFolderId === '__new__' ? 6 : 0 }}
          >
            <option value="__none__">— Aucun dossier —</option>
            {availableFolders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
            <option value="__new__">+ Nouveau dossier…</option>
          </select>
          {selectedFolderId === '__new__' && (
            <input
              type="text"
              placeholder="Nom du nouveau dossier"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              style={{ padding: '6px 8px', width: '100%' }}
            />
          )}
        </>
      )}

      <div className="modal-actions" style={{ marginTop: 12 }}>
        <button className="ctrl-btn" onClick={handleCancel}>Annuler</button>
        <button className="ctrl-btn ctrl-btn--primary" onClick={handleSave}>
          Enregistrer
        </button>
      </div>
    </ModalBox>
  );
}
