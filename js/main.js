import { state, initState } from './state.js';
import { eventBus } from './events.js';
import * as ui from './ui.js';
import * as auth from './auth.js';
import { initDomBindings } from './domBindings.js';
import { loadState } from './storage.js';

const BOARD_THEME_KEY = 'alphaChess.boardTheme';
const FOLDERS_KEY = 'alphaChess.repFolders';

function assignDomReferences() {
  state.boardEl = document.getElementById('board');
  state.ctxMenuEl = document.getElementById('ctx-menu');
  state.modalOverlayEl = document.getElementById('modal-overlay');
  state.dynamicModals = document.getElementById('dynamic-modals');
}

async function initializeApp() {
  initState();

  // Restaurer le thème de l'échiquier choisi par l'utilisateur
  const savedTheme = loadState(BOARD_THEME_KEY);
  if (savedTheme?.light && savedTheme?.dark) {
    state.boardTheme = savedTheme;
  }

  // Restaurer les dossiers de répertoires depuis le localStorage
  const savedFolders = loadState(FOLDERS_KEY);
  if (savedFolders && typeof savedFolders === 'object') {
    state.repFolders = savedFolders;
  }

  assignDomReferences();
  eventBus.on('render', ui.render);
  eventBus.on('syncDone', ui.updateAccountUI); // mise à jour statut sync sans re-render complet
  eventBus.on('closeModals', ui.closeModals);
  eventBus.on('hideMenus', ui.hideMenus);
  initDomBindings();

  auth.registerGuestModeLoader(() => {
    // Ne pas charger les données d'exemple ici pour éviter les doublons
    // Elles seront chargées dans confirmGuestMode()
    ui.render();
  });

  const restored = await auth.bootstrapSession();

  // Dans tous les cas, on démarre sur la page d'accueil.
  // Le splash screen n'est plus utilisé comme point d'entrée.
  ui.hideSplashScreen();
  ui.showHomeView();
  
  ui.render();
}

initializeApp();

// ── Outil de debug console ────────────────────────────────────────────────────
// Appel : window.debugRepertoire()  (optionnel : window.debugRepertoire(repIndex))
window.debugRepertoire = function debugRepertoire(repIndex) {
  const reps = state.repertoires;
  if (!reps || reps.length === 0) {
    console.warn('[debugRepertoire] Aucun répertoire chargé.');
    return;
  }

  const targets = repIndex !== undefined ? [reps[repIndex]] : reps;

  targets.forEach(rep => {
    if (!rep) return;
    const name = rep.name || '(sans nom)';
    const transpoNodes = [];
    const brokenTranspos = [];
    let totalNodes = 0;

    function getPath(node) {
      const parts = [];
      let cur = node;
      while (cur && cur.parent) {
        parts.unshift(cur.san);
        cur = cur.parent;
      }
      return parts.join(' ');
    }

    function walk(node) {
      totalNodes++;
      if (node.isTransposition) {
        if (!node.sourceNode) {
          brokenTranspos.push({ node, path: getPath(node) });
        } else {
          transpoNodes.push({
            path: getPath(node),
            sourcePath: getPath(node.sourceNode),
            sourceId: node.sourceNode.id,
          });
        }
        return; // feuille de transposition, pas de récursion
      }
      node.children.forEach(walk);
    }

    walk(rep);

    console.groupCollapsed(`[debugRepertoire] "${name}" — ${totalNodes} nœuds`);
    console.log(`  Transpositions valides : ${transpoNodes.length}`);
    transpoNodes.forEach(t => console.log(`    ↩ ${t.path}  →  ${t.sourcePath}`));

    if (brokenTranspos.length > 0) {
      console.warn(`  ⚠️  Transpositions CASSÉES (sourceNode null) : ${brokenTranspos.length}`);
      brokenTranspos.forEach(t => console.warn(`    ✗ ${t.path}`));
    } else {
      console.log('  Aucune transposition cassée ✓');
    }
    console.groupEnd();
  });
};

// Avertissement de quitter la page en mode invité si des répertoires ont été créés.
window.addEventListener('beforeunload', (event) => {
  if (!state.auth.user && state.repertoires && state.repertoires.length > 0) {
    event.preventDefault();
    // La plupart des navigateurs affichent leur propre message mais requirent ce returnValue.
    event.returnValue = '';
  }
});
