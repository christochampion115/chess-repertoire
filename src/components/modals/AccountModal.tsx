import { useState, useEffect } from 'react';
import { useUiStore } from '@/stores/uiStore';
import { syncUserSettings } from '@/services/authService';
import { ModalBox } from './ModalBox';

export function AccountModal() {
  const closeModal = useUiStore((s) => s.closeModal);
  const [username, setUsername] = useState('');

  const USERNAME_KEY = 'alphaChess.username';

  useEffect(() => {
    try {
      const saved = localStorage.getItem(USERNAME_KEY);
      if (saved) setUsername(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const handleSave = () => {
    try {
      localStorage.setItem(USERNAME_KEY, JSON.stringify(username.trim()));
    } catch { /* ignore */ }
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
