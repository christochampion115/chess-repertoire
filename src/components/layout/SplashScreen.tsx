import React, { useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { loginWithCredentials, signupWithCredentials, resetAllUserStores } from '@/services/authService';
import { initializeService } from '@/services/repertoire';
import { retryStats } from '@/services/stats';

type SplashStep = 'welcome' | 'login' | 'signup' | 'guest';

export const SplashScreen = React.memo(function SplashScreen() {
  const setGuestMode = useAuthStore((s) => s.setGuestMode);
  const setStatus    = useAuthStore((s) => s.setStatus);
  const setError     = useAuthStore((s) => s.setError);
  const error        = useAuthStore((s) => s.error);
  const isSubmitting = useAuthStore((s) => s.isSubmitting);
  const [step, setStep] = useState<SplashStep>('welcome');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleGuest = useCallback(() => {
    resetAllUserStores();              // vide répertoires, stats, training
    useAuthStore.getState().logout();  // vide auth + status='guest'
    setGuestMode(true);                // flag invité
    setStatus('guest');
    initializeService();
    retryStats();
  }, [setGuestMode, setStatus]);

  const handleLogin = useCallback(async () => {
    await loginWithCredentials({ email, password });
  }, [email, password]);

  const handleSignup = useCallback(async () => {
    await signupWithCredentials({ username, password });
  }, [username, password]);

  return (
    <div id="splash-screen">
      {error && step === 'welcome' && (
        <div id="session-expired-overlay" style={{
          position: 'fixed', inset: 0, zIndex: 10002,
          background: 'rgba(8,16,29,0.85)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          backdropFilter: 'blur(4px)',
        }}>
          <div className="modal-box" style={{ display: 'block', maxWidth: 420, textAlign: 'center' }}>
            <div className="splash-logo" style={{ marginBottom: 16 }}>A</div>
            <h3 style={{ marginBottom: 12, color: '#f8fafc' }}>Session expirée</h3>
            <p style={{ color: '#fb7185', marginBottom: 24, fontSize: '0.9rem' }}>{error}</p>
            <button className="splash-btn primary" onClick={() => { setError(''); setStep('login'); }}>
              Se connecter
            </button>
          </div>
        </div>
      )}
      <div className="splash-content">
        {/* ── Welcome ── */}
        <div id="splash-welcome" className={`splash-section${step !== 'welcome' ? ' hidden' : ''}`}>
          <div className="splash-header">
            <div className="splash-logo">A</div>
            <div className="splash-title">Blundertale</div>
            <div className="splash-subtitle">Répertoire &amp; analyse</div>
            <div className="splash-tagline">Préparez vos variantes d'ouverture</div>
          </div>
          <div className="splash-actions">
            <button className="splash-btn primary" id="btn-splash-login" onClick={() => { setError(''); setStep('login'); }}>
              Se connecter
            </button>
            <button className="splash-btn secondary" id="btn-splash-signup" onClick={() => { setError(''); setStep('signup'); }}>
              Créer un compte
            </button>
            <button className="splash-btn ghost" id="btn-splash-guest" onClick={() => setStep('guest')}>
              Continuer en tant qu'invité
            </button>
          </div>
        </div>

        {/* ── Login ── */}
        <div id="splash-login" className={`splash-section${step !== 'login' ? ' hidden' : ''}`}>
          <div className="splash-header">
            <div className="splash-logo">A</div>
            <div className="splash-title" id="splash-form-title">Connexion</div>
          </div>
          <div className="splash-actions" style={{ marginTop: 24 }}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }}
              className="splash-input"
              style={{ marginBottom: 12 }}
              autoFocus
            />
            <input
              type="password"
              placeholder="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }}
              className="splash-input"
              style={{ marginBottom: 12 }}
            />
            {error && <div style={{ color: '#fb7185', fontSize: '0.85rem', marginBottom: 8 }}>{error}</div>}
            <button
              className="splash-btn primary"
              id="splash-submit-btn"
              style={{ width: '100%', marginBottom: 12 }}
              disabled={isSubmitting || !email || !password}
              onClick={handleLogin}
            >
              {isSubmitting ? 'Connexion...' : 'Se connecter'}
            </button>
            <button className="splash-btn ghost" id="btn-splash-back" style={{ width: '100%', marginTop: 8, color: 'var(--text-muted)' }} onClick={() => { setError(''); setStep('welcome'); }}>
              ← Retour
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
            <button className="splash-btn ghost" id="btn-splash-tab-login" style={{ flex: 1 }} onClick={() => setStep('login')}>Connexion</button>
            <button className="splash-btn ghost" id="btn-splash-tab-signup" style={{ flex: 1 }} onClick={() => setStep('signup')}>Créer un compte</button>
          </div>
        </div>

        {/* ── Signup ── */}
        <div id="splash-signup" className={`splash-section${step !== 'signup' ? ' hidden' : ''}`}>
          <div className="splash-header">
            <div className="splash-logo">A</div>
            <div className="splash-title" id="splash-form-title">Créer un compte</div>
          </div>
          <div className="splash-actions" style={{ marginTop: 24 }}>
            <input
              type="text"
              placeholder="Nom d'utilisateur"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSignup(); }}
              className="splash-input"
              style={{ marginBottom: 12 }}
              autoFocus
            />
            <input
              type="password"
              placeholder="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSignup(); }}
              className="splash-input"
              style={{ marginBottom: 12 }}
            />
            {error && <div style={{ color: '#fb7185', fontSize: '0.85rem', marginBottom: 8 }}>{error}</div>}
            <button
              className="splash-btn primary"
              id="splash-submit-btn"
              style={{ width: '100%', marginBottom: 12 }}
              disabled={isSubmitting || !username || !password}
              onClick={handleSignup}
            >
              {isSubmitting ? 'Création...' : 'Créer un compte'}
            </button>
            <button className="splash-btn ghost" id="btn-splash-back" style={{ width: '100%', marginTop: 8, color: 'var(--text-muted)' }} onClick={() => { setError(''); setStep('welcome'); }}>
              ← Retour
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
            <button className="splash-btn ghost" id="btn-splash-tab-login" style={{ flex: 1 }} onClick={() => setStep('login')}>Connexion</button>
            <button className="splash-btn ghost" id="btn-splash-tab-signup" style={{ flex: 1 }} onClick={() => setStep('signup')}>Créer un compte</button>
          </div>
        </div>

        {/* ── Guest confirm ── */}
        <div id="splash-guest" className={`splash-section${step !== 'guest' ? ' hidden' : ''}`}>
          <div className="splash-header">
            <div className="splash-logo">A</div>
            <div className="splash-title">Mode invité</div>
            <div className="splash-subtitle" style={{ marginTop: 12 }}>Aucune donnée ne sera sauvegardée</div>
          </div>
          <div className="splash-actions">
            <button className="splash-btn primary" id="btn-splash-guest-confirm" style={{ width: '100%' }} onClick={handleGuest}>
              Continuer
            </button>
            <button className="splash-btn ghost" id="btn-splash-guest-back" style={{ width: '100%' }} onClick={() => setStep('welcome')}>
              ← Retour
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
