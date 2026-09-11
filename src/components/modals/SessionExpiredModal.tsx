import { useState } from 'react';
import { useUiStore } from '@/stores/uiStore';
import { logoutSession } from '@/services/authService';

export function SessionExpiredModal() {
  const closeModal = useUiStore((s) => s.closeModal);
  const openModal = useUiStore((s) => s.openModal);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleReconnect = () => {
    // Les données locales sont conservées — elles seront fusionnées au login
    openModal({ type: 'auth' });
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logoutSession();
    closeModal();
  };

  return (
    <div id="modal-overlay" style={{ display: 'flex' }}>
      <div className="modal-box" style={{ display: 'block', maxWidth: 420, textAlign: 'center' }}>
        <div className="modal-body">
          <div className="splash-logo" style={{ margin: '0 auto 16px' }}>A</div>
          <h3 style={{ marginBottom: 12 }}>Session expirée</h3>
          <p style={{ color: '#cbd5e1', marginBottom: 24, fontSize: '0.9rem' }}>
            Votre session a expiré. Reconnectez-vous pour continuer — vos modifications locales
            sont conservées et seront synchronisées.
          </p>
          <button
            className="splash-btn primary"
            onClick={handleReconnect}
            disabled={isLoggingOut}
            style={{ width: '100%', marginBottom: 10 }}
          >
            Se reconnecter
          </button>
          <button
            className="splash-btn"
            onClick={handleLogout}
            disabled={isLoggingOut}
            style={{ width: '100%' }}
          >
            {isLoggingOut ? 'Déconnexion...' : 'Se déconnecter'}
          </button>
        </div>
      </div>
    </div>
  );
}
