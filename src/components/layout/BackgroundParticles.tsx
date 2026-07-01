import React, { useEffect, useRef } from 'react';

// Calque fixe (reste en place au scroll — effet fond lointain)
const BG_PARTICLES = Array.from({ length: 17 }, (_, i) => ({
  id: i,
  x: +((i * 73.7117) % 100).toFixed(2),
  y: +((i * 38.197 + 13) % 100).toFixed(2),
  size: +(0.8 + (i % 3) * 0.45).toFixed(2),
  dur: +(3.2 + (i % 6) * 0.5).toFixed(2),
  delay: +((i * 0.41) % 5.1).toFixed(2),
}));

// Calque absolu (scroll avec le contenu — effet premier plan)
const FG_PARTICLES = Array.from({ length: 11 }, (_, i) => ({
  id: i,
  x: +((i * 59.3117 + 19) % 100).toFixed(2),
  y: +((i * 38.197 + 47) % 100).toFixed(2),
  size: +(1.0 + (i % 3) * 0.55).toFixed(2),
  dur: +(2.5 + (i % 5) * 0.55).toFixed(2),
  delay: +((i * 0.53) % 4.5).toFixed(2),
}));

// Particules de bords gauche + droit (fixed, plus grosses, visibles autour du contenu)
const EDGE_PARTICLES = Array.from({ length: 22 }, (_, i) => {
  const isRight = i % 2 === 0;
  const side = Math.floor(i / 2);
  const xInEdge = +((side * 5.897) % 7.5).toFixed(2);
  return {
    id: i,
    x: isRight ? 92.5 + xInEdge : xInEdge,
    y: +((i * 38.197 + 9) % 100).toFixed(2),
    size: +(1.8 + (side % 4) * 0.7).toFixed(2),
    dur: +(2.8 + (side % 5) * 0.55).toFixed(2),
    delay: +((side * 0.47) % 5.2).toFixed(2),
  };
});

export const BackgroundParticles = React.memo(function BackgroundParticles() {
  const bgRef   = useRef<HTMLDivElement>(null);
  const fgRef   = useRef<HTMLDivElement>(null);
  const edgeRef = useRef<HTMLDivElement>(null);

  // ── Parallax au scroll : chaque calque se déplace à une vitesse différente
  // Plus la vitesse est PETITE, plus lointain semble l'objet
  // bg=0.03 (très lointain), edge=0.08 (intermédiaire), fg=0.15 (premier plan)
  useEffect(() => {
    const layers = [
      { el: bgRef.current,   speed: 0.03 },
      { el: edgeRef.current, speed: 0.08 },
      { el: fgRef.current,   speed: 0.15 },
    ] as const;

    let rafId = 0;

    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const y = window.scrollY;
        for (const { el, speed } of layers) {
          if (el) el.style.transform = `translateY(${(y * speed).toFixed(1)}px)`;
        }
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <>
      <div ref={bgRef} className="particles-bg" aria-hidden="true">
        {BG_PARTICLES.map(p => (
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
      <div ref={fgRef} className="particles-fg" aria-hidden="true">
        {FG_PARTICLES.map(p => (
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
      <div ref={edgeRef} className="particles-edge" aria-hidden="true">
        {EDGE_PARTICLES.map(p => (
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
    </>
  );
});
