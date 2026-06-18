import { useState } from 'react';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { ModalBox } from './ModalBox';
import { loginWithCredentials, signupWithCredentials } from '@/services/authService';

export function AuthModal() {
  const closeModal = useUiStore((s) => s.closeModal);
  const error        = useAuthStore((s) => s.error);
  const isSubmitting = useAuthStore((s) => s.isSubmitting);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async () => {
    if (mode === 'login') {
      await loginWithCredentials({ email, password });
    } else {
      await signupWithCredentials({ username, password });
    }
    // Close modal on success (user will be set in store)
    if (useAuthStore.getState().user) {
      closeModal();
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login');
  };

  return (
    <ModalBox title={mode === 'login' ? 'Connexion' : 'Créer un compte'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        {mode === 'login' ? (
          <>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              style={{ width: '100%', padding: 12, background: '#111', color: 'white', border: '1px solid #333', borderRadius: 5, fontSize: '0.95rem', boxSizing: 'border-box' }}
              autoFocus
            />
            <input
              type="password"
              placeholder="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              style={{ width: '100%', padding: 12, background: '#111', color: 'white', border: '1px solid #333', borderRadius: 5, fontSize: '0.95rem', boxSizing: 'border-box' }}
            />
          </>
        ) : (
          <>
            <input
              type="text"
              placeholder="Nom d'utilisateur"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              style={{ width: '100%', padding: 12, background: '#111', color: 'white', border: '1px solid #333', borderRadius: 5, fontSize: '0.95rem', boxSizing: 'border-box' }}
              autoFocus
            />
            <input
              type="password"
              placeholder="Mot de passe (8 caractères min.)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              style={{ width: '100%', padding: 12, background: '#111', color: 'white', border: '1px solid #333', borderRadius: 5, fontSize: '0.95rem', boxSizing: 'border-box' }}
            />
          </>
        )}
        {error && <div style={{ color: '#fb7185', fontSize: '0.85rem' }}>{error}</div>}
      </div>
      <div className="modal-actions">
        <button
          className="ctrl-btn ctrl-btn--primary"
          disabled={isSubmitting}
          onClick={handleSubmit}
          style={mode === 'login' ? { marginLeft: 'auto' } : undefined}
        >
          {isSubmitting
            ? (mode === 'login' ? 'Connexion...' : 'Création...')
            : (mode === 'login' ? 'Se connecter' : 'Créer le compte')}
        </button>
      </div>
      <div style={{ marginTop: 12, textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        {mode === 'login' ? (
          <>Pas encore de compte ?{' '}
            <span onClick={switchMode} style={{ cursor: 'pointer', color: 'var(--text-strong)', textDecoration: 'underline' }}>
              Créer un compte
            </span>
          </>
        ) : (
          <>Déjà un compte ?{' '}
            <span onClick={switchMode} style={{ cursor: 'pointer', color: 'var(--text-strong)', textDecoration: 'underline' }}>
              Se connecter
            </span>
          </>
        )}
      </div>
    </ModalBox>
  );
}
