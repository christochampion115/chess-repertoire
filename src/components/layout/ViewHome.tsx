import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useUiStore } from '@/stores/uiStore';

export const ViewHome = React.memo(function ViewHome() {
  const navigate = useNavigate();
  const openModal = useUiStore((s) => s.openModal);

  return (
    <div id="view-home">
      <section className="home-hero">
        <div className="home-hero-inner">
          <h1 className="home-hero-title">Maîtrisez vos ouvertures</h1>
          <p className="home-hero-subtitle">
            Construisez votre répertoire coup par coup, entraînez-vous avec des systèmes
            de drill, et progressez avec des données réelles à votre niveau Elo.
          </p>
          <div className="home-hero-cta">
            <button className="home-cta-btn home-cta-btn--primary" disabled>
              Tutoriel — bientôt disponible
            </button>
          </div>
        </div>
      </section>

      <section className="home-features">
        <h2 className="home-features-title">Tout ce dont vous avez besoin</h2>
        <div className="home-features-grid">
          <div className="feature-card feature-card--active" role="button" tabIndex={0} onClick={() => navigate('/app')}>
            <div className="feature-card-icon">♟</div>
            <h3 className="feature-card-title">Répertoires</h3>
            <p className="feature-card-desc">
              Construisez vos variantes coup par coup avec les coups les plus joués
              à votre niveau Elo, assisté d'une analyse Stockfish intégrée.
            </p>
            <span className="feature-card-link">Commencer →</span>
          </div>

          <div className="feature-card feature-card--active" role="button" tabIndex={0} onClick={() => openModal({ type: 'home-training' })}>
            <div className="feature-card-icon">⚔</div>
            <h3 className="feature-card-title">Entraînement</h3>
            <p className="feature-card-desc">
              Mode survie, système de rewards et drills intensifs pour
              ancrer vos variantes durablement en mémoire.
            </p>
            <span className="feature-card-link">S'entraîner →</span>
          </div>

          <div className="feature-card feature-card--soon">
            <div className="feature-card-badge">Bientôt</div>
            <div className="feature-card-icon">📖</div>
            <h3 className="feature-card-title">Apprentissage</h3>
            <p className="feature-card-desc">
              Accédez à des répertoires déjà construits par niveau et style de jeu
              pour démarrer rapidement sans partir de zéro.
            </p>
          </div>

          <div className="feature-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/rapport')}>
            <div className="feature-card-icon">📊</div>
            <h3 className="feature-card-title">Analyse des performances</h3>
            <p className="feature-card-desc">
              Identifiez vos points faibles en ouverture depuis votre compte
              Chess.com et obtenez un rapport personnalisé de priorités d'entraînement.
            </p>
          </div>
        </div>
      </section>

      <footer className="home-footer">
        Alpha Chess — Répertoire &amp; analyse
      </footer>
    </div>
  );
});
