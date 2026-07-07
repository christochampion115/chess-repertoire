import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { logoutSession } from '@/services/authService';
import { ModalBox } from './ModalBox';

export function ProfileModal() {
  const closeModal = useUiStore((s) => s.closeModal);
  const user = useAuthStore((s) => s.user);

  if (!user) {
    return (
      <ModalBox title="" onClose={closeModal}>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>Connectez-vous pour voir votre profil.</p>
        <div className="modal-actions" style={{ justifyContent: 'center', marginTop: 16 }}>
          <button className="ctrl-btn" onClick={closeModal}>Fermer</button>
        </div>
      </ModalBox>
    );
  }

  return <ProfileModalInner user={user} onClose={closeModal} />;
}

function ProfileModalInner({ user, onClose }: { user: NonNullable<ReturnType<typeof useAuthStore.getState>['user']>; onClose: () => void }) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'stats'>('settings');
  const [username, setUsername] = useState(user.username ?? '');
  const [email, setEmail] = useState(user.email ?? '');
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [message, setMessage] = useState<{ text: string; color?: string } | null>(null);

  const saveUsername = () => setMessage({ text: 'Modification du pseudo disponible prochainement.' });
  const saveEmail = () => setMessage({ text: "Association d'e-mail disponible prochainement." });
  const savePassword = () => setMessage({ text: 'Modification du mot de passe disponible prochainement.' });

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logoutSession();
    onClose();
  };

  return (
    <ModalBox title="" onClose={onClose}>
      {/* Onglets */}
      <div className="profile-modal-tabs">
        <button
          className={'profile-tab' + (activeTab === 'settings' ? ' active' : '')}
          onClick={() => setActiveTab('settings')}
        >
          Paramètres
        </button>
        <button
          className={'profile-tab' + (activeTab === 'stats' ? ' active' : '')}
          onClick={() => setActiveTab('stats')}
        >
          Statistiques
        </button>
      </div>

      {/* Onglet : Paramètres */}
      {activeTab === 'settings' && (
        <div className="profile-tab-content">
          <section className="profile-section">
            <h4 className="profile-section-heading">Paramètres du compte</h4>

            <div className="profile-field">
              <label>Pseudo</label>
              <div className="profile-field-row">
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Votre pseudo" autoComplete="username" />
                <button className="ctrl-btn" onClick={saveUsername}>Enregistrer</button>
              </div>
            </div>

            <div className="profile-field">
              <label>Adresse e-mail</label>
              <div className="profile-field-row">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="votre@email.com" autoComplete="email" />
                <button className="ctrl-btn" onClick={saveEmail}>Enregistrer</button>
              </div>
            </div>

            <div className="profile-field">
              <label>Mot de passe</label>
              <div className="profile-field-row">
                <input type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} placeholder="Mot de passe actuel" autoComplete="current-password" />
                <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="Nouveau mot de passe" autoComplete="new-password" />
                <button className="ctrl-btn" onClick={savePassword}>Modifier</button>
              </div>
            </div>

            {message && (
              <div id="profile-account-message" style={{ color: message.color ?? 'var(--text-muted)' }}>
                {message.text}
              </div>
            )}
          </section>

          <section className="profile-section">
            <h4 className="profile-section-heading">Paramètres du site</h4>
            <p className="profile-section-empty">Options à venir…</p>
          </section>
        </div>
      )}

      {/* Onglet : Statistiques */}
      {activeTab === 'stats' && (
        <div className="profile-tab-content">
          <p className="profile-section-empty">Statistiques à venir…</p>
        </div>
      )}

      {/* Actions */}
      <div className="modal-actions" style={{ marginTop: 24 }}>
        <button className="ctrl-btn danger" onClick={handleLogout} disabled={isLoggingOut}>
          {isLoggingOut ? 'Déconnexion...' : 'Se déconnecter'}
        </button>
        <button className="ctrl-btn" onClick={onClose}>Fermer</button>
      </div>
    </ModalBox>
  );
}
