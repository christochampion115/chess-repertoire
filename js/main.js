import { state, initState } from './state.js';
import { eventBus } from './events.js';
import * as ui from './ui.js';
import * as repertoire from './repertoire.js';
import * as auth from './auth.js';
import { toggleAnalysis, setAnalysisDepth } from './analysis.js';
import { updateStatsSortBy } from './ui.js';

function exposeGlobals() {
  window.hideMenus = ui.hideMenus;
  window.closeModals = ui.closeModals;
  window.handleRightClick = ui.handleRightClick;
  window.toggleMonitorMenu = ui.toggleMonitorMenu;
  window.togglePanel = ui.togglePanel;
  window.openNewRepModal = ui.openNewRepModal;
  window.selectRepCreationMode = ui.selectRepCreationMode;
  window.flipBoard = ui.flipBoard;
  window.openNameVarModal = ui.openNameVarModal;
  window.openCommentModal = ui.openCommentModal;
  window.handleDeleteClick = ui.openDeleteClick;
  window.selectSymbol = repertoire.selectSymbol;
  window.resetPosition = ui.resetPosition;
  window.navBack = ui.navBack;
  window.navForward = ui.navForward;
  window.confirmNameVar = repertoire.confirmNameVar;
  window.confirmComment = ui.confirmComment;
  window.confirmDelete = repertoire.confirmDelete;
  window.createNewRepertoire = repertoire.createNewRepertoire;
  window.confirmRepertoireCreation = repertoire.confirmRepertoireCreation;
  window.selectCol = ui.selectCol;
  window.confirmRenameRep = repertoire.confirmRenameRep;
  window.openBoardThemeMenu = ui.openBoardThemeMenu;
  window.showStopTrainingModal = ui.showStopTrainingModal;
  window.confirmStartTraining = ui.confirmStartTraining;
  window.cancelStartTraining = ui.cancelStartTraining;
  window.confirmStopTraining = ui.confirmStopTraining;
  window.cancelStopTraining = ui.cancelStopTraining;
  window.closeTrainingDone = ui.closeTrainingDone;
  window.confirmTrainingInterrupt = ui.confirmTrainingInterrupt;
  window.cancelTrainingInterrupt = ui.cancelTrainingInterrupt;
  window.toggleAnalysis = toggleAnalysis;
  window.setAnalysisDepth = setAnalysisDepth;
  window.showSplashScreen = ui.showSplashScreen;
  window.hideSplashScreen = ui.hideSplashScreen;
  window.showSplashForm = ui.showSplashForm;
  window.backToSplashWelcome = ui.backToSplashWelcome;
  window.showSplashGuest = ui.showSplashGuest;
  window.submitSplashForm = ui.submitSplashForm;
  window.confirmGuestMode = ui.confirmGuestMode;
  window.openAccountModal = ui.openAccountModal;
  window.switchAuthMode = ui.switchAuthMode;
  window.submitAccountForm = ui.submitAccountForm;
  window.updateAccountUI = ui.updateAccountUI;
  window.logoutAccount = ui.logoutAccount;
  window.updateStatsSortBy = updateStatsSortBy;
}

function assignDomReferences() {
  state.boardEl = document.getElementById('board');
  state.ctxMenuEl = document.getElementById('ctx-menu');
  state.modalOverlayEl = document.getElementById('modal-overlay');
  state.dynamicModals = document.getElementById('dynamic-modals');
}

function initSortMenuToggle() {
  const sortToggleBtn = document.getElementById('stats-sort-toggle-btn');
  const sortMenu = document.getElementById('stats-sort-menu');
  const sortMenuItems = document.querySelectorAll('.stats-sort-menu-item');

  if (!sortToggleBtn || !sortMenu) return;
  if (sortToggleBtn.dataset.sortbound) return;
  sortToggleBtn.dataset.sortbound = '1';

  sortToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = sortMenu.hasAttribute('hidden');
    if (isHidden) {
      sortMenu.removeAttribute('hidden');
    } else {
      sortMenu.setAttribute('hidden', '');
    }
  });

  // Close menu when clicking outside (but not on button or menu)
  document.addEventListener('click', (e) => {
    if (!sortMenu.contains(e.target) && !sortToggleBtn.contains(e.target)) {
      sortMenu.setAttribute('hidden', '');
    }
  });

  // Handle sort menu item clicks
  sortMenuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const sortType = item.getAttribute('data-sort-type');
      
      // Update active state
      sortMenuItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      // Call the update function with the sort type
      updateStatsSortBy(sortType);

      // Close menu after selection
      sortMenu.setAttribute('hidden', '');
    });
  });
}

function initAnalysisMenuToggle() {
  const analysisToggleBtn = document.getElementById('analysis-toggle-btn');
  const analysisMenu = document.getElementById('stats-analysis-menu');

  if (!analysisToggleBtn || !analysisMenu) return;
  if (analysisToggleBtn.dataset.analysismenubound) return;
  analysisToggleBtn.dataset.analysismenubound = '1';

  analysisToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = analysisMenu.hasAttribute('hidden');
    if (isHidden) {
      analysisMenu.removeAttribute('hidden');
      window.toggleAnalysis && toggleAnalysis();
    } else {
      analysisMenu.setAttribute('hidden', '');
      window.toggleAnalysis && toggleAnalysis();
    }
  });

  // Close menu when clicking outside (but not on button or menu)
  document.addEventListener('click', (e) => {
    if (!analysisMenu.contains(e.target) && !analysisToggleBtn.contains(e.target)) {
      analysisMenu.setAttribute('hidden', '');
    }
  });

  // Prevent closing menu when interacting with slider
  analysisMenu.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

function initAnalysisControls() {
  const depthInput = document.getElementById('analysis-depth-input');
  const depthValue = document.getElementById('analysis-depth-value');

  if (depthInput) {
    depthInput.addEventListener('input', (e) => {
      const depth = parseInt(e.target.value, 10);
      if (depthValue) {
        depthValue.textContent = depth;
      }
      state.analysisDepth = depth;
      if (window.setAnalysisDepth) {
        window.setAnalysisDepth(depth);
      }
    });
  }
}

async function initializeApp() {
  initState();
  assignDomReferences();
  eventBus.on('render', ui.render);
  eventBus.on('syncDone', ui.updateAccountUI); // mise à jour statut sync sans re-render complet
  eventBus.on('closeModals', ui.closeModals);
  eventBus.on('hideMenus', ui.hideMenus);
  exposeGlobals();
  initSortMenuToggle();
  initAnalysisMenuToggle();
  initAnalysisControls();

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
