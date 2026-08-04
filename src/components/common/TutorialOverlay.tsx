import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTutorialStore } from '@/stores/tutorialStore';
import { useUiStore } from '@/stores/uiStore';
import { useRepertoireStore } from '@/stores/repertoireStore';
import { useStatsStore } from '@/stores/statsStore';
import { useAnalysisStore } from '@/stores/analysisStore';
import { initExampleData, selectRepertoire } from '@/services/repertoire';
import '@/styles/tutorial.css';
import type { TutorialStep } from '@/stores/tutorialStore';

/** Configuration for each tutorial step */
interface StepConfig {
  target?: string;
  text: React.ReactNode;
  bubblePos: 'top' | 'bottom' | 'left' | 'right';
  center?: boolean;
  showArrow?: boolean;
  arrowPos?: 'top' | 'bottom' | 'left' | 'right';
  arrowOffset?: { x?: number; y?: number; xFrac?: number; yFrac?: number };
  /** Optional callback to track state changes and auto-advance. Returns an unsubscribe function. */
  subscribe?: (nextStep: () => void) => () => void;
  /** When true, skip rendering mask segments and highlight ring (page stays fully interactive). */
  noMask?: boolean;
  /** When true, render custom end buttons (revenir à l'accueil / créer un répertoire) instead of default. */
  renderEndButtons?: boolean;
}

/**
 * Hook that activates the subscription of the current step, cleaning up on step change.
 */
function useStepSubscriptions(currentStep: TutorialStep, nextStep: () => void) {
  useEffect(() => {
    const s = STEPS[currentStep];
    if (!s?.subscribe) return;
    return s.subscribe(nextStep);
  }, [currentStep, nextStep]);
}

const STEPS: StepConfig[] = [
  // ─── 0: Welcome ───────────────────────────────────────────────
  {
    text: (
      <>
        <strong>Bienvenue sur AlphaChess !</strong><br /><br />
        Ce site vous permet de <strong>créer et gérer des répertoires d'ouvertures</strong>
        {' '}basés sur des statistiques réelles de la base Lichess.<br /><br />
        Ce tutoriel vous guide pas à pas pour créer votre premier répertoire.<br /><br />
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          (Appuyez sur <kbd>ESC</kbd> pour quitter)
        </span>
      </>
    ),
    bubblePos: 'top',
    center: true,
  },

  // ─── 1: Créer un répertoire ──────────────────────────────────
  {
    target: '[data-tutorial="create-rep"]',
    text: <>Cliquez sur <strong>"Créer un répertoire"</strong> pour commencer.</>,
    bubblePos: 'bottom',
    showArrow: true,
    arrowPos: 'left',
    subscribe: (next) => {
      const unsub = useUiStore.subscribe((state, prev) => {
        if (prev.activeModal !== state.activeModal && state.activeModal?.type === 'new-repertoire') {
          setTimeout(() => next(), 300);
        }
      });
      return unsub;
    },
  },

  // ─── 2: Instructions modale ──────────────────────────────────
  {
    text: (
      <>
        Le menu de création de répertoire s'ouvre dans lequel vous trouverez plusieurs options.<br /><br />
        Ici, elles sont présélectionnées pour le bien du tutoriel, il ne vous reste plus qu'à lui donner un nom et cliquer sur <strong>"Créer"</strong>.
      </>
    ),
    bubblePos: 'bottom',
    center: true,
  },

  // ─── 3: Nom + bouton Créer ───────────────────────────────────
  {
    target: '#rep-name-input, #btn-rep-confirm',
    text: <>Écrivez le nom de votre répertoire (par exemple : <strong>"Gambit Dame"</strong>).<br /><br />Cliquez ensuite sur <strong>"Créer"</strong>.</>,
    bubblePos: 'top',
    subscribe: (next) => {
      const unsub = useUiStore.subscribe((state, prev) => {
        if (prev.activeModal?.type === 'new-repertoire' && state.activeModal === null) {
          const { openPanels, togglePanel } = useRepertoireStore.getState();
          if (!openPanels.repertoire) togglePanel('repertoire');
          setTimeout(() => next(), 400);
        }
      });
      return unsub;
    },
  },

  // ─── 5: Répertoire créé ────────────────────────────────────
  {
    text: (
      <>
        <strong>Félicitations, vous venez de créer votre premier répertoire d'ouverture !</strong><br /><br />
        Il vous permettra de vous préparer vos ouvertures et de vous entrainer dessus afin de les jouer en partie réelle.<br /><br />
        Vous pourrez naviguer entre vos répertoires via l'onglet à gauche de l'échiquier.
      </>
    ),
    bubblePos: 'top',
    center: true,
  },

  // ─── 4: Premier coup ─────────────────────────────────────────
  {
    target: '#board',
    text: <>Ajoutez le premier coup de votre répertoire.<br /><br />Jouez le coup <strong>e4</strong> pour commencer.</>,
    bubblePos: 'right',
    showArrow: true,
    arrowOffset: { xFrac: 0.0625, yFrac: 0.9375, y: -60 }, // between e1 and e2: col e = 4.5/8, row 1 = 7.5/8
    subscribe: (next) => {
      let initialId: string | null = null;
      const unsub = useRepertoireStore.subscribe((state) => {
        if (initialId === null) { initialId = state.currentNodeId; return; }
        if (state.currentNodeId !== null && state.currentNodeId !== initialId) {
          initialId = state.currentNodeId;
          const { openPanels, togglePanel } = useRepertoireStore.getState();
          if (!openPanels.arbre) togglePanel('arbre');
          setTimeout(() => next(), 500);
        }
      });
      return unsub;
    },
  },

  // ─── 7: Arbre ──────────────────────────────────────────────
  {
    target: '[data-tutorial="tree-panel"]',
    text: (
      <>
        vous retrouverez chaque coup joué dans la section <strong>"Arbre"</strong> à gauche de l'échiquier.<br /><br />
        Passons maintenant à la suite.
      </>
    ),
    bubblePos: 'right',
  },

  // ─── 5: Ouvrir la section coups candidats ────────────────────
  {
    target: '[data-tutorial="candidates-toggle"]',
    text: <>Maintenant, nous arrivons au coeur du projet !<br /><br />Vos adversaires n'abandonneront pas au premier coup (sauf si vous jouez <strong>d4</strong>).<br /><br />Ouvrez la section <strong>"coups candidats"</strong> pour voir les coups les plus joués dans cette position.</>,
    bubblePos: 'bottom',
    showArrow: true,
    arrowOffset: { x: 50, y: 10 },
    subscribe: (next) => {
      const unsub = useStatsStore.subscribe((state, prev) => {
        if (!prev.filters.candidatesOpen && state.filters.candidatesOpen) {
          setTimeout(() => next(), 400);
        }
      });
      return unsub;
    },
  },

  // ─── 6: Choisir un coup candidat ─────────────────────────────
  {
    target: '[data-tutorial="candidates-list"]',
    text: <>Ici, vous trouverez les réponses les plus populaires au coup que vous venez de jouer.<br /><br />Vous pourrez naviguer entre plusieurs bases de données une fois sorti du tutoriel.<br /><br />Choisissez un coup pour l'intégrer à votre répertoire.</>,
    bubblePos: 'top',
    showArrow: true,
    arrowOffset: { y: 110 },
    subscribe: (next) => {
      let initialUci = useStatsStore.getState().selectedUci;
      const unsub = useStatsStore.subscribe((state) => {
        if (state.selectedUci && state.selectedUci !== initialUci) {
          initialUci = state.selectedUci;
          setTimeout(() => next(), 500);
        }
      });
      return unsub;
    },
  },

  // ─── 8: Activer l'analyse ──────────────────────────────────
  {
    target: '[data-tutorial="analysis-toggle"]',
    text: <>Maintenant, il faut choisir notre réponse à ce coup !<br /><br />Utilisez ce bouton pour ouvrir le menu d'analyse Stockfish.</>,
    bubblePos: 'bottom',
    showArrow: true,
    arrowOffset: { x: 20, y: 10 },
    subscribe: (next) => {
      const unsub = useAnalysisStore.subscribe((state, prev) => {
        if (!prev.isEnabled && state.isEnabled) {
          setTimeout(() => next(), 400);
        }
      });
      return unsub;
    },
  },

  // ─── 9: Choisir un coup Stockfish ──────────────────────────
  {
    target: '#analysis-panel',
    text: <>Voici la liste des coups favoris de l'ordinateur, choisissez en un pour l'intégrer à votre répertoire.</>,
    bubblePos: 'top',
    showArrow: true,
    arrowOffset: { y: 45 },
    subscribe: (next) => {
      let refId: string | null = null;
      const unsub = useRepertoireStore.subscribe((state) => {
        if (refId === null) { refId = state.currentNodeId; return; }
        if (state.currentNodeId !== null && state.currentNodeId !== refId) {
          refId = state.currentNodeId;
          setTimeout(() => next(), 500);
        }
      });
      return unsub;
    },
  },

  // ─── 11: Nommer la variante (clic droit) ─────────────────────
  {
    target: '[data-tutorial="tree-panel"]',
    text: <>Faites un <strong>clic droit</strong> sur le coup ajouté dans l'arbre pour ouvrir le menu contextuel, puis choisissez <strong>"Nommer la variante"</strong>.</>,
    bubblePos: 'right',
    showArrow: true,
    arrowOffset: { y: 30 },
    subscribe: (next) => {
      const unsub = useUiStore.subscribe((state, prev) => {
        if (prev.activeModal?.type !== 'name-variant' && state.activeModal?.type === 'name-variant') {
          setTimeout(() => next(), 300);
        }
      });
      return unsub;
    },
  },

  // ─── 12: Nommer la variante (aide modale) ───────────────────
  {
    target: '#modal-overlay .modal-box',
    text: (
      <>
        Donnez un nom à cette variante pour vous y retrouver dans la <strong>myriade de réponses possibles</strong> que vos adversaires peuvent jouer.<br /><br />
        Choisissez un nom parlant pour identifier rapidement cette lignée de coups.
      </>
    ),
    bubblePos: 'bottom',
    subscribe: (next) => {
      const unsub = useUiStore.subscribe((state, prev) => {
        if (prev.activeModal?.type === 'name-variant' && state.activeModal === null) {
          const store = useRepertoireStore.getState();
          const { openPanels, togglePanel, repExpanded, toggleRepExpanded } = store;
          if (!openPanels.repertoire) togglePanel('repertoire');
          if (store.activeRepIndex >= 0) {
            const repId = store.repertoires[store.activeRepIndex]?.id;
            if (repId && !repExpanded.has(repId)) {
              toggleRepExpanded(repId);
            }
          }
          setTimeout(() => next(), 400);
        }
      });
      return unsub;
    },
  },

  // ─── 13: Onglet répertoire ──────────────────────────────────
  {
    text: (
      <>
        Toutes vos <strong>variantes et sous-variantes</strong> se retrouvent dans l'onglet <strong>Répertoires</strong>.<br /><br />
        Vous pouvez naviguer de l'une à l'autre en cliquant dessus, ce qui vous permet de préparer vos réponses à l'avance.<br /><br />
        <span style={{ fontSize: '0.82rem', display: 'block', lineHeight: 1.8 }}>
          Exemple de hiérarchie :<br />
          <span style={{ display: 'block', marginLeft: 0 }}><strong>Sicilienne</strong></span>
          <span style={{ display: 'block', marginLeft: 20 }}>└─ <strong>Sicilienne fermée</strong></span>
          <span style={{ display: 'block', marginLeft: 40 }}>└─ <strong>Sicilienne ouverte</strong></span>
          <span style={{ display: 'block', marginLeft: 60 }}>└─ <strong>Vieille sicilienne</strong> …</span>
        </span>
      </>
    ),
    bubblePos: 'top',
    center: true,
  },

  // ─── 14: Revenir en arrière ─────────────────────────────────
  {
    target: '#btn-nav-back',
    text: (
      <>
        <strong>Et si votre adversaire joue autre chose ?</strong><br /><br />
        Cliquez <strong>deux fois</strong> sur la flèche retour ← pour revenir en arrière et explorer d'autres réponses adverses.
      </>
    ),
    bubblePos: 'top',
    showArrow: true,
    arrowPos: 'left',
    arrowOffset: { x: 20, y: 10 },
    subscribe: (next) => {
      let backCount = 0;
      let refId = useRepertoireStore.getState().currentNodeId;
      const unsub = useRepertoireStore.subscribe((state) => {
        if (state.currentNodeId !== refId) {
          refId = state.currentNodeId;
          backCount++;
          if (backCount >= 2) {
            setTimeout(() => next(), 500);
          }
        }
      });
      return unsub;
    },
  },

  // ─── 15: Autre coup candidat ────────────────────────────────
  {
    target: '[data-tutorial="candidates-list"]',
    text: (
      <>
        Maintenant, ajoutez un <strong>coup différent</strong> de celui déjà choisi pour voir comment l'arbre gère les <strong>bifurcations</strong>.<br /><br />
        Cliquez sur une autre réponse dans la liste des coups candidats.
      </>
    ),
    bubblePos: 'top',
    showArrow: true,
    arrowOffset: { y: 155 },
    subscribe: (_next) => {
      const { filters, setFilter } = useStatsStore.getState();
      if (!filters.candidatesOpen) setFilter('candidatesOpen', true);

      // Snapshot children of current node to detect if the user replays the same move
      const startNodeId = useRepertoireStore.getState().currentNodeId;
      const knownChildIds = new Set<string>();
      const stack = [...useRepertoireStore.getState().repertoires];
      while (stack.length) {
        const n = stack.pop()!;
        if (n.id === startNodeId) { n.children.forEach(c => knownChildIds.add(c.id)); break; }
        stack.push(...n.children);
      }

      let refUci = useStatsStore.getState().selectedUci;
      const unsub = useStatsStore.subscribe((state) => {
        if (state.selectedUci && state.selectedUci !== refUci) {
          refUci = state.selectedUci;
          setTimeout(() => {
            const newNodeId = useRepertoireStore.getState().currentNodeId;
            if (newNodeId && knownChildIds.has(newNodeId)) {
              useTutorialStore.getState().goToStep(16); // same move → error recovery (step 15b)
            } else {
              useTutorialStore.getState().goToStep(17); // different move → proceed
            }
          }, 500);
        }
      });
      return unsub;
    },
  },

  // ─── 15b: Même coup rejoué — erreur ─────────────────────────
  {
    target: '#btn-nav-back',
    text: (
      <>
        Mince, vous avez rejoué le même coup !<br /><br />
        Le but est de voir ce qu'il se passe quand l'adversaire joue un coup <strong>différent</strong>.<br /><br />
        Revenez au coup précédent.
      </>
    ),
    bubblePos: 'top',
    showArrow: true,
    arrowPos: 'left',
    arrowOffset: { x: 20, y: 10 },
    noMask: false,
    subscribe: (_next) => {
      const refId = useRepertoireStore.getState().currentNodeId;
      const unsub = useRepertoireStore.subscribe((state) => {
        if (state.currentNodeId !== refId) {
          setTimeout(() => useTutorialStore.getState().goToStep(15), 300);
        }
      });
      return unsub;
    },
  },

  // ─── 16: Arbre navigation ───────────────────────────────────
  {
    target: '[data-tutorial="tree-panel"]',
    text: (
      <>
        Les <strong>bifurcations</strong> sont maintenant visibles dans l'arbre.<br /><br />
        Vous pouvez naviguer entre les coups en les <strong>sélectionnant</strong> directement dans l'arbre.<br /><br />
        Cliquez sur "Suivant" pour continuer.
      </>
    ),
    bubblePos: 'right',
  },

  // ─── 17: Test repertoire ────────────────────────────────────
  {
    target: '[data-tutorial="tree-panel"]',
    text: (
      <>
        <strong>Un répertoire rempli peut être un vrai casse-tête à mémoriser.</strong><br /><br />
        C'est pourquoi nous proposons un mode <strong>"Entraînement"</strong>.<br /><br />
        Naviguez entre les coups de ce <strong>répertoire de présentation</strong> pour vous familiariser avec.<br /><br />
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-blue-bright)' }}>
          Progression : <span id="tutorial-nav-progress">0</span>/5
        </span>
      </>
    ),
    bubblePos: 'right',
    showArrow: true,
    arrowPos: 'left',
    subscribe: (next) => {
      const { suppressSync, setSuppressSync } = useRepertoireStore.getState();
      const wasSuppressed = suppressSync;
      setSuppressSync(true);
      initExampleData();
      setTimeout(() => {
        selectRepertoire(1);
        const { openPanels, togglePanel } = useRepertoireStore.getState();
        if (!openPanels.arbre) togglePanel('arbre');
        setSuppressSync(wasSuppressed);
      }, 300);

      let navCount = 0;
      useTutorialStore.getState().setNavProgress(0);
      let refId = useRepertoireStore.getState().currentNodeId;
      const unsub = useRepertoireStore.subscribe((state) => {
        if (state.currentNodeId !== refId) {
          refId = state.currentNodeId;
          navCount++;
          useTutorialStore.getState().setNavProgress(navCount);
          const el = document.getElementById('tutorial-nav-progress');
          if (el) el.textContent = String(navCount);
          if (navCount >= 5) {
            setTimeout(() => next(), 600);
          }
        }
      });
      return unsub;
    },
  },

  // ─── 18: Bouton entraînement ────────────────────────────────
  {
    target: '.rep-item-wrapper.active .train-btn',
    text: (
      <>
        Vous pouvez vous <strong>entraîner</strong> sur ce répertoire pour le mémoriser.<br /><br />
        Cliquez sur le bouton <strong>"S'entraîner"</strong> du répertoire <strong>Gambit Dame</strong> pour ouvrir le menu d'entraînement.
      </>
    ),
    bubblePos: 'right',
    showArrow: true,
    arrowPos: 'left',
    arrowOffset: { y: 0 },
    subscribe: (next) => {
      const { openPanels, togglePanel } = useRepertoireStore.getState();
      if (!openPanels.repertoire) togglePanel('repertoire');

      const unsub = useUiStore.subscribe((state, prev) => {
        if (prev.activeModal?.type !== 'training-confirm' && state.activeModal?.type === 'training-confirm') {
          setTimeout(() => next(), 400);
        }
      });
      return unsub;
    },
  },

  // ─── 19: Modale entraînement ───────────────────────────────
  {
    text: (
      <>
        Ici, vous trouverez <strong>différents moyens</strong> de travailler la mémorisation et de vous <strong>driller</strong> sur les répertoires que vous avez créés.
      </>
    ),
    bubblePos: 'top',
    center: true,
  },

  // ─── 20: Fin du tutoriel ─────────────────────────────────────
  {
    text: (
      <>
        Mais pour ça, vous devrez d'abord créer un répertoire par vous-même !<br /><br />
        Merci d'avoir suivi ce tutoriel et <strong>bonne chance</strong> pour la suite !<br /><br />
      </>
    ),
    bubblePos: 'top',
    center: true,
    renderEndButtons: true,
  },

];

/** Returns visible elements matching `selector` (comma-separated). Filters hidden/invisible elements. */
function resolveTargets(selector: string): Element[] {
  const els: Element[] = [];
  for (const sel of selector.split(',').map(s => s.trim())) {
    for (const el of document.querySelectorAll(sel)) {
      if (el.checkVisibility?.() ?? (el as HTMLElement).offsetParent !== null) {
        els.push(el);
      }
    }
  }
  return els;
}

function unionRect(els: Element[]): DOMRect | null {
  let u: DOMRect | null = null;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (u === null) {
      u = new DOMRect(r.x, r.y, r.width, r.height);
    } else {
      const l = Math.min(u.left, r.left);
      const t = Math.min(u.top, r.top);
      const ri = Math.max(u.right, r.right);
      const b = Math.max(u.bottom, r.bottom);
      u = new DOMRect(l, t, ri - l, b - t);
    }
  }
  return u;
}

/** Hook that returns the union rect of all elements matching `selector`, updated on resize/scroll.
 *  Multiple selectors can be comma-separated (e.g. `#a, .b`).
 */
function useTargetRect(selector?: string, step?: TutorialStep) {
  const rectRef = useRef<DOMRect | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!selector) { setRect(null); return; }

    const els = resolveTargets(selector);
    if (els.length === 0) { setRect(null); return; }

    const update = (force = false) => {
      const elsNow = resolveTargets(selector);
      if (elsNow.length === 0) { setRect(null); return; }
      const u = unionRect(elsNow);
      if (!u) { setRect(null); return; }
      if (force || !rectRef.current ||
        u.left !== rectRef.current.left ||
        u.top !== rectRef.current.top ||
        u.width !== rectRef.current.width ||
        u.height !== rectRef.current.height) {
        rectRef.current = u;
        setRect(u);
      }
    };

    update();

    const onScroll = () => update();
    const onResize = () => update(true);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });

    const observer = new ResizeObserver(() => update(true));
    for (const el of els) observer.observe(el);
    observer.observe(document.body);

    // rAF loop catches position shifts not detected by ResizeObserver (e.g. analysis panel opening above target)
    let rafId = requestAnimationFrame(function loop() { update(); rafId = requestAnimationFrame(loop); });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      observer.disconnect();
    };
  }, [selector, step]);

  return rect;
}

/** Returns 4 mask segment styles to darken everything except the target rect. */
function maskSegments(rect: DOMRect, buffer = 4): React.CSSProperties[] {
  const y1 = Math.max(0, rect.top - buffer);
  const y2 = Math.min(window.innerHeight, rect.bottom + buffer);
  const x1 = Math.max(0, rect.left - buffer);
  const x2 = Math.min(window.innerWidth, rect.right + buffer);
  const h = y2 - y1;
  const segments: React.CSSProperties[] = [];

  if (y1 > 0) segments.push({ top: 0, left: 0, right: 0, height: y1 });
  if (y2 < window.innerHeight) segments.push({ top: y2, left: 0, right: 0, bottom: 0 });
  if (x1 > 0) segments.push({ top: y1, left: 0, width: x1, height: h });
  if (x2 < window.innerWidth) segments.push({ top: y1, left: x2, right: 0, height: h });

  return segments;
}

function BubbleActions({
  hasSubscribe,
  isFirst,
  isLast,
  onNext,
  onQuit,
  stepIndex,
  totalSteps,
}: {
  hasSubscribe: boolean;
  isFirst: boolean;
  isLast: boolean;
  onNext: () => void;
  onQuit: () => void;
  stepIndex: number;
  totalSteps: number;
}) {
  return (
    <div className="tutorial-bubble-actions">
      {!hasSubscribe && (
        <button className="tutorial-btn" onClick={onNext}>
          {isLast ? 'Terminer' : isFirst ? 'Commencer' : 'Suivant'}
        </button>
      )}
      {!isLast && (
        <button className="tutorial-skip-btn" onClick={onQuit}>Quitter le tutoriel</button>
      )}
      <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
        {stepIndex + 1}/{totalSteps}
      </span>
    </div>
  );
}

export function TutorialOverlay() {
  const isActive = useTutorialStore((s) => s.isActive);
  const currentStep = useTutorialStore((s) => s.currentStep);
  const nextStep = useTutorialStore((s) => s.nextStep);
  const endTutorial = useTutorialStore((s) => s.endTutorial);
  const cleanupTutorial = useTutorialStore((s) => s.cleanupTutorial);

  const step = STEPS[currentStep];
  const targetRect = useTargetRect(step?.target, currentStep);

  useStepSubscriptions(currentStep, nextStep);

  const handleNext = useCallback(() => {
    if (currentStep < STEPS.length - 1) {
      nextStep();
    } else {
      endTutorial();
    }
  }, [currentStep, nextStep, endTutorial]);

  useEffect(() => {
    if (isActive) {
      document.body.style.overflow = 'hidden';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isActive]);

  useEffect(() => {
    document.body.classList.remove('tutorial-lock-modal', 'tutorial-lock-step3');
    if (!isActive) return;
    if (currentStep === 12) {
      document.body.classList.add('tutorial-lock-modal');
    } else if (currentStep === 3) {
      document.body.classList.add('tutorial-lock-step3');
    }
    return () => {
      document.body.classList.remove('tutorial-lock-modal', 'tutorial-lock-step3');
    };
  }, [isActive, currentStep]);

  useEffect(() => {
    if (!isActive) return;
    const cleanup = () => useTutorialStore.getState().cleanupTutorial();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') endTutorial();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('popstate', cleanup);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', cleanup);
    };
  }, [isActive, endTutorial]);

  const handleCreateRep = useCallback(() => {
    try { sessionStorage.setItem('alphaChess.openNewRepAfterTutorial', '1'); } catch {}
    cleanupTutorial();
    window.location.href = '/app';
  }, [cleanupTutorial]);

  if (!isActive || !step) return null;

  return createPortal(
    <TutorialOverlayInner
      step={step}
      stepIndex={currentStep}
      totalSteps={STEPS.length}
      targetRect={targetRect}
      onNext={handleNext}
      onQuit={endTutorial}
      onCreateRep={handleCreateRep}
    />,
    document.body,
  );
}

function TutorialCenterStep({
  step,
  stepIndex,
  totalSteps,
  onNext,
  onQuit,
  onCreateRep,
}: {
  step: StepConfig;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onQuit: () => void;
  onCreateRep: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  if (step.renderEndButtons) {
    return (
      <div className="tutorial-overlay">
        <div className="tutorial-mask" />
        <div
          className="tutorial-bubble"
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            maxWidth: 420,
            textAlign: 'center',
            zIndex: 100001,
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.25s ease',
          }}
        >
          <p className="tutorial-bubble-text">{step.text}</p>
          <div className="tutorial-bubble-actions" style={{ justifyContent: 'center' }}>
            <button className="tutorial-btn" onClick={onQuit}>Revenir à l'accueil</button>
            <button className="tutorial-btn" onClick={onCreateRep}>Créer un répertoire</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tutorial-overlay">
      <div className="tutorial-mask" />
      <div
        className="tutorial-bubble"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          maxWidth: 420,
          textAlign: 'center',
          zIndex: 100001,
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.25s ease',
        }}
      >
        <p className="tutorial-bubble-text">{step.text}</p>
        <BubbleActions
          hasSubscribe={!!step.subscribe}
          isFirst={stepIndex === 0}
          isLast={stepIndex >= totalSteps - 1}
          onNext={onNext}
          onQuit={onQuit}
          stepIndex={stepIndex}
          totalSteps={totalSteps}
        />
      </div>
    </div>
  );
}

function TutorialTargetedStep({
  step,
  stepIndex,
  totalSteps,
  targetRect,
  onNext,
  onQuit,
}: {
  step: StepConfig;
  stepIndex: number;
  totalSteps: number;
  targetRect: DOMRect | null;
  onNext: () => void;
  onQuit: () => void;
}) {
  const [bubbleStyle, setBubbleStyle] = useState<React.CSSProperties>({ opacity: 0, pointerEvents: 'none' });
  const [arrowDir, setArrowDir] = useState('');
  const [bubbleTriStyle, setBubbleTriStyle] = useState<React.CSSProperties>({});
  const [arrowEmojiStyle, setArrowEmojiStyle] = useState<React.CSSProperties>({});
  const bubbleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!targetRect || !bubbleRef.current) return;
    const b = bubbleRef.current.getBoundingClientRect();
    const gap = 16;

    let left: number, top: number, dir: string;

    switch (step.bubblePos) {
      case 'top':
        left = targetRect.left + targetRect.width / 2 - b.width / 2;
        top = targetRect.top - b.height - gap;
        dir = 'bottom';
        break;
      case 'bottom':
        left = targetRect.left + targetRect.width / 2 - b.width / 2;
        top = targetRect.bottom + gap;
        dir = 'top';
        break;
      case 'left':
        left = targetRect.left - b.width - gap;
        top = targetRect.top + targetRect.height / 2 - b.height / 2;
        dir = 'right';
        break;
      case 'right':
        left = targetRect.right + gap;
        top = targetRect.top + targetRect.height / 2 - b.height / 2;
        dir = 'left';
        break;
      default:
        left = targetRect.left;
        top = targetRect.bottom + gap;
        dir = 'top';
    }

    const clampedLeft = Math.max(12, Math.min(left, window.innerWidth - b.width - 12));
    const clampedTop = Math.max(12, Math.min(top, window.innerHeight - b.height - 12));

    setBubbleStyle({ left: clampedLeft, top: clampedTop, opacity: 1, pointerEvents: 'auto' });
    setArrowDir(dir);

    // Adjust arrow triangle to stay aligned with the target after clamping
    const tri: React.CSSProperties = {};
    if (dir === 'top' || dir === 'bottom') {
      const idealCx = targetRect.left + targetRect.width / 2;
      const bubbleCx = clampedLeft + b.width / 2;
      tri.marginLeft = '-6px';
      tri.left = `calc(50% + ${idealCx - bubbleCx}px)`;
      tri.right = 'auto';
    } else {
      const idealCy = targetRect.top + targetRect.height / 2;
      const bubbleCy = clampedTop + b.height / 2;
      tri.marginTop = '-6px';
      tri.top = `calc(50% + ${idealCy - bubbleCy}px)`;
      tri.bottom = 'auto';
    }
    setBubbleTriStyle(tri);

    // Arrow emoji position
    const arrPos = step.arrowPos || 'top';
    const ox = (step.arrowOffset?.x ?? 0) + (step.arrowOffset?.xFrac ?? 0) * targetRect.width;
    const oy = (step.arrowOffset?.y ?? 0) + (step.arrowOffset?.yFrac ?? 0) * targetRect.height;
    if (arrPos === 'left') {
      setArrowEmojiStyle({
        left: targetRect.left - 39 + ox,
        top: targetRect.top + targetRect.height / 2 - 12 + oy,
      });
    } else {
      setArrowEmojiStyle({
        left: targetRect.left + targetRect.width / 2 - 12 + ox,
        top: targetRect.top - 12 + oy,
      });
    }
  }, [targetRect, step.bubblePos, step.arrowPos, step.arrowOffset?.x, step.arrowOffset?.y, step.arrowOffset?.xFrac, step.arrowOffset?.yFrac]);

  const bu = 4;
  const segments = targetRect && !step.noMask ? maskSegments(targetRect, bu) : null;
  return (
    <div className="tutorial-overlay">
      {segments && segments.map((seg, i) => (
        <div key={i} className="tutorial-mask-segment" style={seg} />
      ))}
      {targetRect && !step.noMask && (
        <div
          className="tutorial-highlight-ring"
          style={{
            left: targetRect.left - bu,
            top: targetRect.top - bu,
            width: targetRect.width + bu * 2,
            height: targetRect.height + bu * 2,
          }}
        />
      )}

      {step.showArrow && targetRect && (
        <div
          className={`tutorial-arrow-anim tutorial-arrow-anim--${step.arrowPos || 'top'}`}
          style={arrowEmojiStyle}
        >
          👆
        </div>
      )}

      <div ref={bubbleRef} className="tutorial-bubble" style={bubbleStyle}>
        <div className={`tutorial-bubble-arrow tutorial-bubble-arrow--${arrowDir}`} style={bubbleTriStyle} />
        <p className="tutorial-bubble-text">{step.text}</p>
        <BubbleActions
          hasSubscribe={!!step.subscribe}
          isFirst={stepIndex === 0}
          isLast={stepIndex >= totalSteps - 1}
          onNext={onNext}
          onQuit={onQuit}
          stepIndex={stepIndex}
          totalSteps={totalSteps}
        />
      </div>
    </div>
  );
}

function TutorialOverlayInner({
  step,
  stepIndex,
  totalSteps,
  targetRect,
  onNext,
  onQuit,
  onCreateRep,
}: {
  step: StepConfig;
  stepIndex: number;
  totalSteps: number;
  targetRect: DOMRect | null;
  onNext: () => void;
  onQuit: () => void;
  onCreateRep: () => void;
}) {
  if (step.center) {
    return (
      <TutorialCenterStep
        step={step}
        stepIndex={stepIndex}
        totalSteps={totalSteps}
        onNext={onNext}
        onQuit={onQuit}
        onCreateRep={onCreateRep}
      />
    );
  }

  return (
    <TutorialTargetedStep
      step={step}
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      targetRect={targetRect}
      onNext={onNext}
      onQuit={onQuit}
    />
  );
}
