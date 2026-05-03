import { state } from './state.js';
import { renderBoard, ANNOTATION_STYLE } from './board.js';
import { eventBus } from './events.js';
import { renderArbre, countTotalChildren, getPathString } from './arbre.js';
import {
  handleSquareClick,
  playUciMove,
  initExampleData,
  confirmRepertoireCreation,
  confirmRenameRep,
  confirmDelete as confirmDeleteMove,
} from './repertoire.js';
import { fetchLichessStats } from './stats.js';
import { loginWithCredentials, signupWithCredentials, logoutSession } from './auth.js';
import { requestVisibleMoveAnnotations, renderEvalBar } from './analysis.js';
import { getMoveTotalGames, getMoveWinRate, getMoveEnginePreference } from './statsUtils.js';

const ELO_MIN = 0;
const ELO_MAX = 3000;
const ELO_STEP = 50;
const ELO_MIN_GAP = 100;
const STATS_RELOAD_DEBOUNCE_MS = 180;
const ELO_MINI_LOADER_MS = 420;
const GLOBAL_LOADER_MIN_MS = 500; // durée minimale d'affichage du loader global
let statsReloadTimer = null;
let eloMiniLoaderTimer = null;
let globalLoaderTimer = null;     // timer pour la durée minimale du loader global
let globalLoaderShownAt = 0;      // timestamp du moment où le loader global a été affiché

function getEngineColorForMove(move) {
  const value = state.moveAnnotationValues?.[move.uci];
  if (!Number.isFinite(value)) return '#808080';

  const clamped = Math.max(-250, Math.min(250, value));
  const stops = [
    { cp: -250, color: [214, 40, 40] },
    { cp: -35,  color: [238, 120, 48] },
    { cp:   0,  color: [234, 179, 8] },
    { cp:  35,  color: [110, 197, 58] },
    { cp: 250,  color: [34, 166, 76] }
  ];

  let leftStop = stops[0];
  let rightStop = stops[stops.length - 1];

  for (let index = 0; index < stops.length - 1; index += 1) {
    const current = stops[index];
    const next = stops[index + 1];
    if (clamped >= current.cp && clamped <= next.cp) {
      leftStop = current;
      rightStop = next;
      break;
    }
  }

  if (leftStop.cp === rightStop.cp) {
    return `rgb(${leftStop.color.join(', ')})`;
  }

  const ratio = (clamped - leftStop.cp) / (rightStop.cp - leftStop.cp);
  const channels = leftStop.color.map((channel, index) => {
    const target = rightStop.color[index];
    return Math.round(channel + (target - channel) * ratio);
  });

  return `rgb(${channels.join(', ')})`;
}

function sortStatsMoves(moves, fen) {
  const sortBy = state.statsFilters?.sortBy || 'frequency';
  return moves
    .map((move, index) => ({ move, index }))
    .sort((left, right) => {
      const total_l = getMoveTotalGames(left.move);
      const total_r = getMoveTotalGames(right.move);

      if (sortBy === 'winrate-white') {
        const diff = (total_r > 0 ? right.move.white / total_r : 0) - (total_l > 0 ? left.move.white / total_l : 0);
        if (diff !== 0) return diff;
      } else if (sortBy === 'winrate-black') {
        const diff = (total_r > 0 ? right.move.black / total_r : 0) - (total_l > 0 ? left.move.black / total_l : 0);
        if (diff !== 0) return diff;
      } else if (sortBy === 'winrate') {
        const diff = getMoveWinRate(right.move, fen) - getMoveWinRate(left.move, fen);
        if (diff !== 0) return diff;
      } else if (sortBy === 'engine') {
        const rightValue = getMoveEnginePreference(right.move);
        const leftValue = getMoveEnginePreference(left.move);
        if (Number.isFinite(rightValue) || Number.isFinite(leftValue)) {
          const diff = rightValue - leftValue;
          if (diff !== 0) return diff;
        }
      } else {
        const diff = total_r - total_l;
        if (diff !== 0) return diff;
      }

      const countDiff = total_r - total_l;
      if (countDiff !== 0) return countDiff;
      return left.index - right.index;
    })
    .map(entry => entry.move);
}
let pendingTrainingNode = null;
let pendingTrainingColor = null;
let pendingTrainingMissingNodes = [];
let pendingTrainingMode = 'vertical';
let pendingTrainingInterruptAction = null;
let trainingAutoPlayTimer = null;

const TRAINING_MODES = {
  horizontal: {
    label: 'Mode horizontal',
    description: 'Va au bout d’une variante, puis remonte à la bifurcation la plus proche de sa fin.'
  },
  vertical: {
    label: 'Mode vertical',
    description: 'Fait tous les coups 1, puis tous les coups 2, puis tous les coups 3.'
  },
  express: {
    label: 'Express',
    description: 'Teste uniquement les positions finales des lignes, sans reroll depuis le départ.'
  },
  randomizer: {
    label: 'Randomizer',
    description: 'Affiche des positions de test totalement au hasard dans l’arbre, sans reroll.'
  }
};

eventBus.on('trainingPlayerMoved', () => {
  advanceAutoPlay(50); // réponse immédiate après coup validé
});

eventBus.on('trainingTargetCompleted', () => {
  showNextTrainingTarget(50);
});

eventBus.on('openMoveContextMenu', ({ event, source, move }) => {
  if (!event || !move) return;
  handleRightClick(event, source || 'stats_move', move);
});

export function render() {
  hideCurrentTooltip();
  updateAccountUI();
  updateMonitor();
  renderBoard(handleSquareClick);

  const repertoireContainer = document.getElementById('repertoire-content');
  const arbreContainer = document.getElementById('arbre-content');
  const statsPanel = document.getElementById('stats-panel');
  const statsDetails = document.getElementById('stats-details');
  const openingInfo = document.getElementById('opening-info');

  syncStatsFilterControls();

  // Barre d'évaluation (s'adapte au retournement)
  renderEvalBar();

  // Mettre à jour l'affichage du tri
  updateSortButtonStates();
  
  // Mettre à jour l'état de l'interrupteur Analyse + slider inline
  const analysisSwitch = document.getElementById('analysis-toggle-switch');
  const analysisDepthInline = document.getElementById('analysis-depth-inline');
  const monitorAnalysisSection = document.getElementById('monitor-analysis-section');
  const analysisDepthValue = document.getElementById('analysis-depth-value');
  const analysisDepthInput = document.getElementById('analysis-depth-input');
  const analysisDepthFill = document.getElementById('analysis-depth-fill');
  const depth = state.analysisDepth ?? 10;
  if (analysisSwitch) {
    analysisSwitch.checked = Boolean(state.isAnalysisEnabled);
  }
  if (analysisDepthInline) {
    analysisDepthInline.hidden = !state.isAnalysisEnabled;
  }
  if (monitorAnalysisSection) {
    monitorAnalysisSection.classList.toggle('is-collapsed', !state.isAnalysisEnabled);
  }
  if (analysisDepthValue) {
    analysisDepthValue.textContent = String(depth);
  }
  if (analysisDepthInput) {
    analysisDepthInput.value = String(depth);
  }
  if (analysisDepthFill) {
    const pct = ((depth - 5) / 15) * 100;
    analysisDepthFill.style.width = `${pct}%`;
  }

  document.querySelectorAll('.accordion-header').forEach(header => {
    const panel = header.dataset.panel;
    if (panel) {
      header.classList.toggle('active', state.openPanels[panel]);
    }
  });

  if (repertoireContainer) {
    repertoireContainer.innerHTML = '';
    repertoireContainer.classList.toggle('open', state.openPanels.repertoire);
    if (state.openPanels.repertoire) {
      renderRepertoireList(repertoireContainer);
    } else {
      repertoireContainer.innerHTML = '<div class="panel-empty">Cliquez pour ouvrir les répertoires.</div>';
    }
  }

  if (arbreContainer) {
    arbreContainer.innerHTML = '';
    arbreContainer.classList.toggle('open', state.openPanels.arbre);
    if (state.trainingActive) {
      arbreContainer.innerHTML = '<div class="panel-empty">Arbre masqué pendant le mode entraînement.</div>';
    } else if (state.openPanels.arbre) {
      arbreContainer.appendChild(renderArbre(handleNodeSelect, handleTreeContext));
    } else {
      arbreContainer.innerHTML = '<div class="panel-empty">Cliquez pour ouvrir l’arbre.</div>';
    }
  }

  if (openingInfo) {
    openingInfo.textContent = state.lichessStats && state.lichessStats.openingName
      ? `${state.lichessStats.openingName}${state.lichessStats.eco ? ` (${state.lichessStats.eco})` : ''}`
      : '';
  }

  if (statsPanel) {
    if (state.trainingActive) {
      statsPanel.style.display = 'none';
    } else {
      statsPanel.style.display = '';
      renderStatsPanel(statsPanel, statsDetails);
    }
  }

  // Masquer toute la zone stats en mode entraînement
  const statsShell = document.getElementById('stats-filter-shell');
  const statsLoader = document.getElementById('stats-global-loader');
  const statsDetailsEl = document.getElementById('stats-details');
  const openingInfoEl = document.getElementById('opening-info');
  const isTraining = state.trainingActive;
  if (statsShell) statsShell.style.display = isTraining ? 'none' : '';
  if (statsLoader) statsLoader.style.display = isTraining ? 'none !important' : '';
  if (statsDetailsEl) statsDetailsEl.style.display = isTraining ? 'none' : '';
  if (openingInfoEl) openingInfoEl.style.display = isTraining ? 'none' : '';

  if (!isTraining) loadStatsIfNeeded(state.currentNode?.fen);

  const trainingBanner = document.getElementById('training-banner');
  if (trainingBanner) {
    trainingBanner.style.display = state.trainingActive ? 'flex' : 'none';
    const bannerLabel = document.getElementById('training-banner-label');
    if (bannerLabel) bannerLabel.textContent = state.trainingLabel || '';
  }
}

function getStatsRequestKey(fen) {
  const min = state.statsFilters?.eloMin ?? ELO_MIN;
  const max = state.statsFilters?.eloMax ?? ELO_MAX;
  const db = state.statsFilters?.currentDatabase ?? 'lichess';
  return `${fen || ''}|${min},${max}|${db}`;
}

function normalizeEloRange(minRaw, maxRaw, source = 'max') {
  let min = Number.parseInt(minRaw, 10);
  let max = Number.parseInt(maxRaw, 10);

  if (!Number.isFinite(min)) min = ELO_MIN;
  if (!Number.isFinite(max)) max = ELO_MAX;

  min = Math.min(ELO_MAX, Math.max(ELO_MIN, min));
  max = Math.min(ELO_MAX, Math.max(ELO_MIN, max));

  if (min > max) {
    [min, max] = [max, min];
  }

  if (max - min < ELO_MIN_GAP) {
    if (source === 'min') {
      min = max - ELO_MIN_GAP;
    } else {
      max = min + ELO_MIN_GAP;
    }

    if (min < ELO_MIN) {
      min = ELO_MIN;
      max = min + ELO_MIN_GAP;
    }
    if (max > ELO_MAX) {
      max = ELO_MAX;
      min = max - ELO_MIN_GAP;
    }
  }

  return { min, max };
}

function formatEloRangeLabel(min, max) {
  if (min === ELO_MIN && max === ELO_MAX) {
    return 'Any rating';
  }
  return `${min}–${max}`;
}

function updateEloSliderTrack(min, max) {
  const fill = document.getElementById('elo-range-fill');
  if (!fill) return;

  const left = ((min - ELO_MIN) / (ELO_MAX - ELO_MIN)) * 100;
  const right = ((max - ELO_MIN) / (ELO_MAX - ELO_MIN)) * 100;
  fill.style.left = `${left}%`;
  fill.style.width = `${Math.max(0, right - left)}%`;
}

function scheduleStatsReloadForCurrentFen() {
  const fen = state.currentNode?.fen;
  if (!fen) return;

  if (statsReloadTimer) {
    clearTimeout(statsReloadTimer);
  }

  statsReloadTimer = setTimeout(() => {
    loadStatsIfNeeded(state.currentNode?.fen, true, { fromEloChange: true });
  }, STATS_RELOAD_DEBOUNCE_MS);
}

// ─── Loader global ─────────────────────────────────────────────────────────

/** Affiche le loader global et masque le panneau des coups.
 *  Enregistre l'heure de départ pour garantir une durée minimum (GLOBAL_LOADER_MIN_MS). */
function showGlobalLoader() {
  globalLoaderShownAt = Date.now();
  // Annule un éventuel timer de masquage en cours
  if (globalLoaderTimer) {
    clearTimeout(globalLoaderTimer);
    globalLoaderTimer = null;
  }
  const loader = document.getElementById('stats-global-loader');
  const statsPanel = document.getElementById('stats-panel');
  const statsDetails = document.getElementById('stats-details');
  if (loader) loader.classList.add('is-visible');
  if (statsPanel) statsPanel.style.display = 'none';
  if (statsDetails) statsDetails.style.display = 'none';
}

/** Masque le loader global (en respectant GLOBAL_LOADER_MIN_MS),
 *  puis exécute le callback (affichage des coups + re-render). */
function hideGlobalLoaderAndRender(callback) {
  const elapsed = Date.now() - globalLoaderShownAt;
  const remaining = Math.max(0, GLOBAL_LOADER_MIN_MS - elapsed);

  const doHide = () => {
    globalLoaderTimer = null;
    const loader = document.getElementById('stats-global-loader');
    const statsPanel = document.getElementById('stats-panel');
    const statsDetails = document.getElementById('stats-details');
    if (loader) loader.classList.remove('is-visible');
    if (statsPanel) statsPanel.style.display = '';
    if (statsDetails) statsDetails.style.display = '';
    if (callback) callback();
  };

  if (remaining > 0) {
    if (globalLoaderTimer) clearTimeout(globalLoaderTimer);
    globalLoaderTimer = setTimeout(doHide, remaining);
  } else {
    doHide();
  }
}

function applyEloMiniLoaderVisualState() {
  const eloButton = document.getElementById('stats-filter-lichess-btn');
  if (!eloButton) return;
  eloButton.classList.toggle('is-loading', Boolean(state.statsEloMiniLoading));
}

function startEloMiniLoader() {
  const now = Date.now();
  state.statsEloMiniLoading = true;
  state.statsEloMiniLoaderUntil = now + ELO_MINI_LOADER_MS;

  if (eloMiniLoaderTimer) {
    clearTimeout(eloMiniLoaderTimer);
    eloMiniLoaderTimer = null;
  }

  applyEloMiniLoaderVisualState();
}

function stopEloMiniLoaderWhenReady() {
  if (state.statsLoading) {
    return;
  }

  const remaining = Math.max(0, (state.statsEloMiniLoaderUntil || 0) - Date.now());
  if (remaining > 0) {
    if (eloMiniLoaderTimer) {
      clearTimeout(eloMiniLoaderTimer);
    }

    eloMiniLoaderTimer = setTimeout(() => {
      state.statsEloMiniLoading = false;
      eloMiniLoaderTimer = null;
      applyEloMiniLoaderVisualState();
    }, remaining);
    return;
  }

  state.statsEloMiniLoading = false;
  applyEloMiniLoaderVisualState();
}

function syncStatsFilterControls() {
  const eloButton     = document.getElementById('stats-filter-lichess-btn');
  const eloMenuButton = document.getElementById('stats-filter-lichess-menu-btn');
  const mastersButton = document.getElementById('stats-filter-masters-btn');
  const eloPanel      = document.getElementById('stats-filter-elo-panel');
  const eloValue      = document.getElementById('stats-filter-elo-value');
  const eloBadge      = document.getElementById('stats-filter-elo-badge');
  const minInput      = document.getElementById('elo-range-min');
  const maxInput      = document.getElementById('elo-range-max');

  if (!eloButton || !eloMenuButton || !eloPanel || !eloValue || !eloBadge || !minInput || !maxInput) {
    return;
  }

  // Initialisation de sécurité si state partiel
  if (!state.statsFilters) {
    state.statsFilters = { eloPanelOpen: false, eloMin: ELO_MIN, eloMax: ELO_MAX, currentDatabase: 'lichess' };
  }
  if (!state.statsFilters.currentDatabase) {
    state.statsFilters.currentDatabase = 'lichess';
  }

  const isMasters = state.statsFilters.currentDatabase === 'masters';
  const isLichess = !isMasters;

  const normalizedRange = normalizeEloRange(state.statsFilters.eloMin, state.statsFilters.eloMax, 'max');
  state.statsFilters.eloMin = normalizedRange.min;
  state.statsFilters.eloMax = normalizedRange.max;

  minInput.min  = String(ELO_MIN);  minInput.max  = String(ELO_MAX);  minInput.step = String(ELO_STEP);
  maxInput.min  = String(ELO_MIN);  maxInput.max  = String(ELO_MAX);  maxInput.step = String(ELO_STEP);
  minInput.value = String(state.statsFilters.eloMin);
  maxInput.value = String(state.statsFilters.eloMax);

  const eloLabel = formatEloRangeLabel(state.statsFilters.eloMin, state.statsFilters.eloMax);
  eloValue.textContent = eloLabel;
  // Badge : "Masters" en mode masters, sinon plage Elo
  eloBadge.textContent = isMasters ? 'Masters' : eloLabel;

  // Panneau Elo : uniquement quand la base Lichess est sélectionnée
  eloPanel.hidden = !isLichess || !state.statsFilters.eloPanelOpen;
  eloButton.classList.toggle('active', isLichess);
  eloButton.setAttribute('aria-expanded', (isLichess && state.statsFilters.eloPanelOpen) ? 'true' : 'false');
  updateEloSliderTrack(state.statsFilters.eloMin, state.statsFilters.eloMax);
  applyEloMiniLoaderVisualState();

  // Bouton Masters : actif quand mode masters
  if (mastersButton) {
    mastersButton.classList.toggle('active', isMasters);
  }

  // ─── Listeners Elo (une seule fois) ───────────────────────────────────────
  if (!eloButton.dataset.bound) {
    const applyFilterInput = (source) => {
      let nextMin = Number.parseInt(minInput.value, 10);
      let nextMax = Number.parseInt(maxInput.value, 10);

      if (source === 'min' && nextMin > nextMax - ELO_MIN_GAP) {
        nextMin = nextMax - ELO_MIN_GAP;
      }
      if (source === 'max' && nextMax < nextMin + ELO_MIN_GAP) {
        nextMax = nextMin + ELO_MIN_GAP;
      }

      const normalized = normalizeEloRange(nextMin, nextMax, source);
      state.statsFilters.eloMin = normalized.min;
      state.statsFilters.eloMax = normalized.max;

      minInput.value = String(normalized.min);
      maxInput.value = String(normalized.max);
      const nextLabel = formatEloRangeLabel(normalized.min, normalized.max);
      eloValue.textContent = nextLabel;
      eloBadge.textContent = nextLabel;
      updateEloSliderTrack(normalized.min, normalized.max);

      state.lastStatsRequestKey = '';
      state.statsSelectedUci = '';
      scheduleStatsReloadForCurrentFen();
    };

    eloButton.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('#stats-filter-lichess-menu-btn')) {
        return;
      }

      if (state.statsFilters.currentDatabase === 'masters') {
        // Retour en mode lichess
        state.statsFilters.currentDatabase = 'lichess';
        state.lastStatsRequestKey = '';
        state.statsSelectedUci = '';
        scheduleStatsReloadForCurrentFen();
      }
      syncStatsFilterControls();
    });

    const toggleLichessPanel = (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (state.statsFilters.currentDatabase !== 'lichess') {
        state.statsFilters.currentDatabase = 'lichess';
        state.lastStatsRequestKey = '';
        state.statsSelectedUci = '';
        scheduleStatsReloadForCurrentFen();
      }

      state.statsFilters.eloPanelOpen = !state.statsFilters.eloPanelOpen;
      syncStatsFilterControls();
    };

    eloMenuButton.addEventListener('click', toggleLichessPanel);
    eloMenuButton.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        toggleLichessPanel(event);
      }
    });

    minInput.addEventListener('input', () => applyFilterInput('min'));
    maxInput.addEventListener('input', () => applyFilterInput('max'));
    eloButton.dataset.bound = '1';
  }

  // ─── Listeners Masters (une seule fois) ───────────────────────────────────
  if (mastersButton && !mastersButton.dataset.bound) {
    mastersButton.addEventListener('click', () => {
      if (state.statsFilters.currentDatabase === 'masters') return; // déjà actif
      state.statsFilters.currentDatabase = 'masters';
      state.statsFilters.eloPanelOpen = false; // ferme le panneau Elo
      state.lastStatsRequestKey = '';
      state.statsSelectedUci = '';
      scheduleStatsReloadForCurrentFen();
      syncStatsFilterControls();
    });
    mastersButton.dataset.bound = '1';
  }

  if (!document.body.dataset.elopaneloutsidebound) {
    document.addEventListener('click', (event) => {
      if (!state.statsFilters?.eloPanelOpen) return;
      if (eloPanel.contains(event.target)) return;
      if (eloButton.contains(event.target)) return;

      state.statsFilters.eloPanelOpen = false;
      syncStatsFilterControls();
    });
    document.body.dataset.elopaneloutsidebound = '1';
  }

  updateSortButtonStates();
}

function formatPercent(value, total) {
  if (!total) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}
function formatNumberShort(n) {
  if (n >= 1_000_000_000) {
    return (n / 1_000_000_000).toFixed(1).replace('.0', '') + 'Md';
  }
  if (n >= 1_000_000) {
    return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M';
  }
  if (n >= 1_000) {
    return (n / 1_000).toFixed(1).replace('.0', '') + 'K';
  }
  return n.toString();
}

function updateOpeningInfoLabel() {
  const openingInfo = document.getElementById('opening-info');
  if (!openingInfo) return;

  openingInfo.textContent = state.lichessStats && state.lichessStats.openingName
    ? `${state.lichessStats.openingName}${state.lichessStats.eco ? ` (${state.lichessStats.eco})` : ''}`
    : '';
}

// Keep stats updates local: avoid full app rerender for sort/filter fetches.
function refreshStatsPanels() {
  updateOpeningInfoLabel();
  updateSortButtonStates();

  const statsPanel = document.getElementById('stats-panel');
  const statsDetails = document.getElementById('stats-details');
  if (!statsPanel) return;

  if (state.trainingActive) {
    statsPanel.style.display = 'none';
    if (statsDetails) statsDetails.style.display = 'none';
    return;
  }

  statsPanel.style.display = '';
  if (statsDetails) statsDetails.style.display = '';
  renderStatsPanel(statsPanel, statsDetails);
}

async function loadStatsIfNeeded(fen, force = false, options = {}) {
  const fromEloChange = Boolean(options.fromEloChange);
  const requestKey = getStatsRequestKey(fen);

  if (!fen) return;

  // Cache : même clé et pas forcé → pas de re-fetch
  if (!force && state.lastStatsRequestKey === requestKey) return;

  // Déjà en cours : mémorise la demande en attente et sort
  if (state.statsLoading) {
    state.pendingStatsRequest = {
      fen,
      force: true,
      fromEloChange: fromEloChange || Boolean(state.pendingStatsRequest?.fromEloChange)
    };
    return;
  }

  // Lance le mini-loader Elo si changement Elo
  if (fromEloChange) startEloMiniLoader();

  state.statsLoading = true;
  state.currentStatsRequestKey = requestKey;
  state.statsError = null;
  showGlobalLoader(); // affiche le loader, masque le panel des coups

  try {
    const database = state.statsFilters?.currentDatabase || 'lichess';
    const stats = await fetchLichessStats(fen, {
      min: state.statsFilters.eloMin,
      max: state.statsFilters.eloMax
    }, database);
    // Sauvegarde les données (le requestKey correspond toujours : statsLoading était true)
    state.lichessStats = stats;
    state.lastStatsRequestKey = requestKey;
    state.statsSelectedUci = '';
  } catch (error) {
    state.statsError = error.message || 'Erreur de récupération des statistiques';
    state.lastStatsRequestKey = requestKey;
  } finally {
    // Nettoyage de l'état de chargement
    state.statsLoading = false;
    state.currentStatsRequestKey = '';

    // Si une nouvelle demande était en attente, on l'enchaîne sans cacher le loader
    const pending = state.pendingStatsRequest;
    state.pendingStatsRequest = null;

    if (pending && pending.fen) {
      // Le loader reste visible pendant la nouvelle requête
      loadStatsIfNeeded(pending.fen, true, { fromEloChange: pending.fromEloChange });
      return;
    }

    // Pas de requête en attente : masque le loader (avec durée min.) puis affiche les coups
    hideGlobalLoaderAndRender(() => {
      stopEloMiniLoaderWhenReady();
      state.statsShowAll = false;
      refreshStatsPanels();
      requestVisibleMoveAnnotations();
    });
  }
}

function retryStats() {
  const fen = state.currentNode?.fen;
  if (!fen) return;
  state.lastStatsRequestKey = '';
  state.statsError = null;
  loadStatsIfNeeded(fen, true);
}

function renderStatsPanel(statsPanel, statsDetails) {
  const stats = state.lichessStats;

  if (state.statsLoading) {
    statsPanel.innerHTML = '';
    if (statsDetails) statsDetails.innerHTML = '';
    return;
  }

  if (state.statsError) {
    statsPanel.innerHTML = '';

    const errorBlock = document.createElement('div');
    errorBlock.className = 'panel-empty';
    errorBlock.textContent = `Erreur : ${state.statsError}`;

    const retryButton = document.createElement('button');
    retryButton.className = 'top-action';
    retryButton.style.marginTop = '12px';
    retryButton.textContent = 'Réessayer';
    retryButton.onclick = retryStats;

    statsPanel.appendChild(errorBlock);
    statsPanel.appendChild(retryButton);

    if (statsDetails) statsDetails.innerHTML = '';
    return;
  }

  if (!stats || !stats.moves || stats.moves.length === 0) {
    statsPanel.innerHTML = '<div class="panel-empty">Aucune statistique disponible pour cette position.</div>';
    if (statsDetails) statsDetails.innerHTML = '';
    return;
  }

  statsPanel.innerHTML = '';

const totalGames = stats.moves.reduce(
  (sum, m) => sum + m.white + m.draws + m.black,
  0
);

// Trier les coups selon le tri actuel
const sortedMoves = sortStatsMoves(stats.moves, state.currentNode?.fen);
const VISIBLE_LIMIT = 5;
const visibleMoves = state.statsShowAll ? sortedMoves : sortedMoves.slice(0, VISIBLE_LIMIT);
const hasMore = sortedMoves.length > VISIBLE_LIMIT;

visibleMoves.forEach(move => {
  const total = move.white + move.draws + move.black;

  // Calcul des pourcentages
const whitePct = Math.floor((move.white / total) * 100);
const drawPct  = Math.floor((move.draws / total) * 100);

// La dernière barre prend le reste pour garantir 100%
const blackPct = 100 - whitePct - drawPct;

const freqPct = Math.round((total / totalGames) * 100);

  // Couleur selon l'évaluation moteur - gris tant que non calculé ou analyse désactivée
  let dotColor = '#808080';
  if (state.isAnalysisEnabled && !state.moveAnnotationsLoading && state.moveAnnotationsComplete) {
    dotColor = getEngineColorForMove(move);
  }

  const row = document.createElement('div');
  row.className = `stats-row${state.statsSelectedUci === move.uci ? ' active' : ''}`;
  row.setAttribute('data-move-uci', move.uci || '');
  row.setAttribute('data-move-san', move.san || '');
  row.style.display = 'grid';
  row.style.gridTemplateColumns = '24px 1fr';
  row.style.alignItems = 'center';
  row.style.gap = '4px';
  row.style.padding = '8px 4px';
  row.onclick = () => handleStatsClick(move);

  // Rond d'évaluation : spinner pendant le calcul, coloré/gris sinon
  const evalDot = document.createElement('div');
  if (state.isAnalysisEnabled && state.moveAnnotationsLoading) {
    evalDot.className = 'eval-dot-spinner';
  } else {
    evalDot.className = 'move-eval-dot';
    evalDot.style.width = '14px';
    evalDot.style.height = '14px';
    evalDot.style.borderRadius = '50%';
    evalDot.style.background = dotColor;
    evalDot.style.border = '2px solid rgba(0,0,0,0.45)';
    evalDot.style.transition = 'background 0.3s, transform 0.2s';
  }
  evalDot.style.cursor = 'pointer';
  evalDot.style.flexShrink = '0';

  // Créer la cellule contenant tous les détails du coup
  const contentCell = document.createElement('div');
  contentCell.style.display = 'grid';
  contentCell.style.gridTemplateColumns = '32px 32px 38px 120px 1fr';
  contentCell.style.alignItems = 'center';
  contentCell.style.gap = '4px';
  contentCell.style.paddingRight = '4px';

contentCell.innerHTML = `
  <div class="move" style="font-weight: bold;">${move.san}</div>

  <div class="freq">${freqPct}%</div>

  <div class="count">${formatNumberShort(total)}</div>

  <div class="bars">
    <div class="bar white" style="width:${whitePct}%">
      ${whitePct >= 12 ? whitePct + '%' : ''}
    </div>
    <div class="bar draw" style="width:${drawPct}%">
      ${drawPct >= 12 ? drawPct + '%' : ''}
    </div>
    <div class="bar black" style="width:${blackPct}%">
      ${blackPct >= 12 ? blackPct + '%' : ''}
    </div>
  </div>

  <div class="elo">${move.averageRating}</div>
`;

  row.appendChild(evalDot);
  row.appendChild(contentCell);

  statsPanel.appendChild(row);
  attachStatsRowHover(row, move);
  attachAnnotationHover(evalDot, move);
});


  // Bouton Afficher plus / Afficher moins
  if (hasMore) {
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'stats-show-more-btn';
    toggleBtn.textContent = state.statsShowAll ? 'Afficher moins' : 'Afficher plus';
    toggleBtn.onclick = (event) => {
      event.stopPropagation();
      state.statsShowAll = !state.statsShowAll;
      const sp = document.getElementById('stats-panel');
      const sd = document.getElementById('stats-details');
      if (sp) renderStatsPanel(sp, sd);
      // Redéclencher les annotations pour les coups visibles (expand ou collapse)
      requestVisibleMoveAnnotations();
    };
    statsPanel.appendChild(toggleBtn);
  }

  if (statsDetails) {
    renderStatsDetails(statsDetails);
  }
}


function renderStatsDetails(detailsPanel) {
  const stats = state.lichessStats;
  const selected = stats?.moves.find((move) => move.uci === state.statsSelectedUci);
  if (!selected) {
    detailsPanel.innerHTML = '<div class="panel-empty">Cliquez sur un coup pour voir les détails.</div>';
    return;
  }

  const total = selected.white + selected.black + selected.draws;
  detailsPanel.innerHTML = `
    <div class="stats-details-title">Détails du coup <strong>${selected.san}</strong></div>
    <p><span>Fréquence :</span> ${total} parties</p>
    <p><span>Blancs :</span> ${selected.white} (${formatPercent(selected.white, total)})</p>
    <p><span>Nuls :</span> ${selected.draws} (${formatPercent(selected.draws, total)})</p>
    <p><span>Noirs :</span> ${selected.black} (${formatPercent(selected.black, total)})</p>
    <p><span>Elo moyen :</span> ${selected.averageRating || 0}</p>
    <p><span>UCI :</span> ${selected.uci}</p>
  `;
}

function handleStatsClick(move) {
  if (!move) return;
  state.statsSelectedUci = move.uci;
  const played = playUciMove(move.uci);
  if (played) {
    state.lastStatsRequestKey = '';
    render();
  }
}

export function updateStatsSortBy(sortType) {
  if (!['frequency', 'winrate', 'winrate-white', 'winrate-black', 'engine'].includes(sortType)) return;
  state.statsFilters.sortBy = sortType;
  refreshStatsPanels();
}

function updateSortButtonStates() {
  const sortType = state.statsFilters?.sortBy || 'frequency';
  
  // Mettre à jour le label du tri actuel dans la badge
  const sortLabels = {
    'frequency': 'Fréquence',
    'winrate-white': 'Taux victoire blanc',
    'winrate-black': 'Taux victoire noir',
    'winrate': 'Taux de victoire',
    'engine': 'Préférence moteur'
  };
  const displayLabel = sortLabels[sortType] || 'Fréquence';
  
  const badge = document.getElementById('stats-sort-badge');
  if (badge) {
    badge.style.display = 'none';
  }

  const depthBadge = document.getElementById('stats-depth-badge');
  if (depthBadge) {
    depthBadge.style.display = 'none';
  }
}

export function togglePanel(panel) {
  if (!state.openPanels.hasOwnProperty(panel)) return;
  if (state.trainingActive && panel === 'arbre') return;
  const isOpen = state.openPanels[panel];
  Object.keys(state.openPanels).forEach(key => {
    state.openPanels[key] = false;
  });
  state.openPanels[panel] = !isOpen;
  render();
}

function handleNodeSelect(node) {
  if (state.trainingActive) return;
  if (!node) {
    render();
    return;
  }
  state.currentNode = node.isTransposition && node.sourceNode ? node.sourceNode : node;
  state.chess.load(state.currentNode.fen);
  render();
}

function handleTreeContext(event, node) {
  if (state.trainingActive) return;
  handleRightClick(event, 'arbre', node);
}

export function hideMenus() {
  state.ctxMenuEl.style.display = 'none';
  state.contextMenuMove = null;
}

export function addSelectedMoveToTree() {
  const move = state.contextMenuMove;
  if (!move || !move.uci) {
    hideMenus();
    return;
  }

  const originalNode = state.currentNode;
  const added = playUciMove(move.uci);

  if (added && originalNode) {
    state.currentNode = originalNode;
    state.chess.load(originalNode.fen);
    state.pendingAnimation = null;
    state.redoStack = [];
  }

  state.lastStatsRequestKey = '';
  hideMenus();
  render();
}

export function closeModals() {
  pendingTrainingInterruptAction = null;
  state.varNameConflictConfirmed = false;
  state.modalOverlayEl.style.display = 'none';
  document.querySelectorAll('.modal-box').forEach(modal => {
    modal.style.display = 'none';
  });
}

export function toggleMonitorMenu(event) {
  event.stopPropagation();
  handleRightClick(event, 'monitor');
}

function openNewRepModalUnsafe() {
  eventBus.emit('hideMenus');
  state.modalOverlayEl.style.display = 'flex';
  document.getElementById('modal-new-rep').style.display = 'block';
  document.getElementById('modal-rep-title').textContent = 'Nouveau Répertoire';
  document.getElementById('rep-create-mode-selector').style.display = 'flex';
  document.getElementById('color-sel-container').style.display = 'block';
  document.getElementById('rep-name-input').value = '';
  document.getElementById('rep-create-error').textContent = '';
  const fileInput = document.getElementById('pgn-file-input');
  if (fileInput) fileInput.value = '';
  const pgnText = document.getElementById('pgn-import-input');
  if (pgnText) pgnText.value = '';
  document.getElementById('btn-rep-confirm').textContent = 'Créer';
  document.getElementById('btn-rep-confirm').onclick = () => confirmRepertoireCreation();
  setRepCreationMode('start');
  selectCol('w');
}

export function selectRepCreationMode(mode) {
  setRepCreationMode(mode);
}

function setRepCreationMode(mode) {
  const infoEl = document.getElementById('rep-current-info');
  const fileEl = document.getElementById('rep-pgn-file-container');
  const textEl = document.getElementById('rep-pgn-text-container');
  const confirmBtn = document.getElementById('btn-rep-confirm');

  document.querySelectorAll('.rep-create-mode-btn').forEach(button => {
    const active = button.dataset.repCreateMode === mode;
    button.dataset.selected = active ? 'true' : 'false';
    button.style.background = active ? '#2b2b2b' : '';
    button.style.borderColor = active ? '#555' : '';
  });

  if (infoEl) infoEl.style.display = mode === 'current' ? 'block' : 'none';
  if (fileEl) fileEl.style.display = mode === 'pgn-file' ? 'block' : 'none';
  if (textEl) textEl.style.display = mode === 'pgn-text' ? 'block' : 'none';
  if (confirmBtn) confirmBtn.textContent = (mode === 'start' || mode === 'current') ? 'Créer' : 'Importer';
}

function guardTrainingInterruption({
  title = 'Interrompre l’entraînement en cours ?',
  message,
  onConfirm,
}) {
  if (!state.trainingActive) {
    onConfirm();
    return;
  }

  pendingTrainingInterruptAction = onConfirm;

  const titleEl = document.getElementById('modal-training-interrupt-title');
  const bodyEl = document.getElementById('modal-training-interrupt-body');
  if (titleEl) titleEl.textContent = title;
  if (bodyEl) {
    bodyEl.innerHTML = `L’entraînement en cours (<b>${state.trainingLabel || 'sans nom'}</b>) sera terminé.<br>${message}`;
  }

  state.modalOverlayEl.style.display = 'flex';
  document.getElementById('modal-training-interrupt').style.display = 'block';
}

export function openNewRepModal(event) {
  if (event && event.stopPropagation) event.stopPropagation();
  guardTrainingInterruption({
    title: 'Créer un nouveau répertoire ?',
    message: 'Voulez-vous créer un nouveau répertoire ?',
    onConfirm: openNewRepModalUnsafe,
  });
}
export function openBoardThemeMenu() {
    // Nettoyer les anciennes modales dynamiques
    state.dynamicModals.innerHTML = '';

    // Afficher l’overlay
    state.modalOverlayEl.style.display = 'flex';

    // Créer la modale
    const modal = document.createElement('div');
    modal.className = 'modal-box';
    modal.style.display = 'block';
    modal.onclick = (e) => e.stopPropagation();

    modal.innerHTML = `
        <h3>Thème de l'échiquier</h3>
        <div style="display:flex; flex-direction:column; gap:10px; margin-top:15px;">
            <button class="ctrl-btn" id="theme-classic">Classique</button>
            <button class="ctrl-btn" id="theme-blue">Bleu</button>
            <button class="ctrl-btn" id="theme-gray">Gris</button>
            <button class="ctrl-btn" id="theme-rose">Rose</button>
            <button class="ctrl-btn" id="theme-mauve">Mauve</button>
            <button class="ctrl-btn" id="theme-wood">Bois</button>
        </div>
    `;

    // Ajouter la modale dans le conteneur dynamique
    state.dynamicModals.appendChild(modal);

    // Handlers des boutons
    document.getElementById('theme-classic').onclick = () => {
        state.boardTheme = { light: '#ebecd0', dark: '#779556' };
        closeModals();
        render();
    };

    document.getElementById('theme-blue').onclick = () => {
        state.boardTheme = { light: '#d0e7ff', dark: '#4a90e2' };
        closeModals();
        render();
    };

    document.getElementById('theme-gray').onclick = () => {
        state.boardTheme = { light: '#e5e5e5', dark: '#666' };
        closeModals();
        render();
    };

    document.getElementById('theme-rose').onclick = () => {
        state.boardTheme = { light: '#ffd6e7', dark: '#ff8ab8' };
        closeModals();
        render();
    };

    document.getElementById('theme-mauve').onclick = () => {
        state.boardTheme = { light: '#f3e8ff', dark: '#b388ff' };
        closeModals();
        render();
    };

    document.getElementById('theme-wood').onclick = () => {
        state.boardTheme = { light: '#f0d9b5', dark: '#b58863' };
        closeModals();
        render();
    };
}


export function openRenameRepModal() {
  eventBus.emit('hideMenus');
  const rep = state.repertoires[state.activeRepIndex];
  state.modalOverlayEl.style.display = 'flex';
  document.getElementById('modal-new-rep').style.display = 'block';
  document.getElementById('modal-rep-title').textContent = 'Renommer Répertoire';
  document.getElementById('rep-create-mode-selector').style.display = 'none';
  document.getElementById('color-sel-container').style.display = 'none';
  document.getElementById('rep-current-info').style.display = 'none';
  document.getElementById('rep-pgn-file-container').style.display = 'none';
  document.getElementById('rep-pgn-text-container').style.display = 'none';
  document.getElementById('rep-create-error').textContent = '';
  document.getElementById('rep-name-input').value = rep.name;
  document.getElementById('btn-rep-confirm').textContent = 'Enregistrer';
  document.getElementById('btn-rep-confirm').onclick = () => confirmRenameRep();
}

export function openNameVarModal() {
  eventBus.emit('hideMenus');
  state.varNameConflictConfirmed = false;
  state.modalOverlayEl.style.display = 'flex';
  document.getElementById('modal-name-var').style.display = 'block';
  const existing = state.menuTarget?.varName || '';
  document.getElementById('var-name-input').value = existing;
  const hint = document.getElementById('var-name-hint');
  if (hint) {
    if (existing) {
      hint.textContent = `⚠️ Ce coup est déjà nommé "${existing}" — vous pouvez modifier le nom.`;
      hint.style.display = 'block';
    } else {
      hint.style.display = 'none';
    }
  }
  const warning = document.getElementById('var-name-warning');
  if (warning) { warning.style.display = 'none'; warning.textContent = ''; }
  const btn = document.getElementById('btn-var-save');
  if (btn) btn.textContent = 'Enregistrer';
  document.getElementById('var-name-input').focus();
}

export function openCommentModal() {
  eventBus.emit('hideMenus');
  state.modalOverlayEl.style.display = 'flex';
  document.getElementById('modal-comment').style.display = 'block';
  document.getElementById('comment-input').value = state.menuTarget.comment || '';
}

export function confirmComment() {
  if (state.menuTarget) {
    state.menuTarget.comment = document.getElementById('comment-input').value;
  }
  eventBus.emit('closeModals');
  eventBus.emit('render');
}

export function openDeleteClick() {
  eventBus.emit('hideMenus');
  if (state.deleteTargetIdx !== -1) {
    const rep = state.repertoires[state.deleteTargetIdx];
    const totalMoves = countTotalChildren(rep);
    document.getElementById('delete-msg').innerHTML = `Souhaitez-vous vraiment supprimer le répertoire <b>${rep.name}</b> ainsi que les <b>${totalMoves}</b> coups qui le suivent ?`;
    state.modalOverlayEl.style.display = 'flex';
    document.getElementById('modal-confirm-delete').style.display = 'block';
  } else if (state.menuTarget && state.menuTarget.parent) {
    const childrenCount = countTotalChildren(state.menuTarget);
    if (childrenCount > 0) {
      const moveLabel = `${state.menuTarget.turn === 'w' ? state.menuTarget.moveNum + '.' : state.menuTarget.moveNum + '...'} ${state.menuTarget.san}`;
      document.getElementById('delete-msg').innerHTML = `Voulez-vous effacer le coup <b>${moveLabel}</b> ainsi que les <b>${childrenCount}</b> coups qui le suivent ?`;
      state.modalOverlayEl.style.display = 'flex';
      document.getElementById('modal-confirm-delete').style.display = 'block';
    } else {
      confirmDeleteMove();
    }
  }
}

export function handleRightClick(event, type, target = null, index = -1) {
  if (state.trainingActive) return;
  event.preventDefault();
  event.stopPropagation();
  const isMoveContext = type === 'stats_move' || type === 'analysis_move';

  state.menuTarget = target || state.currentNode;
  state.contextMenuMove = isMoveContext ? target : null;
  state.deleteTargetIdx = index;
  state.pendingDeleteType = type;
  state.contextMenuSource = type;

  const menu = state.ctxMenuEl;
  menu.style.display = 'block';

  const menuWidth = menu.offsetWidth || 240;
  const menuHeight = menu.offsetHeight || 280;
  const pad = 10;
  let x = event.clientX;
  let y = event.clientY;

  x = Math.max(pad, Math.min(x, window.innerWidth - menuWidth - pad));
  y = Math.max(pad, Math.min(y, window.innerHeight - menuHeight - pad));

  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  const isRepRoot = type === 'repertoire_item';
  const isRepSub = type === 'repertoire_subitem';
  const isNode = type === 'monitor' || type === 'arbre' || type === 'board' || isRepSub;
  const isNotRoot = state.menuTarget && state.menuTarget.parent;

  const flipEl = menu.querySelector('.opt-flip');
  const renameEl = menu.querySelector('.opt-rename-rep');
  const nameVarEl = menu.querySelector('.opt-name-var');
  const addTreeEl = menu.querySelector('.opt-add-tree');
  const commentEl = menu.querySelector('.opt-comment');
  const deleteEl = menu.querySelector('.opt-delete');

  if (flipEl) flipEl.style.display = isMoveContext ? 'none' : 'block';
  if (renameEl) renameEl.style.display = isRepRoot ? 'block' : 'none';
  if (deleteEl) {
    deleteEl.textContent = isRepRoot ? 'Supprimer le répertoire' : 'Supprimer ce coup';
    deleteEl.style.display = isMoveContext ? 'none' : (isRepRoot || (isNode && isNotRoot) ? 'block' : 'none');
  }
  if (nameVarEl) nameVarEl.style.display = isMoveContext ? 'none' : (isNode && isNotRoot ? 'block' : 'none');
  if (commentEl) commentEl.style.display = isMoveContext ? 'none' : (state.activeRepIndex !== -1 ? 'block' : 'none');
  if (addTreeEl) addTreeEl.style.display = isMoveContext ? 'block' : 'none';

  const annotSection = menu.querySelector('.ctx-annot-section');
  if (annotSection) annotSection.style.display = (isRepRoot || isMoveContext) ? 'none' : 'block';
}

export function selectCol(color) {
  state.selectedColor = color;
  document.getElementById('opt-white').classList.toggle('active', color === 'w');
  document.getElementById('opt-black').classList.toggle('active', color === 'b');
}

export function resetPosition() {
  if (state.activeRepIndex !== -1) {
    state.currentNode = state.repertoires[state.activeRepIndex];
  } else {
    state.freePlayRoot.children = [];
    state.currentNode = state.freePlayRoot;
  }
  state.chess.load(state.currentNode.fen);
  state.redoStack = [];
  render();
}

export function navBack() {
  if (state.currentNode.parent) {
    if (trainingAutoPlayTimer) { clearTimeout(trainingAutoPlayTimer); trainingAutoPlayTimer = null; }
    state.redoStack.push(state.currentNode);
    state.currentNode = state.currentNode.parent;
    state.chess.load(state.currentNode.fen);
    render();
  }
}

export function navForward() {
  if (trainingAutoPlayTimer) { clearTimeout(trainingAutoPlayTimer); trainingAutoPlayTimer = null; }

  if (state.redoStack.length) {
    state.currentNode = state.redoStack.pop();
    state.chess.load(state.currentNode.fen);
    render();
    return;
  }

  const mainlineChild = state.currentNode?.children?.[0] || null;
  if (!mainlineChild) return;

  state.currentNode = mainlineChild;
  state.chess.load(state.currentNode.fen);
  render();
}

export function flipBoard() {
  state.boardFlipped = !state.boardFlipped;
  render();
}

function countMoves(node, repColor) {
  let count = 0;
  function walk(n) {
    if (n.parent && n.turn === repColor) count++;
    n.children.forEach(walk);
  }
  walk(node);
  return count;
}

function findRepIndexForNode(node) {
  let temp = node;
  while (temp.parent) temp = temp.parent;
  return state.repertoires.findIndex(r => r.id === temp.id);
}

function isInTrainingSubtree(node) {
  if (!state.trainingRoot) return true;
  let temp = node;
  while (temp) {
    if (temp.id === state.trainingRoot.id) return true;
    temp = temp.parent;
  }
  return false;
}

// ─── TRAINING : logique de parcours ────────────────────────────────────────────────────────

function isFullyExplored(node) {
  if (node.children.length === 0) {
    return state.trainingVisited.has(node.id) || state.trainingIgnoredNoReply.has(node.id);
  }
  return node.children.every(c => isFullyExplored(c));
}

function collectMissingReplyNodes(root, repColor) {
  const missing = [];

  function walk(node) {
    const nextToPlay = node.turn === 'w' ? 'b' : 'w';

    if (nextToPlay === repColor && node.children.length === 0) {
      const tmp = new Chess(node.fen);
      if (!tmp.game_over()) {
        missing.push(node);
      }
      return;
    }

    node.children.forEach(walk);
  }

  walk(root);
  return missing;
}

function appendLineBreak(container) {
  const br = document.createElement('br');
  container.appendChild(br);
}

function appendTrainingMissingLines(container, repColor, missingNodes) {
  if (missingNodes.length === 0) return;

  appendLineBreak(container);
  appendLineBreak(container);

  const missingLabel = document.createElement('div');
  missingLabel.style.fontSize = '0.9em';
  missingLabel.style.color = '#666';
  missingLabel.innerHTML = `<b>⚠️ Il manque une réponse ${repColor === 'w' ? 'blanche' : 'noire'} sur ${missingNodes.length} ligne(s) :</b>`;
  container.appendChild(missingLabel);

  const sample = missingNodes.slice(0, 3)
    .map(n => `• ${getPathString(n) || n.san}`)
    .join('<br>');

  const sampleDiv = document.createElement('div');
  sampleDiv.style.fontSize = '0.85em';
  sampleDiv.style.color = '#888';
  sampleDiv.style.marginTop = '4px';
  sampleDiv.innerHTML = sample;
  container.appendChild(sampleDiv);

  if (missingNodes.length > 3) {
    const tail = document.createElement('div');
    tail.style.fontSize = '0.85em';
    tail.style.color = '#888';
    tail.style.marginTop = '4px';
    tail.textContent = `…et ${missingNodes.length - 3} autre(s) ligne(s).`;
    container.appendChild(tail);
  }

  const note = document.createElement('div');
  note.style.fontSize = '0.85em';
  note.style.color = '#999';
  note.style.marginTop = '4px';
  note.style.fontStyle = 'italic';
  note.textContent = 'Ces lignes seront ignorées pendant l\'entraînement.';
  container.appendChild(note);
}

function appendTrainingModeSelector(container) {
  appendLineBreak(container);
  appendLineBreak(container);

  const title = document.createElement('div');
  title.className = 'training-mode-title';
  title.textContent = 'Choisissez un mode d’entraînement :';
  container.appendChild(title);

  const options = document.createElement('div');
  options.className = 'training-mode-options';

  Object.entries(TRAINING_MODES).forEach(([modeId, meta]) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'training-mode-option';
    option.dataset.selected = pendingTrainingMode === modeId ? 'true' : 'false';
    option.title = meta.description;

    const label = document.createElement('span');
    label.className = 'training-mode-option-label';
    label.textContent = meta.label;

    option.appendChild(label);
    option.onclick = () => {
      pendingTrainingMode = modeId;
      renderTrainingConfirmModal();
    };

    options.appendChild(option);
  });

  container.appendChild(options);
}

function getTrainingNodeTurn(node) {
  return node.turn === 'w' ? 'b' : 'w';
}

function isDirectTargetTrainingMode() {
  return state.trainingMode === 'express' || state.trainingMode === 'randomizer';
}

function isTrainablePlayerNode(node) {
  return Boolean(node)
    && node.children.length > 0
    && getTrainingNodeTurn(node) === state.trainingRepColor
    && !state.trainingIgnoredNoReply.has(node.id);
}

function collectAllTrainingTargets(root, results = []) {
  if (!root) return results;
  if (isTrainablePlayerNode(root) && !state.trainingVisited.has(root.id)) {
    results.push(root);
  }
  root.children.forEach(child => {
    if (!isInTrainingSubtree(child)) return;
    collectAllTrainingTargets(child, results);
  });
  return results;
}

function collectFinalTrainingTargets(root) {
  const targets = new Map();

  function walk(node, latestTarget = null) {
    let nextLatestTarget = latestTarget;
    if (isTrainablePlayerNode(node)) {
      nextLatestTarget = node;
    }

    if (node.children.length === 0) {
      if (!state.trainingIgnoredNoReply.has(node.id) && nextLatestTarget && !state.trainingVisited.has(nextLatestTarget.id)) {
        targets.set(nextLatestTarget.id, nextLatestTarget);
      }
      return;
    }

    node.children.forEach(child => {
      if (!isInTrainingSubtree(child)) return;
      walk(child, nextLatestTarget);
    });
  }

  walk(root);
  return Array.from(targets.values());
}

function getTrainingTargetsForCurrentMode() {
  if (state.trainingMode === 'express') {
    const targets = collectFinalTrainingTargets(state.trainingRoot);
    targets.sort((a, b) => getPathFromRoot(b).length - getPathFromRoot(a).length);
    return targets;
  }

  if (state.trainingMode === 'randomizer') {
    return collectAllTrainingTargets(state.trainingRoot);
  }

  return [];
}

function showNextTrainingTarget(delay = 0) {
  if (!state.trainingActive || !isDirectTargetTrainingMode()) return;

  const targets = getTrainingTargetsForCurrentMode();
  if (targets.length === 0) {
    setTimeout(() => showTrainingDoneModal(), 250);
    return;
  }

  const target = state.trainingMode === 'randomizer'
    ? targets[Math.floor(Math.random() * targets.length)]
    : targets[0];

  if (trainingAutoPlayTimer) clearTimeout(trainingAutoPlayTimer);
  trainingAutoPlayTimer = setTimeout(() => {
    if (!state.trainingActive) return;
    state.currentNode = target;
    state.chess.load(target.fen);
    expandPathToCurrentNode();
    render();
  }, delay);
}

function getPathFromRoot(targetNode) {
  const path = [];
  let temp = targetNode;
  while (temp) {
    path.unshift(temp);
    if (temp.id === state.trainingRoot.id) break;
    temp = temp.parent;
  }
  return path;
}

function handleLineComplete() {
  state.trainingVisited.add(state.currentNode.id);

  if (isDirectTargetTrainingMode()) {
    showNextTrainingTarget();
    return;
  }

  if (isFullyExplored(state.trainingRoot)) {
    setTimeout(() => showTrainingDoneModal(), 600);
    return;
  }
  // Retour à la racine, advanceAutoPlay choisira automatiquement la première branche inexplorée
  setTimeout(() => {
    if (!state.trainingActive) return;
    state.currentNode = state.trainingRoot;
    state.chess.load(state.trainingRoot.fen);
    render();
    advanceAutoPlay();
  }, 1000);
}

function collectTrainingCandidatePaths(node, currentPath = [], results = []) {
  if (!node) return results;

  if (currentPath.length > 0) {
    const nextToPlay = getTrainingNodeTurn(node);
    const isPlayerStop = nextToPlay === state.trainingRepColor && !state.trainingAnswered.has(node.id);
    if (node.children.length === 0 || isPlayerStop) {
      results.push(currentPath.slice());
      return results;
    }
  }

  node.children.forEach(child => {
    if (!isInTrainingSubtree(child) || isFullyExplored(child)) return;
    currentPath.push(child);
    collectTrainingCandidatePaths(child, currentPath, results);
    currentPath.pop();
  });

  return results;
}

function selectTrainingPath(node) {
  const paths = collectTrainingCandidatePaths(node);
  if (paths.length === 0) return null;

  const scored = paths.map((path, index) => ({
    path,
    index,
    stopDepth: getPathFromRoot(path[path.length - 1]).length - 1,
  }));

  if (state.trainingMode === 'vertical') {
    scored.sort((a, b) => (a.stopDepth - b.stopDepth) || (a.index - b.index));
    return scored[0].path;
  }

  if (state.trainingMode === 'express') {
    scored.sort((a, b) => (b.stopDepth - a.stopDepth) || (a.index - b.index));
    return scored[0].path;
  }

  if (state.trainingMode === 'randomizer') {
    return paths[Math.floor(Math.random() * paths.length)];
  }

  return paths[0];
}

function delayForSteps(steps) {
  if (steps <= 1) return 800;  // dernier coup auto avant le tour joueur
  if (steps === 2) return 400; // avant-dernier
  return 200;                  // tous les autres (loin du tour joueur)
}

function advanceAutoPlay(forcedDelay = null) {
  if (!state.trainingActive) return;
  const node = state.currentNode;

  // Ligne marquée comme "sans réponse joueur" : on la considère terminée.
  if (state.trainingIgnoredNoReply.has(node.id)) { handleLineComplete(); return; }

  if (node.children.length === 0) { handleLineComplete(); return; }

  const nextToPlay = getTrainingNodeTurn(node);

  // Tour du JOUEUR : stopper SAUF si la position a déjà été répondue correctement
  if (nextToPlay === state.trainingRepColor) {
    if (!state.trainingAnswered.has(node.id)) return;
  }

  const selectedPath = selectTrainingPath(node);
  if (!selectedPath || selectedPath.length === 0) {
    handleLineComplete();
    return;
  }

  const nextNode = selectedPath[0];
  const steps = selectedPath.length;
  // forcedDelay : utilisé uniquement pour le 1er coup après un coup validé (réponse immédiate)
  // sinon délai calculé selon la distance au prochain tour joueur (reroll)
  const delay = forcedDelay !== null ? forcedDelay : delayForSteps(steps);

  const currentId = node.id;
  trainingAutoPlayTimer = setTimeout(() => {
    if (!state.trainingActive || state.currentNode.id !== currentId) return;
    const tmp = new Chess(node.fen);
    const mv = tmp.move(nextNode.san);
    if (mv) state.pendingAnimation = { fromSq: mv.from, toSq: mv.to };
    state.currentNode = nextNode;
    state.chess.load(nextNode.fen);
    render();
    advanceAutoPlay(); // pas de forcedDelay pour les coups suivants
  }, delay);
}

function _doStartTraining() {
  const startNode = pendingTrainingNode;
  const repColor = pendingTrainingColor;
  if (trainingAutoPlayTimer) clearTimeout(trainingAutoPlayTimer);
  state.trainingActive = true;
  state.trainingRoot = startNode;
  state.trainingRepColor = repColor;
  state.trainingMode = pendingTrainingMode;
  state.trainingLabel = buildTrainingLabel(startNode, repColor);
  const bannerLabel = document.getElementById('training-banner-label');
  if (bannerLabel) bannerLabel.textContent = state.trainingLabel;
  state.trainingIgnoredNoReply = new Set(pendingTrainingMissingNodes.map(n => n.id));
  state.trainingVisited = new Set(state.trainingIgnoredNoReply);
  state.trainingAnswered = new Set();
  const repIdx = findRepIndexForNode(startNode);
  state.activeRepIndex = repIdx;
  state.currentNode = startNode;
  state.chess.load(startNode.fen);
  state.boardFlipped = repColor === 'b';
  state.redoStack = [];
  render();

  if (isDirectTargetTrainingMode()) {
    showNextTrainingTarget();
    return;
  }

  advanceAutoPlay();
}

function stopTraining() {
  if (trainingAutoPlayTimer) clearTimeout(trainingAutoPlayTimer);
  trainingAutoPlayTimer = null;
  state.trainingActive = false;
  state.trainingRoot = null;
  state.trainingRepColor = null;
  state.trainingLabel = '';
  state.trainingVisited = new Set();
  state.trainingIgnoredNoReply = new Set();
  state.trainingAnswered = new Set();
  render();
}

function buildTrainingLabel(node, repColor) {
  // Cherche le répertoire racine et le nom de variante éventuel
  let temp = node;
  while (temp.parent) temp = temp.parent;
  const repName = temp.name || (repColor === 'w' ? 'Blancs' : 'Noirs');
  const varName = node.varName || (node.parent ? '' : '');
  return varName ? `${repName} › ${varName}` : repName;
}

function showTrainingConfirmModal(node, repColor) {
  pendingTrainingNode = node;
  pendingTrainingColor = repColor;
  pendingTrainingMissingNodes = collectMissingReplyNodes(node, repColor);
  pendingTrainingMode = state.trainingMode || 'vertical';

  renderTrainingConfirmModal();

  document.getElementById('modal-overlay').style.display = 'flex';
  document.getElementById('modal-training-confirm').style.display = 'block';
}

function renderTrainingConfirmModal() {
  const title = document.getElementById('modal-training-confirm-title')
    || document.querySelector('#modal-training-confirm h3');
  const modalBody = document.getElementById('modal-training-confirm-body')
    || document.querySelector('#modal-training-confirm .modal-body');
  const confirmButton = document.getElementById('modal-training-confirm-button')
    || document.querySelector('#modal-training-confirm .modal-actions .ctrl-btn:last-child');

  const alreadyTraining = state.trainingActive;
  if (title) {
    title.textContent = alreadyTraining
      ? 'Remplacer l’entraînement en cours ?'
      : 'Choisir un mode d’entraînement';
  }

  if (confirmButton) {
    confirmButton.textContent = alreadyTraining ? 'Remplacer' : 'Démarrer';
  }

  if (!modalBody) return;

  modalBody.textContent = '';
  if (alreadyTraining) {
    modalBody.append('L’entraînement en cours (');
    const labelEl = document.createElement('b');
    labelEl.textContent = state.trainingLabel;
    modalBody.appendChild(labelEl);
    modalBody.append(') sera terminé.');
    appendLineBreak(modalBody);
    modalBody.append('Choisissez le mode du nouvel entraînement sur cette variante.');
  } else {
    modalBody.textContent = 'Choisissez le mode de lancement pour cette variante.';
  }

  appendTrainingMissingLines(modalBody, pendingTrainingColor, pendingTrainingMissingNodes);
  appendTrainingModeSelector(modalBody);
}

function showTrainingDoneModal() {
  // Fin d'entrainement effective : on repasse en mode normal avant d'afficher la modale.
  // Cela garantit que la bannière "mode entrainement" disparaît toujours.
  stopTraining();
  document.getElementById('modal-overlay').style.display = 'flex';
  document.getElementById('modal-training-done').style.display = 'block';
}

export function showStopTrainingModal() {
  document.getElementById('modal-overlay').style.display = 'flex';
  document.getElementById('modal-training-stop').style.display = 'block';
}

export function confirmStartTraining() { closeModals(); _doStartTraining(); }
export function cancelStartTraining() { closeModals(); }
export function confirmStopTraining() { stopTraining(); closeModals(); }
export function cancelStopTraining() { closeModals(); }
export function closeTrainingDone() { stopTraining(); closeModals(); }
export function confirmTrainingInterrupt() {
  const action = pendingTrainingInterruptAction;
  pendingTrainingInterruptAction = null;
  stopTraining();
  closeModals();
  if (typeof action === 'function') action();
}
export function cancelTrainingInterrupt() { closeModals(); }

function renderRepertoireList(container) {
  if (state.repertoires.length === 0) {
    container.innerHTML = '<div class="panel-empty">Utilisez le bouton "CRÉER RÉP." pour commencer.</div>';
    return;
  }

  const whites = state.repertoires.map((rep, index) => ({ rep, index })).filter(item => item.rep.color === 'w');
  const blacks = state.repertoires.map((rep, index) => ({ rep, index })).filter(item => item.rep.color === 'b');
  createSection('BLANCS', whites, 'white', container);
  createSection('NOIRS', blacks, 'black', container);
}

function createSection(label, items, key, container) {
  const section = document.createElement('div');
  section.className = 'rep-section';
  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = `<span>${label} (${items.length})</span> <span>${state.sectionStates[key] ? '▼' : '▶'}</span>`;
  header.onclick = () => {
    state.sectionStates[key] = !state.sectionStates[key];
    render();
  };
  section.appendChild(header);

  const content = document.createElement('div');
  content.className = `section-content ${state.sectionStates[key] ? 'open' : ''}`;

  function hasNamedDescendants(node) {
    return node.children.some(c => c.varName || hasNamedDescendants(c));
  }

  function makeRepToggle(id) {
    const toggle = document.createElement('div');
    toggle.className = 'tree-toggle';
    toggle.textContent = state.repExpanded.has(id) ? '−' : '+';
    toggle.onclick = e => {
      e.stopPropagation();
      state.repExpanded.has(id) ? state.repExpanded.delete(id) : state.repExpanded.add(id);
      render();
    };
    return toggle;
  }

  items.forEach(({ rep, index }) => {
    const wrap = document.createElement('div');
    wrap.className = 'rep-item-wrapper';
    const repHeader = document.createElement('div');
    repHeader.className = `rep-header ${state.activeRepIndex === index ? 'active' : ''}`;
    const repRow = document.createElement('div');
    repRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
    if (hasNamedDescendants(rep)) {
      repRow.appendChild(makeRepToggle(rep.id));
    }
    const repNameEl = document.createElement('b');
    repNameEl.style.cssText = 'flex:1;min-width:0;';
    const repAnnotStyle = ANNOTATION_STYLE[rep.varAnnotation] || null;
    repNameEl.innerHTML = `${rep.name}${rep.varAnnotation ? ` <span class="annotation-tag"${repAnnotStyle ? ` style="color:${repAnnotStyle.color}"` : ''}>${rep.varAnnotation}</span>` : ''}`;  
    repRow.appendChild(repNameEl);
    const repMoveCount = countMoves(rep, rep.color);
    const repTrainBtn = document.createElement('button');
    repTrainBtn.className = 'train-btn';
    repTrainBtn.textContent = `S'entraîner (${repMoveCount} coups)`;
    repTrainBtn.onclick = e => { e.stopPropagation(); showTrainingConfirmModal(rep, rep.color); };
    repRow.appendChild(repTrainBtn);
    repHeader.appendChild(repRow);
    repHeader.onclick = e => {
      e.stopPropagation();
      state.activeRepIndex = index;
      state.currentNode = findLastUniquePosition(rep);
      expandPathToCurrentNode();
      state.chess.load(state.currentNode.fen);
      state.boardFlipped = rep.color === 'b';
      render();
    };
    repHeader.oncontextmenu = e => handleRightClick(e, 'repertoire_item', rep, index);
    wrap.appendChild(repHeader);

    const subContainer = document.createElement('div');
    subContainer.className = 'sub-variants-container';

    function buildSubVarTree(node, depth = 0) {
      node.children.forEach(child => {
        if (child.varName) {
          const item = document.createElement('div');
          item.className = `sub-var-item ${state.currentNode.id === child.id ? 'active' : ''}`;
          item.style.marginLeft = depth * 15 + 'px';
          if (hasNamedDescendants(child)) {
            item.appendChild(makeRepToggle(child.id));
          }
          const nameSpan = document.createElement('span');
          nameSpan.style.cssText = 'flex:1;min-width:0;';
          const childAnnotStyle = ANNOTATION_STYLE[child.varAnnotation] || null;
          nameSpan.innerHTML = `${child.varName}${child.varAnnotation ? ` <span class="annotation-tag"${childAnnotStyle ? ` style="color:${childAnnotStyle.color}"` : ''}>${child.varAnnotation}</span>` : ''}`;  
          item.appendChild(nameSpan);
          const moveCount = countMoves(child, rep.color);
          const trainBtn = document.createElement('button');
          trainBtn.className = 'train-btn';
          trainBtn.textContent = `S'entraîner (${moveCount} coups)`;
          trainBtn.onclick = e => { e.stopPropagation(); showTrainingConfirmModal(child, rep.color); };
          item.appendChild(trainBtn);
          item.onclick = e => {
            e.stopPropagation();
            state.activeRepIndex = index;
            state.currentNode = child;
            expandPathToCurrentNode();
            state.chess.load(state.currentNode.fen);
            state.boardFlipped = rep.color === 'b';
            render();
          };
          item.oncontextmenu = e => handleRightClick(e, 'repertoire_subitem', child);
          subContainer.appendChild(item);
          if (state.repExpanded.has(child.id)) {
            buildSubVarTree(child, depth + 1);
          }
        } else {
          buildSubVarTree(child, depth);
        }
      });
    }

    buildSubVarTree(rep);
    if (subContainer.children.length > 0 && state.repExpanded.has(rep.id)) {
      wrap.appendChild(subContainer);
    }

    content.appendChild(wrap);
  });

  section.appendChild(content);
  container.appendChild(section);
}

function expandPathToCurrentNode() {
  let temp = state.currentNode;
  if (temp) {
    state.treeExpanded.add(temp.id);
  }
  while (temp && temp.parent) {
    state.treeExpanded.add(temp.parent.id);
    temp = temp.parent;
  }
}

function findLastUniquePosition(node) {
  let current = node;
  while (current.children.length === 1) {
    current = current.children[0];
  }
  return current;
}

function updateMonitor() {
  const titleEl = document.getElementById('mon-title');
  const pgnEl = document.getElementById('mon-pgn');
  const commEl = document.getElementById('mon-comment');
  if (state.activeRepIndex === -1) {
    titleEl.textContent = 'Jeu Libre';
    pgnEl.textContent = getPathString(state.currentNode);
    commEl.style.display = 'none';
  } else {
    let currentTitle = state.repertoires[state.activeRepIndex].name;
    let temp = state.currentNode;
    while (temp) {
      if (temp.varName) {
        currentTitle = temp.varName;
        break;
      }
      temp = temp.parent;
    }
    titleEl.textContent = currentTitle;
    pgnEl.textContent = getPathString(state.currentNode);
    commEl.textContent = state.currentNode.comment || '';
    commEl.style.display = state.currentNode.comment ? 'block' : 'none';
  }
}

/* ========== SPLASH SCREEN & AUTH FUNCTIONS ========== */

export function showSplashScreen() {
  const splashEl = document.getElementById('splash-screen');
  if (splashEl) {
    splashEl.classList.remove('hidden');
    backToSplashWelcome();
  }
}

export function hideSplashScreen() {
  const splashEl = document.getElementById('splash-screen');
  if (splashEl) {
    splashEl.classList.add('hidden');
  }
}

export function showSplashForm(mode) {
  // Masquer la section bienvenue et invité
  const welcomeEl = document.getElementById('splash-welcome');
  const formEl = document.getElementById('splash-form');
  const guestEl = document.getElementById('splash-guest');
  if (welcomeEl) welcomeEl.classList.add('hidden');
  if (formEl) formEl.classList.remove('hidden');
  if (guestEl) guestEl.classList.add('hidden');

  // Configurer le formulaire
  const isSignup = mode === 'signup';
  const titleEl = document.getElementById('splash-form-title');
  const usernameRowEl = document.getElementById('splash-username-row');
  const emailRowEl = document.getElementById('splash-email-row');
  const submitBtnEl = document.getElementById('splash-submit-btn');
  const errorEl = document.getElementById('splash-error');

  if (titleEl) titleEl.textContent = isSignup ? 'Créer un compte' : 'Connexion';
  if (usernameRowEl) usernameRowEl.style.display = isSignup ? 'block' : 'none';
  if (emailRowEl) emailRowEl.style.display = isSignup ? 'none' : 'block';
  if (submitBtnEl) submitBtnEl.textContent = isSignup ? 'Créer le compte' : 'Se connecter';
  if (errorEl) errorEl.textContent = '';

  // Nettoyer les champs
  document.getElementById('splash-username-input').value = '';
  document.getElementById('splash-email-input').value = '';
  document.getElementById('splash-password-input').value = '';
}

export function backToSplashWelcome() {
  const welcomeEl = document.getElementById('splash-welcome');
  const formEl = document.getElementById('splash-form');
  const guestEl = document.getElementById('splash-guest');
  if (welcomeEl) welcomeEl.classList.remove('hidden');
  if (formEl) formEl.classList.add('hidden');
  if (guestEl) guestEl.classList.add('hidden');
  
  // Nettoyer les champs et erreurs
  document.getElementById('splash-username-input').value = '';
  document.getElementById('splash-email-input').value = '';
  document.getElementById('splash-password-input').value = '';
  document.getElementById('splash-error').textContent = '';
}

export function showSplashGuest() {
  // Masquer les autres sections
  const welcomeEl = document.getElementById('splash-welcome');
  const formEl = document.getElementById('splash-form');
  const guestEl = document.getElementById('splash-guest');
  if (welcomeEl) welcomeEl.classList.add('hidden');
  if (formEl) formEl.classList.add('hidden');
  if (guestEl) guestEl.classList.remove('hidden');
}

export async function submitSplashForm() {
  const mode = document.getElementById('splash-form-title').textContent.includes('Créer') ? 'signup' : 'login';
  const username = document.getElementById('splash-username-input')?.value.trim() || '';
  const email = document.getElementById('splash-email-input')?.value.trim() || '';
  const password = document.getElementById('splash-password-input')?.value || '';
  const errorEl = document.getElementById('splash-error');
  const submitBtn = document.getElementById('splash-submit-btn');

  errorEl.textContent = '';

  if (mode === 'signup') {
    if (!username || !password) {
      errorEl.textContent = 'Remplissez tous les champs.';
      return;
    }
    if (password.length < 8) {
      errorEl.textContent = 'Le mot de passe doit contenir au moins 8 caractères.';
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Chargement...';
    await signupWithCredentials({ username, password });
    submitBtn.disabled = false;
    submitBtn.textContent = 'Créer le compte';
  } else {
    if (!email || !password) {
      errorEl.textContent = 'Pseudo ou email et mot de passe requis.';
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Chargement...';
    await loginWithCredentials({ email, password });
    submitBtn.disabled = false;
    submitBtn.textContent = 'Se connecter';
  }

  // Vérifier s'il y a une erreur d'authentification
  if (state.auth.error) {
    errorEl.textContent = state.auth.error;
  } else if (state.auth.user) {
    // Succès ! Fermer la splash screen et afficher l'app
    hideSplashScreen();
    render();
  }
}

export function confirmGuestMode() {
  initExampleData();
  closeModals();
  hideSplashScreen();
  render();
}

/* ========== ACCOUNT MANAGEMENT ========== */

let currentAccountMode = 'login'; // 'login' ou 'signup'

export function openAccountModal(mode = 'login') {
  currentAccountMode = mode;
  // Initialiser le modal selon le mode demandé
  initializeAccountModal();
  document.getElementById('modal-overlay').style.display = 'flex';
  document.getElementById('modal-account').style.display = 'block';
}

function initializeAccountModal() {
  const isSignup = currentAccountMode === 'signup';
  
  const titleEl = document.getElementById('account-modal-title');
  const usernameRowEl = document.getElementById('account-username-row');
  const emailInputEl = document.getElementById('account-email');
  const submitBtnEl = document.getElementById('account-submit-btn');
  const errorEl = document.getElementById('account-error');
  
  if (titleEl) titleEl.textContent = isSignup ? 'Créer un compte' : 'Se connecter';
  if (usernameRowEl) usernameRowEl.style.display = isSignup ? 'block' : 'none';
  if (emailInputEl) emailInputEl.placeholder = isSignup ? 'Email' : 'Email ou pseudo';
  if (submitBtnEl) submitBtnEl.textContent = isSignup ? 'Créer le compte' : 'Se connecter';
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.style.display = 'none';
  }
  
  // Nettoyer les champs
  if (document.getElementById('account-username')) document.getElementById('account-username').value = '';
  if (document.getElementById('account-email')) document.getElementById('account-email').value = '';
  if (document.getElementById('account-password')) document.getElementById('account-password').value = '';
}

export function switchAuthMode() {
  const isSignup = currentAccountMode === 'signup';
  currentAccountMode = isSignup ? 'login' : 'signup';
  initializeAccountModal();
}

export async function submitAccountForm() {
  const isSignup = currentAccountMode === 'signup';
  const username = document.getElementById('account-username')?.value.trim() || '';
  const email = document.getElementById('account-email')?.value.trim() || '';
  const password = document.getElementById('account-password')?.value || '';
  const errorEl = document.getElementById('account-error');
  const submitBtn = document.getElementById('account-submit-btn');
  
  if (!errorEl) return;
  errorEl.textContent = '';
  errorEl.style.display = 'none';
  
  if (isSignup) {
    if (!username || !password) {
      errorEl.textContent = 'Remplissez tous les champs.';
      errorEl.style.display = 'block';
      return;
    }
    if (password.length < 8) {
      errorEl.textContent = 'Le mot de passe doit contenir au moins 8 caractères.';
      errorEl.style.display = 'block';
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Création...';
    await signupWithCredentials({ username, password });
    submitBtn.disabled = false;
    submitBtn.textContent = 'Créer le compte';
  } else {
    if (!email || !password) {
      errorEl.textContent = 'Email/pseudo et mot de passe requis.';
      errorEl.style.display = 'block';
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Connexion...';
    await loginWithCredentials({ email, password });
    submitBtn.disabled = false;
    submitBtn.textContent = 'Se connecter';
  }
  
  // Vérifier s'il y a une erreur d'authentification
  if (state.auth.error) {
    errorEl.textContent = state.auth.error;
    errorEl.style.display = 'block';
  } else if (state.auth.user) {
    // Succès ! Fermer le modal et afficher l'app
    closeModals();
    updateAccountUI();
    render();
  }
}

export function updateAccountUI() {
  const topAccountEl = document.querySelector('.top-account');
  if (!topAccountEl) return;
  
  if (state.auth.user) {
    // Utilisateur connecté
    const avatarEl = topAccountEl.querySelector('.account-avatar');
    const nameEl = topAccountEl.querySelector('.account-name');
    const statusEl = topAccountEl.querySelector('.account-status');
    
    if (avatarEl) {
      // Afficher les initiales
      const initials = state.auth.user.username 
        ? state.auth.user.username.substring(0, 2).toUpperCase()
        : 'TS';
      avatarEl.textContent = initials;
    }
    if (nameEl) nameEl.textContent = state.auth.user.username || 'Utilisateur';
    if (statusEl) statusEl.textContent = 'Connecté';
    
    topAccountEl.style.display = 'flex';
    topAccountEl.style.cursor = 'pointer';
    topAccountEl.onclick = () => {
      if (confirm('Déconnecter du compte ' + state.auth.user.username + ' ?')) {
        logoutAccount();
      }
    };
  } else {
    // Utilisateur non connecté (mode invité)
    const avatarEl = topAccountEl.querySelector('.account-avatar');
    const nameEl = topAccountEl.querySelector('.account-name');
    const statusEl = topAccountEl.querySelector('.account-status');
    
    if (avatarEl) avatarEl.textContent = '👤';
    if (nameEl) nameEl.textContent = 'Invité';
    if (statusEl) statusEl.textContent = 'Mode invité';
    
    topAccountEl.style.display = 'flex';
    topAccountEl.style.cursor = 'pointer';
    topAccountEl.onclick = showGuestAccountMenu;
  }
}

function showGuestAccountMenu() {
  // Créer un menu contextuel simple
  const menu = document.createElement('div');
  menu.className = 'guest-account-menu';
  menu.style.cssText = `
    position: fixed;
    top: 70px;
    right: 24px;
    background: rgba(15, 23, 42, 0.98);
    border: 1px solid rgba(148, 163, 184, 0.15);
    border-radius: 5px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    z-index: 10001;
    padding: 8px 0;
    min-width: 200px;
  `;
  
  const loginBtn = document.createElement('div');
  loginBtn.style.cssText = `
    padding: 12px 18px;
    cursor: pointer;
    color: #e2e8f0;
    font-size: 0.9rem;
    font-weight: 700;
    transition: background 0.2s ease;
    border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  `;
  loginBtn.textContent = '🔓 Se connecter';
  loginBtn.onmouseenter = () => { loginBtn.style.background = 'rgba(122, 174, 203, 0.1)'; };
  loginBtn.onmouseleave = () => { loginBtn.style.background = ''; };
  loginBtn.onclick = () => {
    menu.remove();
    openAccountModal('login');
  };
  
  const signupBtn = document.createElement('div');
  signupBtn.style.cssText = `
    padding: 12px 18px;
    cursor: pointer;
    color: #e2e8f0;
    font-size: 0.9rem;
    font-weight: 700;
    transition: background 0.2s ease;
  `;
  signupBtn.textContent = '✏️ Créer un compte';
  signupBtn.onmouseenter = () => { signupBtn.style.background = 'rgba(122, 174, 203, 0.1)'; };
  signupBtn.onmouseleave = () => { signupBtn.style.background = ''; };
  signupBtn.onclick = () => {
    menu.remove();
    openAccountModal('signup');
  };
  
  menu.appendChild(loginBtn);
  menu.appendChild(signupBtn);
  document.body.appendChild(menu);
  
  // Fermer le menu quand on clique ailleurs
  setTimeout(() => {
    const closeMenuHandler = (e) => {
      if (!menu.contains(e.target) && e.target !== document.querySelector('.top-account')) {
        menu.remove();
        document.removeEventListener('click', closeMenuHandler);
      }
    };
    document.addEventListener('click', closeMenuHandler);
  }, 100);
}

export function logoutAccount() {
  logoutSession();
  closeModals();
  showSplashScreen();
}
// ─────── TOOLTIP SYSTEM ───────

let currentTooltip = null;
let tooltipHideTimer = null;
let hoverShowTimer = null;
let countermovesCache = {};

function hideCurrentTooltip() {
  if (tooltipHideTimer) clearTimeout(tooltipHideTimer);
  tooltipHideTimer = null;
  if (hoverShowTimer) clearTimeout(hoverShowTimer);
  hoverShowTimer = null;
  if (currentTooltip) {
    currentTooltip.remove();
    currentTooltip = null;
  }
}

function createTooltip(content, x, y) {
  hideCurrentTooltip();
  
  const tooltip = document.createElement('div');
  tooltip.className = 'move-hover-tooltip';
  tooltip.innerHTML = content;
  document.body.appendChild(tooltip);

  const positionTooltip = (baseX, baseY) => {
    const rect = tooltip.getBoundingClientRect();
    const pad = 10;
    const clampedX = Math.max(pad, Math.min(baseX, window.innerWidth - rect.width - pad));
    const clampedY = Math.max(pad, Math.min(baseY, window.innerHeight - rect.height - pad));
    tooltip.style.left = `${clampedX}px`;
    tooltip.style.top = `${clampedY}px`;
  };
  
  // Repositionner pour rester dans les bords de l'écran
  requestAnimationFrame(() => {
    positionTooltip(x, y);
  });
  
  tooltip.addEventListener('mouseenter', () => {
    if (tooltipHideTimer) {
      clearTimeout(tooltipHideTimer);
      tooltipHideTimer = null;
    }
  });
  
  tooltip.addEventListener('mouseleave', () => {
    tooltipHideTimer = setTimeout(hideCurrentTooltip, 200);
  });
  
  tooltip.reposition = positionTooltip;
  currentTooltip = tooltip;
  return tooltip;
}

function generateMiniboardHtml(fen, move) {
  try {
    const tempChess = new Chess(fen);
    const from = move.uci.substring(0, 2);
    const to = move.uci.substring(2, 4);
    tempChess.move({ from, to }, { sloppy: true });
    const board = tempChess.board();
    
    // Couleurs du thème principal
    const lightSquare = state.boardTheme?.light ?? '#ebefd6';
    const darkSquare = state.boardTheme?.dark ?? '#556173';
    
    let html = '<div style="display:grid; grid-template-columns:repeat(8,24px); gap:0; background:#000; padding:1px; margin:4px 0;">';
    
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const isLight = (r + c) % 2 === 0;
        const bg = isLight ? lightSquare : darkSquare;
        const piece = board[r][c];
        const sq = String.fromCharCode(97 + c) + (8 - r);
        
        let highlight = '';
        if (sq === from || sq === to) {
          highlight = 'box-shadow: inset 0 0 0 2px #ffd700;';
        }
        
        let pieceHtml = '';
        if (piece) {
          const map = {
            'wp': '4/45/Chess_plt45.svg',
            'wr': '7/72/Chess_rlt45.svg',
            'wn': '7/70/Chess_nlt45.svg',
            'wb': 'b/b1/Chess_blt45.svg',
            'wq': '1/15/Chess_qlt45.svg',
            'wk': '4/42/Chess_klt45.svg',
            'bp': 'c/c7/Chess_pdt45.svg',
            'br': 'f/ff/Chess_rdt45.svg',
            'bn': 'e/ef/Chess_ndt45.svg',
            'bb': '9/98/Chess_bdt45.svg',
            'bq': '4/47/Chess_qdt45.svg',
            'bk': 'f/f0/Chess_kdt45.svg'
          };
          const icon = map[piece.color + piece.type];
          pieceHtml = `<img src="https://upload.wikimedia.org/wikipedia/commons/${icon}" style="width:22px;height:22px;">`;
        }
        
        html += `<div style="width:24px;height:24px;background:${bg};${highlight}">${pieceHtml}</div>`;
      }
    }
    
    html += '</div>';
    return html;
  } catch (e) {
    return '';
  }
}

function buildCountermovesHtml(counterMoves) {
  if (!counterMoves || counterMoves.length === 0) {
    return '<div class="move-hover-tooltip-row"><span class="move-hover-tooltip-value">Aucun coup</span></div>';
  }
  
  const totalAllMoves = counterMoves.reduce((sum, m) => sum + m.white + m.draws + m.black, 0);
  
  return counterMoves
    .map(m => {
      const total = m.white + m.draws + m.black;
      const pct = totalAllMoves > 0 ? Math.round((total / totalAllMoves) * 100) : 0;
      return `<div class="move-hover-tooltip-row"><span class="move-hover-tooltip-label">${m.san}:</span><span class="move-hover-tooltip-value">${pct}% (${formatNumberShort(total)})</span></div>`;
    })
    .join('');
}

async function loadCountermoves(move) {
  if (countermovesCache[move.uci]) {
    return countermovesCache[move.uci];
  }
  
  try {
    const tempChess = new Chess(state.currentNode.fen);
    const from = move.uci.substring(0, 2);
    const to = move.uci.substring(2, 4);
    const moveResult = tempChess.move({ from, to }, { sloppy: true });
    
    if (!moveResult) {
      return null;
    }
    
    const nextFen = tempChess.fen();
    const nextStats = await fetchLichessStats(nextFen, {
      min: state.statsFilters?.eloMin ?? 0,
      max: state.statsFilters?.eloMax ?? 3000
    }, state.statsFilters?.currentDatabase ?? 'lichess');
    
    const topMoves = (nextStats.moves || []).slice(0, 3);
    countermovesCache[move.uci] = topMoves;
    return topMoves;
  } catch (error) {
    console.error('Erreur lors du chargement des contre-coups:', error);
    return null;
  }
}

function buildLichessTooltipContent(move) {
  if (!move) return '';
  
  const rows = [];
  
  if (state.lichessStats?.openingName) {
    rows.push(`<div class="move-hover-tooltip-row"><span class="move-hover-tooltip-label">Ouverture:</span><span class="move-hover-tooltip-value">${state.lichessStats.openingName}</span></div>`);
    if (state.lichessStats.eco) {
      rows.push(`<div class="move-hover-tooltip-row"><span class="move-hover-tooltip-label">ECO:</span><span class="move-hover-tooltip-value">${state.lichessStats.eco}</span></div>`);
    }
  }
  
  const miniboard = generateMiniboardHtml(state.currentNode.fen, move);
  if (miniboard) {
    rows.push(`<div style="margin: 8px 0;">${miniboard}</div>`);
  }
  
  return rows.join('');
}

function convertPvUciToSan(uciMoves, startFen) {
  if (!Array.isArray(uciMoves) || uciMoves.length === 0) return [];
  if (!startFen) return uciMoves;
  
  const tempChess = new Chess();
  tempChess.load(startFen);
  const sanMoves = [];
  
  for (const uciMove of uciMoves) {
    try {
      const from = uciMove.slice(0, 2);
      const to = uciMove.slice(2, 4);
      const promo = uciMove[4];
      const move = tempChess.move({ from, to, ...(promo ? { promotion: promo } : {}), sloppy: false });
      if (move) {
        sanMoves.push(move.san);
      } else {
        sanMoves.push(uciMove);
      }
    } catch {
      sanMoves.push(uciMove);
    }
  }
  
  return sanMoves;
}

function buildEngineTooltipContent(move) {
  if (!move) return '';
  
  const score = state.moveAnnotationScores?.[move.uci];
  const rows = [];
  
  if (score) {
    rows.push(`<div class="move-hover-tooltip-row"><span class="move-hover-tooltip-label">Évaluation:</span><span class="move-hover-tooltip-value">${score}</span></div>`);
  } else if (state.isAnalysisEnabled && state.moveAnnotationsLoading) {
    rows.push(`<div class="move-hover-tooltip-row"><span class="move-hover-tooltip-label">Évaluation:</span><span class="move-hover-tooltip-value">Calcul en cours...</span></div>`);
  } else if (!state.isAnalysisEnabled) {
    rows.push(`<div class="move-hover-tooltip-row"><span class="move-hover-tooltip-label">Évaluation:</span><span class="move-hover-tooltip-value">Activez Analyse</span></div>`);
  }
  
  if (state.isAnalysisEnabled && state.analysisResults && state.analysisResults.length > 0) {
    const movePv = state.moveAnnotationPvs?.[move.uci];
    if (movePv && movePv.length > 0) {
      rows.push('<div class="move-hover-tooltip-separator"></div>');
      rows.push('<div class="move-hover-tooltip-section-title">Ligne Principale:</div>');
      const sanMoves = convertPvUciToSan(movePv.slice(0, 5), state.currentNode?.fen);
      rows.push(`<div class="move-hover-tooltip-pv">${sanMoves.join(' ')}</div>`);
    }
  }
  
  if (state.isAnalysisEnabled && state.analysisResults && state.analysisResults.length > 1) {
    const best = state.analysisResults[0];
    const second = state.analysisResults[1];
    
    if (best && second && Number.isFinite(best.cpValue) && Number.isFinite(second.cpValue)) {
      const diff = Math.abs(best.cpValue - second.cpValue);
      rows.push('<div class="move-hover-tooltip-separator"></div>');
      rows.push('<div class="move-hover-tooltip-section-title">Analyse:</div>');
      rows.push(`<div class="move-hover-tooltip-row"><span class="move-hover-tooltip-label">Profondeur:</span><span class="move-hover-tooltip-value">${state.analysisDepth}</span></div>`);
      rows.push(`<div class="move-hover-tooltip-row"><span class="move-hover-tooltip-label">Écart 1°-2°:</span><span class="move-hover-tooltip-value">${(diff / 100).toFixed(2)}</span></div>`);
      
      if (state.analysisResults.length > 2) {
        const third = state.analysisResults[2];
        if (third && Number.isFinite(third.cpValue)) {
          const diff23 = Math.abs(second.cpValue - third.cpValue);
          rows.push(`<div class="move-hover-tooltip-row"><span class="move-hover-tooltip-label">Écart 2°-3°:</span><span class="move-hover-tooltip-value">${(diff23 / 100).toFixed(2)}</span></div>`);
        }
      }
    }
  }
  
  if (state.isAnalysisEnabled && state.analysisResults && state.analysisResults.length > 1) {
    rows.push('<div class="move-hover-tooltip-separator"></div>');
    rows.push('<div class="move-hover-tooltip-section-title">Alternatives:</div>');
    state.analysisResults.slice(1, 3).forEach((result, idx) => {
      if (result) {
        rows.push(`<div class="move-hover-tooltip-row"><span class="move-hover-tooltip-label">${idx + 2}°:</span><span class="move-hover-tooltip-value">${result.score}</span></div>`);
      }
    });
  }
  
  return rows.join('') || '<div class="move-hover-tooltip-row"><span class="move-hover-tooltip-value">Aucune donnée</span></div>';
}

function attachStatsRowHover(row, move) {
  if (!row || !move) return;
  
  row.addEventListener('mouseenter', async (e) => {
    if (hoverShowTimer) clearTimeout(hoverShowTimer);
    if (tooltipHideTimer) clearTimeout(tooltipHideTimer);
    tooltipHideTimer = null;
    
    hoverShowTimer = setTimeout(async () => {
      const content = buildLichessTooltipContent(move);
      
      if (content) {
        const rect = row.getBoundingClientRect();
        const initialHtml = content + '<div style="margin-top: 8px; color: var(--text-muted); font-size: 0.78rem;">Chargement contre-coups...</div>';
        const x = rect.left - 300;
        const y = rect.top + rect.height / 2;
        createTooltip(initialHtml, x, y);
        
        const counterMoves = await loadCountermoves(move);
        if (currentTooltip) {
          const countersHtml = buildCountermovesHtml(counterMoves);
          currentTooltip.innerHTML = content + '<div class="move-hover-tooltip-section-title" style="margin-top: 8px;">Contre-coups:</div>' + countersHtml;
          const currentX = Number.parseFloat(currentTooltip.style.left || '0');
          const currentY = Number.parseFloat(currentTooltip.style.top || '0');
          if (typeof currentTooltip.reposition === 'function') {
            currentTooltip.reposition(currentX, currentY);
          }
        }
      }
      hoverShowTimer = null;
    }, 300);
  });
  
  row.addEventListener('mouseleave', () => {
    if (hoverShowTimer) clearTimeout(hoverShowTimer);
    hoverShowTimer = null;
    tooltipHideTimer = setTimeout(hideCurrentTooltip, 200);
  });
}

function attachAnnotationHover(indicator, move) {
  if (!indicator || !move) return;
  
  indicator.addEventListener('mouseenter', (e) => {
    if (hoverShowTimer) clearTimeout(hoverShowTimer);
    if (tooltipHideTimer) clearTimeout(tooltipHideTimer);
    tooltipHideTimer = null;
    
    hoverShowTimer = setTimeout(() => {
      const content = buildEngineTooltipContent(move);
      if (content) {
        const rect = indicator.getBoundingClientRect();
        const x = rect.left - 300;
        const y = rect.top + rect.height / 2;
        createTooltip(content, x, y);
      }
      hoverShowTimer = null;
    }, 300);
  });
  
  indicator.addEventListener('mouseleave', () => {
    if (hoverShowTimer) clearTimeout(hoverShowTimer);
    hoverShowTimer = null;
    tooltipHideTimer = setTimeout(hideCurrentTooltip, 200);
  });
}
