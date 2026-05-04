import { state } from './state.js';
import * as ui from './ui.js';
import * as repertoire from './repertoire.js';
import { toggleAnalysis, setAnalysisDepth } from './analysis.js';
import { updateStatsSortBy } from './ui.js';

const BUTTON_BINDINGS = [
  // ── Navigation entre vues ──
  ['btn-nav-home',              () => ui.showHomeView()],
  ['feature-card-repertoire',   () => ui.showAppView()],
  ['feature-card-training',     () => ui.openHomeTrainingModal()],

  // ── Top-bar ──
  ['btn-open-medals',            () => ui.openMedalsModal()],

  // ── Modale auth (non connecté) ──
  ['btn-auth-go-login',          () => ui.showAuthPanel('login')],
  ['btn-auth-go-signup',         () => ui.showAuthPanel('signup')],
  ['btn-auth-go-guest',          () => ui.showAuthPanel('guest')],
  ['auth-submit-btn',            () => ui.submitAuthForm()],
  ['btn-auth-back',              () => ui.showAuthPanel('welcome')],
  ['btn-auth-guest-confirm',     () => ui.confirmAuthGuest()],
  ['btn-auth-guest-back',        () => ui.showAuthPanel('welcome')],

  // ── Modale profil ──
  ['btn-profile-close',          () => ui.closeProfileModal()],
  ['btn-profile-logout',         () => ui.logoutAccount()],
  ['btn-profile-save-username',  () => ui.saveProfileUsername()],
  ['btn-profile-save-email',     () => ui.saveProfileEmail()],
  ['btn-profile-save-password',  () => ui.saveProfilePassword()],

  // ── Entraînement ──
  ['btn-training-stop',          () => ui.showStopTrainingModal()],

  // ── Contrôles échiquier ──
  ['btn-reset-position',         () => ui.resetPosition()],
  ['btn-nav-back',               () => ui.navBack()],
  ['btn-nav-forward',            () => ui.navForward()],
  ['btn-open-board-theme',       () => ui.openBoardThemeMenu()],

  // ── Moniteur ──
  ['monitor-menu-trigger',       (event) => ui.toggleMonitorMenu(event)],
  ['btn-open-new-rep',           (event) => ui.openNewRepModal(event)],

  // ── Splash screen ──
  ['btn-splash-login',           () => ui.showSplashForm('login')],
  ['btn-splash-signup',          () => ui.showSplashForm('signup')],
  ['btn-splash-guest',           () => ui.showSplashGuest()],
  ['splash-submit-btn',          () => ui.submitSplashForm()],
  ['btn-splash-tab-login',       () => ui.showSplashForm('login')],
  ['btn-splash-tab-signup',      () => ui.showSplashForm('signup')],
  ['btn-splash-back',            () => ui.backToSplashWelcome()],
  ['btn-splash-guest-confirm',   () => ui.confirmGuestMode()],
  ['btn-splash-guest-back',      () => ui.backToSplashWelcome()],

  // ── Modale compte ──
  ['btn-account-switch-mode',    () => ui.switchAuthMode()],
  ['account-submit-btn',         () => ui.submitAccountForm()],

  // ── Modales répertoire ──
  ['btn-var-save',               () => repertoire.confirmNameVar()],
  ['btn-comment-save',           () => ui.confirmComment()],
  ['btn-delete-cancel',          () => ui.closeModals()],
  ['btn-delete-confirm',         () => repertoire.confirmDelete()],

  // ── Modales entraînement ──
  ['btn-training-start-cancel',        () => ui.cancelStartTraining()],
  ['modal-training-confirm-button',    () => ui.confirmStartTraining()],
  ['btn-training-interrupt-cancel',    () => ui.cancelTrainingInterrupt()],
  ['btn-training-interrupt-confirm',   () => ui.confirmTrainingInterrupt()],
  ['btn-training-stop-cancel',         () => ui.cancelStopTraining()],
  ['btn-training-stop-confirm',        () => ui.confirmStopTraining()],
  ['btn-training-done-close',          () => ui.closeTrainingDone()],
  ['btn-training-defeat-retry',        () => ui.retrySurvivalTraining()],
  ['btn-training-defeat-abandon',      () => ui.abandonSurvivalTraining()],

  // ── Médailles ──
  ['btn-medals-close',           () => ui.closeModals()],
];

function shouldIgnoreKeyboardNavigationTarget(target) {
  if (!target || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function initKeyboardNavigationBindings() {
  if (!document.body || document.body.dataset.keyboardnavbound) return;

  document.addEventListener('keydown', (event) => {
    if (shouldIgnoreKeyboardNavigationTarget(event.target)) return;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      ui.navBack();
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      ui.navForward();
    }
  });

  document.body.dataset.keyboardnavbound = '1';
}

function initCoreUiBindings() {
  if (!document.body?.dataset.bodymenubound) {
    document.body.addEventListener('click', () => ui.hideMenus());
    document.body.dataset.bodymenubound = '1';
  }

  const accordionHeaders = document.querySelectorAll('.accordion-header[data-panel]');
  accordionHeaders.forEach((header) => {
    if (header.dataset.panelbound) return;
    header.dataset.panelbound = '1';

    header.addEventListener('click', () => {
      const panel = header.getAttribute('data-panel');
      if (!panel) return;
      ui.togglePanel(panel);
    });
  });

  const modalOverlay = document.getElementById('modal-overlay');
  if (modalOverlay && !modalOverlay.dataset.overlaybound) {
    modalOverlay.addEventListener('click', (event) => {
      if (event.target !== modalOverlay) return;
      ui.closeModals();
    });
    modalOverlay.dataset.overlaybound = '1';
  }

  const board = document.getElementById('board');
  if (board && !board.dataset.ctxbound) {
    board.addEventListener('contextmenu', (event) => ui.handleRightClick(event, 'board'));
    board.dataset.ctxbound = '1';
  }

  const monitorBox = document.getElementById('monitor-box');
  if (monitorBox && !monitorBox.dataset.ctxbound) {
    monitorBox.addEventListener('contextmenu', (event) => {
      const targetEl = event.target instanceof Element ? event.target : null;
      if (targetEl?.closest('.analysis-row[data-move-uci]')) return;
      ui.handleRightClick(event, 'monitor');
    });
    monitorBox.dataset.ctxbound = '1';
  }

  if (!document.body?.dataset.movectxbound) {
    document.addEventListener('contextmenu', (event) => {
      const targetEl = event.target instanceof Element ? event.target : null;
      if (!targetEl) return;

      const statsRow = targetEl.closest('.stats-row[data-move-uci]');
      if (statsRow) {
        const uci = statsRow.getAttribute('data-move-uci') || '';
        const san = statsRow.getAttribute('data-move-san') || '';
        if (uci) ui.handleRightClick(event, 'stats_move', { uci, san });
        return;
      }

      const analysisRow = targetEl.closest('.analysis-row[data-move-uci]');
      if (analysisRow) {
        const uci = analysisRow.getAttribute('data-move-uci') || '';
        const san = analysisRow.getAttribute('data-move-san') || '';
        if (uci) ui.handleRightClick(event, 'analysis_move', { uci, san });
      }
    });
    document.body.dataset.movectxbound = '1';
  }

  const ctxMenu = document.getElementById('ctx-menu');
  if (ctxMenu && !ctxMenu.dataset.ctxmenubound) {
    ctxMenu.addEventListener('click', (event) => {
      event.stopPropagation();

      const actionEl = event.target.closest('[data-menu-action]');
      if (actionEl) {
        const action = actionEl.getAttribute('data-menu-action');
        if (action === 'flip-board') ui.flipBoard();
        if (action === 'rename-repertoire') ui.openRenameRepModal();
        if (action === 'name-variation') ui.openNameVarModal();
        if (action === 'add-to-tree') ui.addSelectedMoveToTree();
        if (action === 'comment') ui.openCommentModal();
        if (action === 'delete') ui.openDeleteClick();
        return;
      }

      const symbolEl = event.target.closest('[data-symbol]');
      if (symbolEl) {
        repertoire.selectSymbol(symbolEl.getAttribute('data-symbol') || '');
      }
    });
    ctxMenu.dataset.ctxmenubound = '1';
  }
}

function initActionButtonBindings() {
  const bindClick = (id, handler) => {
    const el = document.getElementById(id);
    if (!el || el.dataset.clickbound) return;
    el.addEventListener('click', handler);
    el.dataset.clickbound = '1';
  };

  BUTTON_BINDINGS.forEach(([id, handler]) => bindClick(id, handler));

  const repModeButtons = document.querySelectorAll('.rep-create-mode-btn[data-rep-create-mode]');
  repModeButtons.forEach((button) => {
    if (button.dataset.clickbound) return;
    button.addEventListener('click', () => {
      const mode = button.getAttribute('data-rep-create-mode');
      if (!mode) return;
      ui.selectRepCreationMode(mode);
    });
    button.dataset.clickbound = '1';
  });

  const colorOptions = document.querySelectorAll('.color-opt[data-color]');
  colorOptions.forEach((option) => {
    if (option.dataset.clickbound) return;
    option.addEventListener('click', () => {
      const color = option.getAttribute('data-color');
      if (!color) return;
      ui.selectCol(color);
    });
    option.dataset.clickbound = '1';
  });
}

function initSortMenuToggle() {
  const sortToggleBtn = document.getElementById('stats-sort-toggle-btn');
  const sortMenu = document.getElementById('stats-sort-menu');
  const sortMenuItems = document.querySelectorAll('.stats-sort-menu-item');

  if (!sortToggleBtn || !sortMenu) return;
  if (sortToggleBtn.dataset.sortbound) return;
  sortToggleBtn.dataset.sortbound = '1';

  sortToggleBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const isHidden = sortMenu.hasAttribute('hidden');
    if (isHidden) {
      sortMenu.removeAttribute('hidden');
    } else {
      sortMenu.setAttribute('hidden', '');
    }
  });

  document.addEventListener('click', (event) => {
    if (!sortMenu.contains(event.target) && !sortToggleBtn.contains(event.target)) {
      sortMenu.setAttribute('hidden', '');
    }
  });

  sortMenuItems.forEach((item) => {
    item.addEventListener('click', (event) => {
      event.stopPropagation();
      const sortType = item.getAttribute('data-sort-type');

      sortMenuItems.forEach((menuItem) => menuItem.classList.remove('active'));
      item.classList.add('active');

      updateStatsSortBy(sortType);
      sortMenu.setAttribute('hidden', '');
    });
  });
}

function initAnalysisSwitchToggle() {
  const analysisSwitch = document.getElementById('analysis-toggle-switch');

  if (!analysisSwitch) return;
  if (analysisSwitch.dataset.analysisbound) return;
  analysisSwitch.dataset.analysisbound = '1';

  analysisSwitch.addEventListener('change', () => {
    toggleAnalysis();
    ui.render();
  });
}

function initAnalysisControls() {
  const depthInput = document.getElementById('analysis-depth-input');
  const depthValue = document.getElementById('analysis-depth-value');

  if (depthInput) {
    depthInput.addEventListener('input', (event) => {
      const depth = parseInt(event.target.value, 10);
      if (depthValue) {
        depthValue.textContent = depth;
      }
      state.analysisDepth = depth;
      setAnalysisDepth(depth);
    });
  }
}

export function initDomBindings() {
  initCoreUiBindings();
  initActionButtonBindings();
  initKeyboardNavigationBindings();
  initSortMenuToggle();
  initAnalysisSwitchToggle();
  initAnalysisControls();
  initProfileModalBindings();
}

/**
 * Gère les clics sur les onglets de la modale profil (.profile-tab)
 * et les onglets de la modale auth (.auth-tab-btn).
 * Utilise la délégation sur le document pour éviter les double-bindings.
 */
function initProfileModalBindings() {
  if (document.body.dataset.profiletabsbound) return;
  document.body.dataset.profiletabsbound = '1';

  document.addEventListener('click', (event) => {
    // Onglets modale profil
    const profileTab = event.target.closest('.profile-tab[data-profile-tab]');
    if (profileTab) {
      const tab = profileTab.getAttribute('data-profile-tab');
      if (tab) ui.switchProfileTab(tab);
      return;
    }

    // Onglets modale auth (login / signup)
    const authTab = event.target.closest('.auth-tab-btn[data-auth-tab]');
    if (authTab) {
      const tab = authTab.getAttribute('data-auth-tab');
      if (tab) ui.showAuthPanel(tab);
    }
  });
}
