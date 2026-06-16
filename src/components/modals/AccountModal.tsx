import { useState, useEffect } from 'react';
import { useUiStore } from '@/stores/uiStore';
import { ModalBox } from './ModalBox';

export function AccountModal() {
  const closeModal = useUiStore((s) => s.closeModal);
  const [username, setUsername] = useState('');

const USERNAME_KEY = 'alphaChess.username';

  useEffect(() => {
    (async () => {
      const { loadState } = await import('@/jsBridge');
      setUsername(loadState(USERNAME_KEY) || '');
    })();
  }, []);

  const handleSave = async () => {
    const { saveState, state, syncUserSettings } = await import('@/jsBridge');
    saveState(USERNAME_KEY, username.trim());
    state.username = username.trim();
    syncUserSettings();
    closeModal();
  };

  return (
    <ModalBox title="Compte">
      <label style={{ display: 'block', marginBottom: 8, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        Pseudo
      </label>
      <input
        type="text"
        placeholder="Votre pseudo"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
        autoFocus
      />
      <div className="modal-actions">
        <button className="ctrl-btn" onClick={closeModal}>Annuler</button>
        <button className="ctrl-btn ctrl-btn--primary" onClick={handleSave}>Enregistrer</button>
      </div>
    </ModalBox>
  );
}
