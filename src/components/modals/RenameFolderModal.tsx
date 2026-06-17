import { useState, useEffect } from 'react';
import { useUiStore } from '@/stores/uiStore';
import { useRepertoireStore } from '@/stores/repertoireStore';
import { syncUserSettings } from '@/services/authService';
import { ModalBox } from './ModalBox';

export function RenameFolderModal() {
  const modal = useUiStore((s) => s.activeModal);
  const closeModal = useUiStore((s) => s.closeModal);
  const [name, setName] = useState('');

  useEffect(() => {
    if (modal?.type === 'rename-folder') {
      const folders = useRepertoireStore.getState().repFolders;
      setName(folders[modal.folderId] || '');
    }
  }, [modal]);

  const handleRename = () => {
    const trimmed = name.trim();
    if (!trimmed || modal?.type !== 'rename-folder') return;
    const store = useRepertoireStore.getState();
    const folders = { ...store.repFolders };
    folders[modal.folderId] = trimmed;
    store.setRepFolders(folders);
    closeModal();
    syncUserSettings();
  };

  return (
    <ModalBox title="Renommer le dossier">
      <input
        type="text"
        placeholder="Nouveau nom du dossier"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); }}
        autoFocus
      />
      <div className="modal-actions">
        <button className="ctrl-btn" onClick={closeModal}>Annuler</button>
        <button className="ctrl-btn ctrl-btn--primary" onClick={handleRename} disabled={!name.trim()}>
          Renommer
        </button>
      </div>
    </ModalBox>
  );
}
