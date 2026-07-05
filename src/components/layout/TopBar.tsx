import React, { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { useReportStore } from '@/stores/reportStore';
import * as repertoireService from '@/services/repertoire';
import { guardTrainingInterruption } from '@/services/training';

interface DropdownItem {
  label: string;
  onClick: () => void;
}

interface NavTab {
  label: string;
  disabled?: boolean;
  dropdownItems?: DropdownItem[];
  onClick?: () => void;
}

export const TopBar = React.memo(function TopBar() {
  const user = useAuthStore((s) => s.user);
  const openModal = useUiStore((s) => s.openModal);
  const navigate = useNavigate();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    if (openDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openDropdown]);

  const goHome = useCallback(() => {
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
      "Retour à l'accueil",
      "Un entraînement ou un rapport est en cours. Voulez-vous l'interrompre ?",
      () => navigate('/')
    );
  }, [navigate, openModal]);

  const NAV_TABS: NavTab[] = useMemo(() => [
    {
      label: 'Échiquier',
      dropdownItems: [
        { label: 'Créer un répertoire', onClick: () => openModal({ type: 'new-repertoire' }) },
        { label: 'Explorer en jeu libre', onClick: () => {
          repertoireService.switchToFreePlay();
          navigate('/app');
        } },
        { label: "Thème de l'échiquier", onClick: () => openModal({ type: 'board-theme' }) },
        { label: 'Stats joueurs', onClick: () => openModal({ type: 'player-stats' }) },
      ],
    },
    {
      label: 'Entrainement',
      onClick: () => openModal({ type: 'home-training' }),
    },
    {
      label: 'Rapport',
      dropdownItems: [
        { label: 'Nouveau rapport', onClick: () => { window.location.href = '/rapport'; } },
        { label: 'Mes rapports', onClick: () => { window.location.href = '/rapport?tab=saved'; } },
      ],
    },
    { label: 'Apprentissage', disabled: true },
    { label: 'Tutoriel', disabled: true },
  ], [openModal]);

  const handleTabClick = useCallback((tab: NavTab) => {
    if (tab.disabled) return;
    if (tab.dropdownItems) {
      setOpenDropdown((prev) => (prev === tab.label ? null : tab.label));
    } else if (tab.onClick) {
      setOpenDropdown(null);
      tab.onClick();
    }
  }, []);

  const handleDropdownItemClick = useCallback((item: DropdownItem) => {
    setOpenDropdown(null);
    item.onClick();
  }, []);

  return (
    <header className="top-bar">
      <div className="brand-group" role="button" tabIndex={0} onClick={goHome} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') goHome(); }}>
        <div className="brand-logo">A</div>
        <div className="brand-label">
          <div className="brand-title">Blundertale</div>
          <div className="brand-subtitle">Répertoire &amp; analyse</div>
        </div>
      </div>

      <nav className="top-nav" ref={navRef}>
        {NAV_TABS.map((tab) => (
          <div
            key={tab.label}
            className={
              'top-tab' +
              (tab.disabled ? ' top-tab--soon' : '') +
              (tab.dropdownItems ? ' top-tab--has-dropdown' : '')
            }
            onClick={() => handleTabClick(tab)}
            title={tab.disabled ? 'Bientôt disponible' : undefined}
            style={tab.disabled ? { opacity: 0.45, cursor: 'default' } : undefined}
          >
            {tab.label}
            {tab.dropdownItems && (
              <span className="top-tab-arrow">{openDropdown === tab.label ? '▾' : '▸'}</span>
            )}
            {tab.dropdownItems && openDropdown === tab.label && (
              <div className="top-dropdown">
                {tab.dropdownItems.map((item) => (
                  <div
                    key={item.label}
                    className="top-dropdown-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDropdownItemClick(item);
                    }}
                  >
                    {item.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="top-actions">
        <button className="top-action" onClick={() => openModal({ type: 'medals' })}>Médailles</button>
        <button className="top-action" onClick={() => openModal({ type: 'patch-notes' })}>Notes de mise à jour</button>

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
