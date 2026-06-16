import { useState, useEffect, useMemo } from 'react';
import { useUiStore } from '@/stores/uiStore';
import { useRepertoireStore } from '@/stores/repertoireStore';
import { nodeMap, batchSetFolderId, cleanupOrphanedFolders } from '@/services/repertoire';
import { loadState, saveState } from '@/bridge/storage';
import { syncUserSettings } from '@/services/authService';
import type { RepertoireNode } from '@/types/repertoire';
import { ModalBox } from './ModalBox';

const FOLDERS_KEY = 'alphaChess.repFolders';

function collectSiblingVariants(target: RepertoireNode): RepertoireNode[] {
  const { repertoires, activeRepIndex } = useRepertoireStore.getState();
  const rep = activeRepIndex >= 0 ? repertoires[activeRepIndex] : null;
  if (!rep) return [];

  let visualParent = target.parentId ? nodeMap.get(target.parentId) ?? null : null;
  while (visualParent && visualParent.id !== rep.id && !visualParent.varName) {
    visualParent = visualParent.parentId ? nodeMap.get(visualParent.parentId) ?? null : null;
  }
  if (!visualParent) visualParent = rep;

  const result: RepertoireNode[] = [];
  function walk(n: RepertoireNode) {
    for (const c of n.children) {
      if (c.varName) result.push(c);
      walk(c);
    }
  }
  walk(visualParent);
  return result;
}

function foldersAvailableForType(
  isRepMode: boolean,
): Array<{ id: string; name: string }> {
  const store = useRepertoireStore.getState();

  return Object.entries(store.repFolders)
    .filter(([id]) => {
      if (isRepMode) {
        return !id.startsWith('variant_');
      }
      return !store.repertoires.some(r => r.folderId === id);
    })
    .map(([id, name]) => ({ id, name }));
}

function hasDuplicateName(name: string, checkFolderId: string | null): boolean {
  const store = useRepertoireStore.getState();
  const lower = name.toLowerCase();
  return Object.entries(store.repFolders).some(
    ([fid, fname]) => fname.toLowerCase() === lower && fid !== checkFolderId,
  );
}

export function FolderGroupModal() {
  const closeModal = useUiStore((s) => s.closeModal);
  const repFolders = useRepertoireStore((s) => s.repFolders);
  const menuTargetId = useRepertoireStore((s) => s.menuTargetId);
  const isRepMode = useRepertoireStore((s) => s.pendingDeleteType) === 'repertoire_item';
  const [error, setError] = useState('');

  const targetNode = useMemo(() => {
    if (!menuTargetId) return undefined;
    return nodeMap.get(menuTargetId) ?? undefined;
  }, [menuTargetId]);

  const items = useMemo(() => {
    if (!targetNode) return [];
    if (isRepMode) {
      const { repertoires } = useRepertoireStore.getState();
      return repertoires
        .map((r, i) => ({ node: r, idx: i }))
        .filter(({ node }) => node.color === targetNode.color);
    }
    return collectSiblingVariants(targetNode).map(n => ({ node: n, idx: -1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRepMode, targetNode?.id]);

  const existingFolderId = targetNode?.folderId ?? null;

  const availableFolders = useMemo(
    () => foldersAvailableForType(isRepMode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [repFolders, isRepMode],
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    if (targetNode) ids.add(targetNode.id);
    if (existingFolderId) {
      for (const { node } of items) {
        if (node.folderId === existingFolderId) ids.add(node.id);
      }
    }
    return ids;
  });
  const [folderName, setFolderName] = useState(
    existingFolderId ? (repFolders[existingFolderId] || '') : '',
  );
  const [selectedFolderId, setSelectedFolderId] = useState(existingFolderId || '__new__');

  useEffect(() => {
    cleanupOrphanedFolders();
  }, []);

  useEffect(() => {
    setSelectedIds(() => {
      const ids = new Set<string>();
      if (targetNode) ids.add(targetNode.id);
      if (existingFolderId) {
        for (const { node } of items) {
          if (node.folderId === existingFolderId) ids.add(node.id);
        }
      }
      return ids;
    });
    const fallback = existingFolderId && repFolders[existingFolderId] ? existingFolderId : '__new__';
    setFolderName(existingFolderId ? (repFolders[existingFolderId] || '') : '');
    setSelectedFolderId(fallback);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetNode?.id, existingFolderId, repFolders]);

  const handleToggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = () => {
    setError('');
    const trimmed = folderName.trim();
    if (!trimmed) { setError('Veuillez entrer un nom de dossier.'); return; }

    if (hasDuplicateName(trimmed, selectedFolderId === '__new__' ? null : selectedFolderId)) {
      setError('Un dossier avec ce nom existe déjà.');
      return;
    }

    const folders = loadState<Record<string, string>>(FOLDERS_KEY) || {};
    let fid = selectedFolderId;
    if (fid === '__new__') {
      fid = 'folder_' + Math.random().toString(36).substr(2, 9);
    }
    folders[fid!] = trimmed;
    saveState(FOLDERS_KEY, folders);
    useRepertoireStore.getState().setRepFolders({ ...folders });

    batchSetFolderId(Array.from(selectedIds), fid!);
    syncUserSettings();
    closeModal();
  };

  const handleRemoveFolder = () => {
    if (!existingFolderId) { closeModal(); return; }
    const ids = items
      .filter(({ node }) => node.folderId === existingFolderId)
      .map(({ node }) => node.id);
    batchSetFolderId(ids, null);

    const folders = loadState<Record<string, string>>(FOLDERS_KEY) || {};
    delete folders[existingFolderId];
    saveState(FOLDERS_KEY, folders);
    useRepertoireStore.getState().setRepFolders({ ...folders });
    syncUserSettings();
    closeModal();
  };

  return (
    <ModalBox title={isRepMode ? '📁 Grouper des répertoires' : '📁 Grouper des variantes'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Dossier</label>
          <select
            value={selectedFolderId}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedFolderId(val);
              setError('');
              if (val !== '__new__') {
                setFolderName(repFolders[val] || '');
              }
            }}
            style={{ padding: '6px 8px' }}
          >
            <option value="__new__">+ Nouveau dossier…</option>
            {availableFolders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Nom du dossier"
            value={folderName}
            onChange={e => { setFolderName(e.target.value); setError(''); }}
            style={{ padding: '6px 8px' }}
          />
          {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: 0 }}>{error}</p>}
        </div>

        <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map(({ node }) => (
            <label
              key={node.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px', borderRadius: 5, cursor: 'pointer',
                background: selectedIds.has(node.id) ? 'rgba(122,174,203,0.12)' : 'transparent',
              }}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(node.id)}
                onChange={() => handleToggle(node.id)}
              />
              <span style={{ fontSize: '0.9em' }}>
                {isRepMode ? (node.name || node.san) : (node.varName || node.san)}
              </span>
            </label>
          ))}
        </div>

        <div className="modal-actions">
          {existingFolderId && (
            <button
              className="ctrl-btn ctrl-btn--danger"
              onClick={handleRemoveFolder}
              style={{ marginRight: 'auto' }}
            >
              Enlever du dossier
            </button>
          )}
          <button className="ctrl-btn" onClick={closeModal}>Annuler</button>
          <button className="ctrl-btn ctrl-btn--primary" onClick={handleSave}>
            Enregistrer
          </button>
        </div>
      </div>
    </ModalBox>
  );
}
