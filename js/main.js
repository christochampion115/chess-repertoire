import { state, initState } from './state.js';
import { eventBus } from './events.js';
import * as ui from './ui.js';
import * as auth from './auth.js';
import { initDomBindings } from './domBindings.js';

function assignDomReferences() {
  state.boardEl = document.getElementById('board');
  state.ctxMenuEl = document.getElementById('ctx-menu');
  state.modalOverlayEl = document.getElementById('modal-overlay');
  state.dynamicModals = document.getElementById('dynamic-modals');
}

async function initializeApp() {
  initState();
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
  
  // Afficher la splash screen si l'utilisateur n'est pas connecté et aucune données n'ont été restaurées
  if (!restored && !state.auth.user) {
    ui.showSplashScreen();
  } else {
    ui.hideSplashScreen();
  }
  
  ui.render();
}

initializeApp();
