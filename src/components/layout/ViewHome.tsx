import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUiStore } from '@/stores/uiStore';

const PARTICLES = Array.from({ length: 48 }, (_, i) => ({
  id: i,
  x: +((i * 73.7117 + 5) % 100).toFixed(2),
  y: +((i * 38.197 + 7) % 85).toFixed(2),
  size: +(1.5 + (i % 4) * 0.65).toFixed(2),
  dur: +(2.5 + (i % 6) * 0.5).toFixed(2),
  delay: +((i * 0.37) % 5).toFixed(2),
}));

export const ViewHome = React.memo(function ViewHome() {
  const navigate = useNavigate();
  const openModal = useUiStore((s) => s.openModal);
  const heroParticlesRef = useRef<HTMLDivElement>(null);

  // ── Parallax pour les particules du hero
  useEffect(() => {
    const el = heroParticlesRef.current;
    if (!el) return;

    let rafId = 0;
    const PARALLAX_SPEED = 0.03;
    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const y = window.scrollY;
        // Pour que les particules (position:absolute) se déplacent COMME les particules fixed du body,
        // on doit compenser le scroll naturel du hero: translateY(y * (PARALLAX_SPEED - 1))
        el.style.transform = `translateY(${(y * (PARALLAX_SPEED - 1)).toFixed(1)}px)`;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div id="view-home">
      <section className="home-hero">
        <div className="home-hero-bg" aria-hidden="true" />
        <div ref={heroParticlesRef} className="hero-particles" aria-hidden="true">
          {PARTICLES.map(p => (
            <span
              key={p.id}
              className="hero-particle"
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: `${p.size}px`,
                height: `${p.size}px`,
                animationDuration: `${p.dur}s`,
                animationDelay: `${p.delay}s`,
              }}
            />
          ))}
        </div>
        <div className="home-hero-inner">
          <h1 className="home-hero-title">
            Maîtrisez vos ouvertures
          </h1>
          <p className="home-hero-subtitle">
            Construisez votre répertoire coup par coup, entraînez-vous avec des systèmes
            de drill, et progressez avec des données réelles.
          </p>
          <div className="home-hero-cta">
            <button className="home-cta-btn home-cta-btn--primary" disabled>
              <span aria-hidden="true">🎓</span>
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

          <div className="feature-card feature-card--active" role="button" tabIndex={0} onClick={() => navigate('/rapport')}>
            <div className="feature-card-icon">📊</div>
            <h3 className="feature-card-title">Rapport</h3>
            <p className="feature-card-desc">
              Identifiez vos points faibles en ouverture depuis votre compte
              Chess.com et obtenez un rapport personnalisé de priorités d'entraînement.
            </p>
            <span className="feature-card-link">Analyser →</span>
          </div>

          <div className="feature-card feature-card--soon">
            <div className="feature-card-badge">Bientôt</div>
            <h3 className="feature-card-title">À venir</h3>
          </div>

          <div className="feature-card feature-card--soon">
            <div className="feature-card-badge">Bientôt</div>
            <h3 className="feature-card-title">À venir</h3>
          </div>
        </div>
      </section>

      <footer className="home-footer">
        Alpha Chess — Répertoire &amp; analyse
      </footer>
    </div>
  );
});
