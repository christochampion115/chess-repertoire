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

// Avertissement de quitter la page en mode invité si des répertoires ont été créés.
window.addEventListener('beforeunload', (event) => {
  if (!state.auth.user && state.repertoires && state.repertoires.length > 0) {
    event.preventDefault();
    // La plupart des navigateurs affichent leur propre message mais requirent ce returnValue.
    event.returnValue = '';
  }
});
