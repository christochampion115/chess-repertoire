import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { useReportStore } from '@/stores/reportStore';
import { guardTrainingInterruption } from '@/services/training';

const NAV_TABS = [
  'Tableau de bord',
  'Analyse',
  'Répertoires',
  'Statistiques',
] as const;

/**
 * Barre de navigation supérieure.
 * Reproduit <header class="top-bar"> du HTML vanilla.
 */
export const TopBar = React.memo(function TopBar() {
  const user      = useAuthStore((s) => s.user);
  const openModal = useUiStore((s) => s.openModal);
  const navigate  = useNavigate();
  const goHome  = useCallback(() => {
    const reportView = useReportStore.getState().view;
    const guardActiveOperation = (title: string, message: string, onConfirm: () => void) => {
      if (reportView === 'loading') {
        openModal({
          type: 'training-interrupt',
          title,
          message,
          onConfirm: () => {
            useReportStore.getState().cancelReport();
            onConfirm();
          },
        });
      } else {
        guardTrainingInterruption(title, message, onConfirm);
      }
    };
    guardActiveOperation(
      'Retour à l\'accueil',
      'Un entraînement ou un rapport est en cours. Voulez-vous l\'interrompre ?',
      () => navigate('/')
    );
  }, [navigate, openModal]);

  return (
    <header className="top-bar">
      {/* Branding */}
      <div className="brand-group" role="button" tabIndex={0} onClick={goHome} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') goHome(); }}>
        <div className="brand-logo">A</div>
        <div className="brand-label">
          <div className="brand-title">Alpha Chess</div>
          <div className="brand-subtitle">Répertoire &amp; analyse</div>
        </div>
      </div>

      {/* Onglets navigation — Phase 5 : brancher React Router */}
      <nav className="top-nav">
        {NAV_TABS.map((tab) => (
          <div key={tab} className="top-tab">
            {tab}
          </div>
        ))}
        <div className="top-tab top-tab--soon" title="Bientôt disponible" style={{ opacity: 0.45, cursor: 'default' }}>
          Tutoriel
        </div>
      </nav>

      {/* Actions et compte */}
      <div className="top-actions">
        <button className="top-action" onClick={() => openModal({ type: 'medals' })}>Médailles</button>
        <button className="top-action">Paramètres</button>
        <button className="top-action">Aide</button>
        <button className="top-action">Contact</button>
        <button className="top-action">Abonnement</button>

        <div className="top-account" style={{ cursor: 'pointer' }} onClick={() => user && openModal({ type: 'profile' })}>
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div className="account-avatar">
                {user.username.slice(0, 2).toUpperCase()}
              </div>
              <div className="account-details">
                <div className="account-name">{user.username}</div>
                <div className="account-status">Connecté</div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={() => openModal({ type: 'auth' })}>
              <span style={{ fontSize: '1rem' }}>👤</span>
              <span style={{ fontSize: '0.78rem', fontWeight: 800 }}>Connexion</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
});
