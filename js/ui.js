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
import { loginWithCredentials, signupWithCredentials, logoutSession, scheduleRepertoireSync } from './auth.js';
import { apiRequest } from './api.js';
import { requestVisibleMoveAnnotations, renderEvalBar } from './analysis.js';
import { getMoveTotalGames, getMoveWinRate, getMoveEnginePreference } from './statsUtils.js';
import { saveState, loadState } from './storage.js';

let currentDragColor = null;

function saveRepOrder() {
  saveState('rep-display-order', state.repertoires.map(r => r.id));
}

const BOARD_THEME_KEY = 'alphaChess.boardTheme';

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
let pendingTrainingOutOfScopeTranspos = [];
let pendingTrainingIncludeOutOfScope = true;
let pendingTrainingMode = 'vertical';
let pendingTrainingInterruptAction = null;
let trainingAutoPlayTimer = null;

const SURVIVAL_LIVES = 3;
const SURVIVAL_LIFE_BONUS_INTERVAL = 20; // coups corrects avant chaque vie bonus

/**
 * Vérifie si le joueur doit recevoir une vie bonus (tous les 20 coups corrects).
 * Si les 3 cœurs normaux sont pleins, accorde un cœur doré bonus.
 * Déclenche une animation visuelle sur le panneau monitor.
 */
function checkSurvivalLifeBonus() {
  if (!state.trainingActive || state.trainingMode !== 'survival') return;
  const correct = state.trainingAnswered?.size || 0;
  const expectedMilestone = (state.trainingSurvivalMilestones + 1) * SURVIVAL_LIFE_BONUS_INTERVAL;
  if (correct < expectedMilestone) return;

  state.trainingSurvivalMilestones += 1;

  if (state.trainingSurvivalLives < SURVIVAL_LIVES) {
    // Récupère un cœur normal
    state.trainingSurvivalLives += 1;
    scheduleSurvivalHeartBonusAnimation('normal');
  } else if (!state.trainingSurvivalGoldenHeart) {
    // Octroie le cœur doré bonus
    state.trainingSurvivalGoldenHeart = true;
    scheduleSurvivalHeartBonusAnimation('golden');
  }
  // Si déjà à 3 vies + cœur doré, on ignore silencieusement
}

function scheduleSurvivalHeartBonusAnimation(type) {
  // On re-rend le moniteur pour afficher les cœurs mis à jour, puis on ajoute la classe
  // d'animation sur le dernier cœur ajouté.
  render();
  requestAnimationFrame(() => {
    const container = document.querySelector('.survival-monitor-hearts');
    if (!container) return;
    // Le nouveau cœur est le dernier span enfant
    const spans = container.querySelectorAll('.survival-heart');
    // Trouver le dernier cœur plein (ou doré)
    let targetSpan = null;
    if (type === 'golden') {
      targetSpan = container.querySelector('.survival-heart.is-golden');
    } else {
      // Dernier cœur plein (rouge)
      const filled = [...spans].filter(s => !s.classList.contains('is-empty') && !s.classList.contains('is-golden'));
      targetSpan = filled[filled.length - 1] || null;
    }
    if (targetSpan) {
      targetSpan.classList.remove('arriving');
      // Force reflow
      void targetSpan.offsetWidth;
      targetSpan.classList.add('arriving');
      targetSpan.addEventListener('animationend', () => targetSpan.classList.remove('arriving'), { once: true });
    }
  });
}

const MEDAL_RANK = {
  none: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
  diamond: 5,
  chrome: 6,
};

const TRAINING_MODES = {
  survival: {
    label: 'Survie',
    description: '3 vies, les erreurs font avancer la ligne, objectif: couvrir tout le répertoire.'
  },
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
  if (state.trainingMode === 'survival') checkSurvivalLifeBonus();
  advanceAutoPlay(50); // réponse immédiate après coup validé
});

eventBus.on('trainingTargetCompleted', () => {
  showNextTrainingTarget(50);
});

eventBus.on('trainingSurvivalDefeat', () => {
  showTrainingDefeatModal();
});

eventBus.on('openMoveContextMenu', ({ event, source, move }) => {
  if (!event || !move) return;
  handleRightClick(event, source || 'stats_move', move);
});

export function render() {
  hideCurrentTooltip();
  // Supprimer les tooltips orphelins de l'analyse (ex: quand le panneau est
  // re-rendu sans que mouseleave ait été déclenché)
  document.querySelectorAll('.move-hover-tooltip').forEach(el => el.remove());
  updateAccountUI();
  updateMonitor();
  renderBoard(handleSquareClick);

  // Bind candidates toggle (once)
  const candsBtn = document.getElementById('cands-toggle-btn');
  const candsBody = document.getElementById('cands-body');
  if (candsBtn && !candsBtn.dataset.bound) {
    candsBtn.addEventListener('click', () => {
      if (!state.statsFilters) state.statsFilters = {};
      state.statsFilters.candidatesOpen = !(state.statsFilters.candidatesOpen !== false);
      if (candsBody) candsBody.classList.toggle('is-collapsed', !state.statsFilters.candidatesOpen);
      candsBtn.setAttribute('aria-expanded', state.statsFilters.candidatesOpen ? 'true' : 'false');
    });
    candsBtn.dataset.bound = '1';
  }
  if (candsBtn && candsBody) {
    const open = state.statsFilters?.candidatesOpen !== false;
    candsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    candsBody.classList.toggle('is-collapsed', !open);
  }

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
  const analysisPanel = document.getElementById('analysis-panel');
  const analysisTitle = document.querySelector('.monitor-analysis-title');
  const analysisSwitchWrap = analysisSwitch?.closest('.analysis-switch');
  const analysisControls = document.querySelector('.monitor-analysis-controls');
  const isTraining = state.trainingActive;
  const isSurvivalTraining = isTraining && state.trainingMode === 'survival';
  const depth = state.analysisDepth ?? 10;
  if (analysisSwitch) {
    analysisSwitch.checked = Boolean(state.isAnalysisEnabled);
  }
  if (analysisTitle) {
    analysisTitle.textContent = isSurvivalTraining ? 'Mode survie' : 'Analyse';
  }
  if (analysisSwitchWrap) {
    analysisSwitchWrap.style.display = isSurvivalTraining ? 'none' : '';
  }
  if (analysisControls) {
    analysisControls.style.display = isSurvivalTraining ? 'none' : '';
  }
  if (analysisDepthInline) {
    analysisDepthInline.hidden = isTraining || !state.isAnalysisEnabled;
  }
  if (monitorAnalysisSection) {
    monitorAnalysisSection.classList.toggle('is-collapsed', !isSurvivalTraining && !state.isAnalysisEnabled);
    monitorAnalysisSection.style.display = isTraining && !isSurvivalTraining ? 'none' : '';
  }
  if (isSurvivalTraining && analysisPanel) {
    renderSurvivalMonitorPanel(analysisPanel);
  } else if (isTraining && analysisPanel) {
    analysisPanel.textContent = '';
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
    const repertoireOpen = !isTraining && state.openPanels.repertoire;
    repertoireContainer.classList.toggle('open', repertoireOpen);
    if (isTraining) {
      state.openPanels.repertoire = false;
      repertoireContainer.innerHTML = '<div class="panel-empty">Répertoires verrouillés pendant le mode entraînement.</div>';
    } else if (repertoireOpen) {
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
  const candsSection = document.getElementById('cands-section');
  if (statsShell) statsShell.style.display = isTraining ? 'none' : '';
  if (statsLoader) statsLoader.style.display = isTraining ? 'none !important' : '';
  if (statsDetailsEl) statsDetailsEl.style.display = isTraining ? 'none' : '';
  if (openingInfoEl) openingInfoEl.style.display = isTraining ? 'none' : '';
  if (candsSection) candsSection.style.display = isTraining ? 'none' : '';

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
  contentCell.style.gridTemplateColumns = '52px 34px 44px 1fr 44px';
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
    badge.textContent = displayLabel;
    badge.style.display = 'inline-flex';
    badge.style.marginLeft = 'auto';
  }

  const depthBadge = document.getElementById('stats-depth-badge');
  if (depthBadge) {
    depthBadge.style.display = 'none';
  }

  // Update active state on sort menu items
  const sortMenu = document.getElementById('stats-sort-menu');
  if (sortMenu) {
    sortMenu.querySelectorAll('.stats-sort-menu-item').forEach(item => {
      item.classList.toggle('active', item.dataset.sortType === sortType);
    });
  }
}

export function togglePanel(panel) {
  if (!state.openPanels.hasOwnProperty(panel)) return;
  if (state.trainingActive && (panel === 'arbre' || panel === 'repertoire')) return;
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
  const isTranspoRedirect = node.isTransposition && node.sourceNode;
  state.currentNode = isTranspoRedirect ? node.sourceNode : node;
  state.chess.load(state.currentNode.fen);
  if (isTranspoRedirect) {
    expandPathToCurrentNode();
  }
  render();
  if (isTranspoRedirect) {
    requestAnimationFrame(() => {
      const activeEl = document.querySelector('#arbre-content .move-text.active');
      if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }
}

function handleTreeContext(event, node) {
  if (state.trainingActive) return;
  handleRightClick(event, 'arbre', node);
}

export function hideMenus() {
  state.ctxMenuEl.style.display = 'none';
  state.contextMenuMove = null;
}

export function openCurrentNodeInTree() {
  const target = state.menuTarget;
  hideMenus();
  if (!target) return;

  // Find the repertoire index for this target (root or variant)
  const repIdx = state.repertoires.findIndex(r => r === target || isDescendantOf(r, target));
  if (repIdx !== -1) {
    state.activeRepIndex = repIdx;
  }

  // Navigate to the target's starting position
  state.currentNode = target;
  state.chess.load(target.fen);

  // Open arbre, close all other panels
  Object.keys(state.openPanels).forEach(k => { state.openPanels[k] = false; });
  state.openPanels.arbre = true;

  render();
}

function isDescendantOf(root, node) {
  if (!root || !node) return false;
  function walk(n) {
    if (n === node) return true;
    return (n.children || []).some(walk);
  }
  return walk(root);
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
  const pgnLoader = document.getElementById('pgn-import-loading');
  if (pgnLoader) pgnLoader.style.display = 'none';
  const btnConfirm = document.getElementById('btn-rep-confirm');
  if (btnConfirm) btnConfirm.disabled = false;
  document.getElementById('btn-rep-confirm').textContent = 'Créer';
  document.getElementById('btn-rep-confirm').onclick = () => confirmRepertoireCreation();
  state.pendingNewRepFolderId = null;
  state.pendingNewRepFolderName = null;
  setRepCreationMode('start');
  selectCol('w');
  // Afficher le sélecteur de dossier (peut être masqué après un renommage)
  const folderContainer = document.getElementById('rep-folder-container');
  if (folderContainer) folderContainer.style.display = 'block';
  // Wire folder select (once) and populate
  const folderSel = document.getElementById('rep-folder-select');
  const folderNewInput = document.getElementById('rep-folder-new-name');
  if (folderSel && !folderSel.dataset.folderbound) {
    folderSel.addEventListener('change', () => {
      const val = folderSel.value;
      if (folderNewInput) folderNewInput.style.display = val === '__new__' ? 'block' : 'none';
      state.pendingNewRepFolderId = val || null;
    });
    if (folderNewInput) {
      folderNewInput.addEventListener('input', () => {
        state.pendingNewRepFolderName = folderNewInput.value.trim() || null;
      });
    }
    folderSel.dataset.folderbound = '1';
  }
  populateRepFolderSelect('w');
}

/**
 * Peuple le select de dossier dans la modale de création de répertoire.
 * Affiche uniquement les dossiers qui contiennent au moins un répertoire
 * de la couleur demandée, plus une option "Nouveau dossier".
 */
function populateRepFolderSelect(color) {
  const sel = document.getElementById('rep-folder-select');
  if (!sel) return;
  const newNameInput = document.getElementById('rep-folder-new-name');

  const folders = loadFolders();
  const colorFolderIds = new Set(
    state.repertoires
      .filter(r => r.color === color && r.folderId && folders[r.folderId])
      .map(r => r.folderId)
  );

  sel.innerHTML = '<option value="">Aucun dossier</option>';
  colorFolderIds.forEach(fid => {
    const opt = document.createElement('option');
    opt.value = fid;
    opt.textContent = folders[fid];
    sel.appendChild(opt);
  });
  const newOpt = document.createElement('option');
  newOpt.value = '__new__';
  newOpt.textContent = '+ Nouveau dossier…';
  sel.appendChild(newOpt);

  sel.value = '';
  if (newNameInput) { newNameInput.style.display = 'none'; newNameInput.value = ''; }
  state.pendingNewRepFolderId = null;
  state.pendingNewRepFolderName = null;
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
    button.style.background = active ? 'rgba(122, 174, 203, 0.18)' : '';
    button.style.borderColor = active ? 'rgba(122, 174, 203, 0.55)' : '';
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
        saveState(BOARD_THEME_KEY, state.boardTheme);
        closeModals();
        render();
    };

    document.getElementById('theme-blue').onclick = () => {
        state.boardTheme = { light: '#d0e7ff', dark: '#4a90e2' };
        saveState(BOARD_THEME_KEY, state.boardTheme);
        closeModals();
        render();
    };

    document.getElementById('theme-gray').onclick = () => {
        state.boardTheme = { light: '#e5e5e5', dark: '#666' };
        saveState(BOARD_THEME_KEY, state.boardTheme);
        closeModals();
        render();
    };

    document.getElementById('theme-rose').onclick = () => {
        state.boardTheme = { light: '#ffd6e7', dark: '#ff8ab8' };
        saveState(BOARD_THEME_KEY, state.boardTheme);
        closeModals();
        render();
    };

    document.getElementById('theme-mauve').onclick = () => {
        state.boardTheme = { light: '#f3e8ff', dark: '#b388ff' };
        saveState(BOARD_THEME_KEY, state.boardTheme);
        closeModals();
        render();
    };

    document.getElementById('theme-wood').onclick = () => {
        state.boardTheme = { light: '#f0d9b5', dark: '#b58863' };
        saveState(BOARD_THEME_KEY, state.boardTheme);
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
  // Masquer le sélecteur de dossier en mode renommage
  const folderContainer = document.getElementById('rep-folder-container');
  if (folderContainer) folderContainer.style.display = 'none';
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

// ─── DOSSIERS ─────────────────────────────────────────────────────────────────

const FOLDERS_KEY = 'alphaChess.repFolders';

function loadFolders() {
  return loadState(FOLDERS_KEY) || {};
}

function saveFolders(folders) {
  saveState(FOLDERS_KEY, folders);
  state.repFolders = folders;
}

/**
 * Collecte toutes les variantes nommées d'un répertoire (y compris sous-variantes).
 */
function collectNamedVariants(rep) {
  const result = [];
  function walk(node) {
    if (node !== rep && node.varName) result.push(node);
    node.children.forEach(walk);
  }
  walk(rep);
  return result;
}

// ────────────────────────────────────────────────────────────────────
//  Folder right-click context menu
// ────────────────────────────────────────────────────────────────────

let _folderCtxMenuCloseHandler = null;

export function openFolderCtxMenu(event, fid, isRepFolder) {
  event.preventDefault();
  event.stopPropagation();

  const menu = document.getElementById('folder-ctx-menu');
  if (!menu) return;

  menu.dataset.fid = fid;
  menu.dataset.isRepFolder = isRepFolder ? '1' : '0';

  // Positionner le menu au curseur
  const x = event.clientX;
  const y = event.clientY;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.style.display = 'block';

  // Fermer si clic en dehors
  if (_folderCtxMenuCloseHandler) {
    document.removeEventListener('click', _folderCtxMenuCloseHandler, true);
  }
  _folderCtxMenuCloseHandler = function(e) {
    if (!menu.contains(e.target)) {
      menu.style.display = 'none';
      document.removeEventListener('click', _folderCtxMenuCloseHandler, true);
      _folderCtxMenuCloseHandler = null;
    }
  };
  // Slight delay so the current click doesn't immediately close
  setTimeout(() => document.addEventListener('click', _folderCtxMenuCloseHandler, true), 50);

  // Wire buttons (re-bind each time to avoid stale closures)
  const renameBtn = document.getElementById('folder-ctx-rename');
  const ungroupBtn = document.getElementById('folder-ctx-ungroup');
  const deleteBtn = document.getElementById('folder-ctx-delete');

  if (renameBtn) {
    renameBtn.onclick = () => {
      menu.style.display = 'none';
      openRenameFolderModal(fid, isRepFolder);
    };
  }
  if (ungroupBtn) {
    ungroupBtn.onclick = () => {
      menu.style.display = 'none';
      ungroupFolder(fid, isRepFolder);
    };
  }
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      menu.style.display = 'none';
      deleteFolderAndContents(fid, isRepFolder);
    };
  }
}

function openRenameFolderModal(fid) {
  const folders = loadFolders();
  const current = folders[fid];
  if (current === undefined) return;
  const currentName = typeof current === 'string' ? current : (current?.name || '');

  const input = document.getElementById('rename-folder-input');
  const modal = document.getElementById('modal-rename-folder');
  if (!input || !modal) return;

  input.value = currentName;
  state.modalOverlayEl.style.display = 'flex';
  modal.style.display = 'block';
  requestAnimationFrame(() => { input.focus(); input.select(); });

  // Replace buttons to clear any stale listeners from previous opens
  const saveBtn = document.getElementById('btn-rename-folder-save');
  const cancelBtn = document.getElementById('btn-rename-folder-cancel');
  const newSave = saveBtn.cloneNode(true);
  const newCancel = cancelBtn.cloneNode(true);
  saveBtn.replaceWith(newSave);
  cancelBtn.replaceWith(newCancel);

  function doSave() {
    const trimmed = input.value.trim();
    if (!trimmed) { input.focus(); return; }
    const f = loadFolders();
    f[fid] = trimmed;
    saveFolders(f);
    input.removeEventListener('keydown', onKey);
    closeModals();
    render();
  }

  function doCancel() {
    input.removeEventListener('keydown', onKey);
    closeModals();
  }

  function onKey(e) {
    if (e.key === 'Enter') doSave();
    if (e.key === 'Escape') doCancel();
  }

  newSave.addEventListener('click', doSave);
  newCancel.addEventListener('click', doCancel);
  input.addEventListener('keydown', onKey);
}

function ungroupFolder(fid, isRepFolder) {
  if (isRepFolder) {
    // Retirer le folderId de tous les répertoires du dossier
    state.repertoires.forEach(rep => {
      if (rep.folderId === fid) {
        delete rep.folderId;
        scheduleRepertoireSync(rep.id);
      }
    });
  } else {
    // Retirer le folderId de toutes les variantes du dossier
    state.repertoires.forEach(rep => {
      collectNamedVariants(rep).forEach(v => {
        if (v.folderId === fid) delete v.folderId;
      });
      scheduleRepertoireSync(rep.id);
    });
  }

  // Supprimer le dossier
  const folders = loadFolders();
  delete folders[fid];
  saveFolders(folders);
  render();
}

function deleteFolderAndContents(fid, isRepFolder) {
  const folders = loadFolders();
  const folder = folders[fid];
  const folderName = (typeof folder === 'string' ? folder : null) || fid;

  if (!window.confirm(`Supprimer le dossier "${folderName}" et tout son contenu ?`)) return;

  if (isRepFolder) {
    // Supprimer tous les répertoires dans ce dossier
    const toDelete = state.repertoires.filter(r => r.folderId === fid).map(r => r.id);
    toDelete.forEach(id => {
      const idx = state.repertoires.findIndex(r => r.id === id);
      if (idx !== -1) state.repertoires.splice(idx, 1);
      // Suppression backend
      if (state.auth?.token) {
        apiRequest(`/repertoire/${id}`, { method: 'DELETE', token: state.auth.token }).catch(() => {});
      }
    });
  } else {
    // Supprimer toutes les variantes nommées dans ce dossier
    state.repertoires.forEach(rep => {
      const varsToRemove = collectNamedVariants(rep).filter(v => v.folderId === fid);
      varsToRemove.forEach(v => {
        // Retirer le nœud de son parent
        if (v.parent) {
          const idx = v.parent.children.indexOf(v);
          if (idx !== -1) v.parent.children.splice(idx, 1);
        }
      });
      if (varsToRemove.length > 0) scheduleRepertoireSync(rep.id);
    });
  }

  delete folders[fid];
  saveFolders(folders);
  render();
}

/**
 * Ouvre la modale de groupement en dossier.
 * Pour `repertoire_item` : affiche tous les répertoires de même couleur.
 * Pour `repertoire_subitem` : affiche toutes les variantes nommées du répertoire parent.
 */
export function openFolderGroupModal() {
  hideMenus();
  const target = state.menuTarget;
  if (!target) return;

  const isRepRoot = state.contextMenuSource === 'repertoire_item';
  const folders = loadFolders();

  // Déterminer le dossier existant du nœud cible
  const existingFolderId = target.folderId || null;
  const existingFolderName = existingFolderId ? (folders[existingFolderId] || '') : '';

  // Peupler la liste d'éléments
  let items = [];
  if (isRepRoot) {
    // Tous les répertoires de même couleur
    items = state.repertoires.filter(r => r.color === target.color);
  } else {
    // Toutes les variantes nommées du répertoire parent
    let root = target;
    while (root.parent) root = root.parent;
    items = collectNamedVariants(root);
  }

  const titleEl = document.getElementById('modal-folder-title');
  if (titleEl) titleEl.textContent = isRepRoot ? '📁 Grouper des répertoires en dossier' : '📁 Grouper des variantes en dossier';

  const nameInput = document.getElementById('folder-name-input');
  if (nameInput) nameInput.value = existingFolderName;

  const listEl = document.getElementById('folder-items-list');
  if (listEl) {
    listEl.innerHTML = '';
    items.forEach(item => {
      const label = document.createElement('label');
      label.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:5px;cursor:pointer;';
      label.onmouseenter = () => { label.style.background = 'var(--hover-bg,#2a2a2a)'; };
      label.onmouseleave = () => { label.style.background = 'transparent'; };
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = item.id;
      // Pré-cocher si même dossier que la cible ou si c'est la cible elle-même
      const itemFolderId = item.folderId || null;
      cb.checked = item === target || (existingFolderId && itemFolderId === existingFolderId);
      const span = document.createElement('span');
      span.style.fontSize = '0.9em';
      span.textContent = isRepRoot ? (item.name || item.id) : (item.varName || item.san);
      label.appendChild(cb);
      label.appendChild(span);
      listEl.appendChild(label);
    });
  }

  const removeBtn = document.getElementById('btn-folder-remove');
  if (removeBtn) removeBtn.style.display = existingFolderId ? 'inline-block' : 'none';

  // Stocker le contexte pour les boutons
  const overlay = document.getElementById('modal-overlay-folder');
  if (overlay) {
    overlay.dataset.folderMode = isRepRoot ? 'rep' : 'var';
    overlay.dataset.existingFolderId = existingFolderId || '';
    overlay.style.display = 'flex';
  }

  const saveBtn = document.getElementById('btn-folder-save');
  if (saveBtn && !saveBtn.dataset.folderbound) {
    saveBtn.addEventListener('click', saveFolderGroupModal);
    saveBtn.dataset.folderbound = '1';
  }
  if (removeBtn && !removeBtn.dataset.folderbound) {
    removeBtn.addEventListener('click', removeFolderFromModal);
    removeBtn.dataset.folderbound = '1';
  }
  const cancelBtn = document.getElementById('btn-folder-cancel');
  if (cancelBtn && !cancelBtn.dataset.folderbound) {
    cancelBtn.addEventListener('click', closeFolderModal);
    cancelBtn.dataset.folderbound = '1';
  }
}

function closeFolderModal() {
  const overlay = document.getElementById('modal-overlay-folder');
  if (overlay) overlay.style.display = 'none';
}

export function saveFolderGroupModal() {
  const overlay = document.getElementById('modal-overlay-folder');
  if (!overlay) return;

  const nameInput = document.getElementById('folder-name-input');
  const folderName = nameInput ? nameInput.value.trim() : '';
  if (!folderName) {
    if (nameInput) { nameInput.style.borderColor = '#f87171'; nameInput.focus(); }
    return;
  }
  if (nameInput) nameInput.style.borderColor = '';

  const existingFolderId = overlay.dataset.existingFolderId || '';
  const folderId = existingFolderId || ('folder_' + Math.random().toString(36).substr(2, 9));

  const folders = loadFolders();
  folders[folderId] = folderName;
  saveFolders(folders);

  // Récupérer les IDs sélectionnés
  const listEl = document.getElementById('folder-items-list');
  const selectedIds = new Set(
    Array.from(listEl ? listEl.querySelectorAll('input[type=checkbox]:checked') : [])
      .map(cb => cb.value)
  );
  const allIds = new Set(
    Array.from(listEl ? listEl.querySelectorAll('input[type=checkbox]') : [])
      .map(cb => cb.value)
  );

  // Mettre à jour folderId sur les nœuds concernés
  const isRepMode = overlay.dataset.folderMode === 'rep';
  if (isRepMode) {
    state.repertoires.forEach(r => {
      if (allIds.has(r.id)) {
        if (selectedIds.has(r.id)) {
          r.folderId = folderId;
        } else if (r.folderId === folderId) {
          delete r.folderId;
        }
      }
    });
  } else {
    // Mode variantes : parcourir toutes les variantes de tous les répertoires
    state.repertoires.forEach(rep => {
      collectNamedVariants(rep).forEach(v => {
        if (allIds.has(v.id)) {
          if (selectedIds.has(v.id)) {
            v.folderId = folderId;
          } else if (v.folderId === folderId) {
            delete v.folderId;
          }
        }
      });
    });
  }

  // Déclencher la synchronisation pour chaque répertoire modifié
  if (isRepMode) {
    state.repertoires.forEach(r => {
      if (allIds.has(r.id)) scheduleRepertoireSync(r.id);
    });
  } else {
    state.repertoires.forEach(rep => {
      const varIds = new Set(collectNamedVariants(rep).map(v => v.id));
      if ([...allIds].some(id => varIds.has(id))) scheduleRepertoireSync(rep.id);
    });
  }

  closeFolderModal();
  render();
}

function removeFolderFromModal() {
  const overlay = document.getElementById('modal-overlay-folder');
  if (!overlay) return;

  const existingFolderId = overlay.dataset.existingFolderId || '';
  if (!existingFolderId) { closeFolderModal(); return; }

  // Retirer le folderId de tous les nœuds qui l'utilisent
  state.repertoires.forEach(r => {
    if (r.folderId === existingFolderId) {
      delete r.folderId;
      scheduleRepertoireSync(r.id);
    }
    collectNamedVariants(r).forEach(v => {
      if (v.folderId === existingFolderId) delete v.folderId;
    });
    scheduleRepertoireSync(r.id);
  });

  // Supprimer le dossier de la liste
  const folders = loadFolders();
  delete folders[existingFolderId];
  // Ne conserver que les dossiers encore référencés
  saveFolders(folders);

  closeFolderModal();
  render();
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
  const openInTreeEl = menu.querySelector('.opt-open-in-tree');
  const groupFolderEl = menu.querySelector('.opt-group-folder');
  const commentEl = menu.querySelector('.opt-comment');
  const deleteEl = menu.querySelector('.opt-delete');

  if (flipEl) flipEl.style.display = isMoveContext ? 'none' : 'block';
  if (renameEl) renameEl.style.display = isRepRoot ? 'block' : 'none';
  if (openInTreeEl) openInTreeEl.style.display = (isRepRoot || isRepSub) ? 'block' : 'none';
  if (groupFolderEl) groupFolderEl.style.display = (isRepRoot || isRepSub) ? 'block' : 'none';
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
  // Rafraîchir le select de dossier si la modale de création est ouverte
  const repModal = document.getElementById('modal-new-rep');
  if (repModal && repModal.style.display !== 'none') populateRepFolderSelect(color);
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

function collectTrainableTargetsCount(root) {
  if (!root) return 0;
  let count = 0;

  function walk(node) {
    if (!node) return;
    if (isTrainablePlayerNode(node)) {
      count += 1;
    }
    node.children.forEach(child => {
      if (!isInTrainingSubtree(child)) return;
      walk(child);
    });
  }

  walk(root);
  return count;
}

function getSurvivalProgressSnapshot() {
  const total = Math.max(0, state.trainingTotalTargets || 0);
  const completed = Math.min(total, state.trainingCompletedTargets?.size || 0);
  const correct = Math.min(completed, state.trainingAnswered?.size || 0);
  const mistakes = state.trainingSurvivalMistakes?.length || 0;
  const progressPercent = total > 0 ? (completed / total) * 100 : 0;

  return {
    total,
    completed,
    correct,
    mistakes,
    progressPercent,
  };
}

function getRepertoireSizeBucket(moveCount) {
  if (moveCount > 500) return 5;
  if (moveCount > 350) return 4;
  if (moveCount > 200) return 3;
  if (moveCount > 100) return 2;
  if (moveCount > 50) return 1;
  return 0;
}

function getMedalFromProgress(progressPercent, moveCount) {
  if (progressPercent < 30) {
    return { tier: 'none', shineLevel: 0 };
  }

  const shineLevel = getRepertoireSizeBucket(moveCount);

  if (progressPercent < 60) {
    return { tier: 'bronze', shineLevel };
  }

  if (progressPercent < 100) {
    return { tier: 'silver', shineLevel };
  }

  if (moveCount > 500) return { tier: 'chrome', shineLevel };
  if (moveCount > 350) return { tier: 'diamond', shineLevel };
  if (moveCount > 200) return { tier: 'platinum', shineLevel };
  return { tier: 'gold', shineLevel };
}

function getMedalLabel(tier) {
  const labels = {
    none: 'Aucune médaille',
    bronze: 'Médaille bronze',
    silver: 'Médaille argent',
    gold: 'Médaille or',
    platinum: 'Médaille platine',
    diamond: 'Médaille diamant',
    chrome: 'Médaille chromée'
  };
  return labels[tier] || 'Médaille';
}

function getMedalIcon(tier) {
  const icons = {
    none: '○',
    bronze: '🥉',
    silver: '🥈',
    gold: '🥇',
    platinum: '✦',
    diamond: '◆',
    chrome: '✦',
  };
  return icons[tier] || '🏅';
}

function getRepertoireRoot(node) {
  if (!node) return null;
  let root = node;
  while (root.parent) root = root.parent;
  return root;
}

function getNextRewardHint(completed, total, moveCount) {
  if (!total) return null;

  const progressPercent = (completed / total) * 100;
  let targetPercent = 0;
  let nextTier = 'none';

  if (progressPercent < 30) {
    targetPercent = 30;
    nextTier = 'bronze';
  } else if (progressPercent < 60) {
    targetPercent = 60;
    nextTier = 'silver';
  } else if (progressPercent < 100) {
    targetPercent = 100;
    nextTier = getMedalFromProgress(100, moveCount).tier;
  } else {
    return null;
  }

  const needed = Math.max(0, Math.ceil((targetPercent / 100) * total) - completed);
  return {
    needed,
    nextTier,
    targetPercent,
  };
}

function tryUpgradeRepertoireMedal(trainingNode, progressPercent, trainingColor) {
  if (!trainingNode || !trainingColor) return;

  // Count moves only within the training subtree (this node only, never the parent)
  const moveCount = countMoves(trainingNode, trainingColor);
  const medal = getMedalFromProgress(progressPercent, moveCount);
  if (medal.tier === 'none') return;

  const previousTier = trainingNode.trainingMedalTier || 'none';
  if ((MEDAL_RANK[medal.tier] || 0) < (MEDAL_RANK[previousTier] || 0)) {
    return;
  }

  if ((MEDAL_RANK[medal.tier] || 0) === (MEDAL_RANK[previousTier] || 0)) {
    const previousShine = Number.isFinite(trainingNode.trainingMedalShineLevel)
      ? trainingNode.trainingMedalShineLevel
      : 0;
    if (medal.shineLevel <= previousShine) return;
  }

  // Store medal ONLY on the training node, never on parents
  trainingNode.trainingMedalTier = medal.tier;
  trainingNode.trainingMedalShineLevel = medal.shineLevel;
  trainingNode.trainingMedalUpdatedAt = Date.now();

  // Trouver le répertoire racine qui contient ce nœud et le synchroniser explicitement
  // (state.currentNode peut pointer ailleurs en fin de session d'entraînement)
  let root = trainingNode;
  while (root.parent) root = root.parent;
  const repId = root.id;
  scheduleRepertoireSync(repId);
}

function getMedalDisplayMeta(rep) {
  const tier = rep.trainingMedalTier || 'none';
  const shine = Number.isFinite(rep.trainingMedalShineLevel) ? rep.trainingMedalShineLevel : 0;

  if (tier === 'none') return null;

  return {
    tier,
    shine,
    label: getMedalLabel(tier),
    icon: getMedalIcon(tier),
  };
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

// Vérifie si un nœud appartient au sous-arbre d'un nœud racine donné.
function isNodeInSubtree(node, subtreeRoot) {
  let temp = node;
  while (temp) {
    if (temp.id === subtreeRoot.id) return true;
    temp = temp.parent;
  }
  return false;
}

function collectMissingReplyNodes(root, repColor) {
  const missing = [];

  function walk(node) {
    // Nœud de transposition valide : la continuation existe via sourceNode.
    // Ne pas signaler comme réponse manquante — géré séparément.
    if (node.isTransposition && node.sourceNode) return;

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

// Collecte les nœuds de transposition dont le sourceNode est EN DEHORS du sous-arbre entraîné.
// Ces lignes transposent dans une autre variante : l'utilisateur peut choisir de les inclure ou non.
function collectOutOfScopeTranspositionNodes(root) {
  const outOfScope = [];

  function walk(node) {
    if (node.isTransposition && node.sourceNode) {
      if (!isNodeInSubtree(node.sourceNode, root)) {
        outOfScope.push(node);
      }
      return; // feuille de transposition, pas de récursion
    }
    node.children.forEach(walk);
  }

  walk(root);
  return outOfScope;
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

  const listDiv = document.createElement('div');
  listDiv.style.marginTop = '4px';

  missingNodes.forEach((n, idx) => {
    if (idx >= 3) return; // max 3 displayed
    const lineEl = document.createElement('div');
    lineEl.style.cssText = 'font-size:0.85em;color:#4a9eff;cursor:pointer;text-decoration:underline;padding:1px 0;';
    lineEl.title = 'Cliquer pour accéder à cette ligne dans l\'arbre';
    lineEl.textContent = `• ${getPathString(n) || n.san}`;
    lineEl.addEventListener('click', () => {
      // Trouver l'index du répertoire racine contenant ce nœud
      const repIdx = state.repertoires.findIndex(r => isDescendantOf(r, n) || r === n);
      if (repIdx !== -1) {
        state.activeRepIndex = repIdx;
      }
      state.currentNode = n;
      state.chess.load(n.fen);
      Object.keys(state.openPanels).forEach(k => { state.openPanels[k] = false; });
      state.openPanels.arbre = true;
      closeModals();
      render();
    });
    listDiv.appendChild(lineEl);
  });

  container.appendChild(listDiv);

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

// Section affichée dans la modale lorsqu'il existe des transpositions hors-variante.
// En mode Survie : note informative (elles sont toujours ignorées).
// Autres modes : case à cocher pour inclure ou non ces lignes.
function appendOutOfScopeTranspoSection(container, transpoNodes) {
  if (transpoNodes.length === 0) return;

  appendLineBreak(container);
  appendLineBreak(container);

  const headerLabel = document.createElement('div');
  headerLabel.style.fontSize = '0.9em';
  headerLabel.style.color = '#666';
  headerLabel.innerHTML = `<b>↔️ ${transpoNodes.length} transposition(s) vers une autre variante :</b>`;
  container.appendChild(headerLabel);

  const sample = transpoNodes.slice(0, 3)
    .map(n => `• ${getPathString(n) || n.san}`)
    .join('<br>');

  const sampleDiv = document.createElement('div');
  sampleDiv.style.fontSize = '0.85em';
  sampleDiv.style.color = '#888';
  sampleDiv.style.marginTop = '4px';
  sampleDiv.innerHTML = sample;
  container.appendChild(sampleDiv);

  if (transpoNodes.length > 3) {
    const tail = document.createElement('div');
    tail.style.fontSize = '0.85em';
    tail.style.color = '#888';
    tail.style.marginTop = '4px';
    tail.textContent = `…et ${transpoNodes.length - 3} autre(s).`;
    container.appendChild(tail);
  }

  if (pendingTrainingMode === 'survival') {
    // En Survie : toujours ignorées, juste une note
    const note = document.createElement('div');
    note.style.fontSize = '0.85em';
    note.style.color = '#999';
    note.style.marginTop = '4px';
    note.style.fontStyle = 'italic';
    note.textContent = 'Ces lignes sont ignorées en mode Survie.';
    container.appendChild(note);
  } else {
    // Autres modes : case à cocher
    const checkRow = document.createElement('label');
    checkRow.style.display = 'flex';
    checkRow.style.alignItems = 'center';
    checkRow.style.gap = '8px';
    checkRow.style.marginTop = '8px';
    checkRow.style.fontSize = '0.85em';
    checkRow.style.color = '#bbb';
    checkRow.style.cursor = 'pointer';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = pendingTrainingIncludeOutOfScope;
    checkbox.addEventListener('change', () => {
      pendingTrainingIncludeOutOfScope = checkbox.checked;
    });

    checkRow.appendChild(checkbox);
    checkRow.append('Inclure ces lignes dans l\'entraînement');
    container.appendChild(checkRow);
  }
}

function appendTrainingModeSelector(container) {
  appendLineBreak(container);
  appendLineBreak(container);

  const title = document.createElement('div');
  title.className = 'training-mode-title';
  title.textContent = 'Choisissez un mode d’entraînement :';
  container.appendChild(title);

  const survivalMeta = TRAINING_MODES.survival;
  if (survivalMeta) {
    const survivalWrap = document.createElement('div');
    survivalWrap.className = 'training-mode-survival-wrap';

    const survivalOption = document.createElement('button');
    survivalOption.type = 'button';
    survivalOption.className = 'training-mode-option training-mode-option-survival';
    survivalOption.dataset.selected = pendingTrainingMode === 'survival' ? 'true' : 'false';
    survivalOption.title = survivalMeta.description;

    const label = document.createElement('span');
    label.className = 'training-mode-option-label';
    label.textContent = survivalMeta.label;

    const description = document.createElement('span');
    description.className = 'training-mode-option-desc';
    description.textContent = survivalMeta.description;

    survivalOption.appendChild(label);
    survivalOption.appendChild(description);
    survivalOption.onclick = () => {
      pendingTrainingMode = 'survival';
      renderTrainingConfirmModal();
    };

    survivalWrap.appendChild(survivalOption);
    container.appendChild(survivalWrap);
  }

  const options = document.createElement('div');
  options.className = 'training-mode-options';

  Object.entries(TRAINING_MODES).forEach(([modeId, meta]) => {
    if (modeId === 'survival') return;

    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'training-mode-option';
    option.dataset.selected = pendingTrainingMode === modeId ? 'true' : 'false';
    option.title = meta.description;

    const label = document.createElement('span');
    label.className = 'training-mode-option-label';
    label.textContent = meta.label;

    const description = document.createElement('span');
    description.className = 'training-mode-option-desc';
    description.textContent = meta.description;

    option.appendChild(label);
    option.appendChild(description);
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
    state.trainingExpectedChildId = target.children?.[0]?.id || null;
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
  state.trainingExpectedChildId = null;

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
    const isPlayerStop = nextToPlay === state.trainingRepColor
      && !state.trainingAnswered.has(node.id)
      && !state.trainingSkippedByError.has(node.id);
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

  if (state.trainingMode === 'survival') {
    return paths[0];
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
    if (!state.trainingAnswered.has(node.id) && !state.trainingSkippedByError.has(node.id)) {
      const expectedPath = selectTrainingPath(node);
      state.trainingExpectedChildId = expectedPath?.[0]?.id || node.children?.[0]?.id || null;
      return;
    }
  }

  const selectedPath = selectTrainingPath(node);
  if (!selectedPath || selectedPath.length === 0) {
    state.trainingExpectedChildId = null;
    handleLineComplete();
    return;
  }

  const nextNode = selectedPath[0];
  state.trainingExpectedChildId = nextNode?.id || null;
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
    state.trainingExpectedChildId = null;
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
  // Transpositions hors-variante : toujours ignorées en Survie, sinon selon le choix utilisateur.
  const ignoreOutOfScope = pendingTrainingMode === 'survival' || !pendingTrainingIncludeOutOfScope;
  if (ignoreOutOfScope) {
    pendingTrainingOutOfScopeTranspos.forEach(n => state.trainingIgnoredNoReply.add(n.id));
  }
  state.trainingVisited = new Set(state.trainingIgnoredNoReply);
  state.trainingAnswered = new Set();
  state.trainingSkippedByError = new Set();
  state.trainingCompletedTargets = new Set();
  state.trainingExpectedChildId = null;
  state.trainingTotalTargets = collectTrainableTargetsCount(startNode);
  state.trainingSurvivalMaxLives = SURVIVAL_LIVES;
  state.trainingSurvivalLives = SURVIVAL_LIVES;
  state.trainingSurvivalGoldenHeart = false;
  state.trainingSurvivalMilestones = 0;
  state.trainingSurvivalMistakes = [];
  state.trainingLastSurvivalReport = null;
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
  state.trainingSkippedByError = new Set();
  state.trainingCompletedTargets = new Set();
  state.trainingExpectedChildId = null;
  state.trainingTotalTargets = 0;
  state.trainingSurvivalLives = SURVIVAL_LIVES;
  state.trainingSurvivalGoldenHeart = false;
  state.trainingSurvivalMilestones = 0;
  state.trainingSurvivalMistakes = [];
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
  pendingTrainingOutOfScopeTranspos = collectOutOfScopeTranspositionNodes(node);
  pendingTrainingIncludeOutOfScope = true; // inclure par défaut (sauf Survie, géré dans _doStartTraining)
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
  appendOutOfScopeTranspoSection(modalBody, pendingTrainingOutOfScopeTranspos);
  appendTrainingModeSelector(modalBody);
}

function showTrainingDoneModal() {
  if (state.trainingMode === 'survival') {
    showTrainingSurvivalVictoryModal();
    return;
  }

  stopTraining();
  state.modalOverlayEl.style.display = 'flex';
  document.getElementById('modal-training-done').style.display = 'block';
}

function showTrainingSurvivalVictoryModal() {
  const snapshot = getSurvivalProgressSnapshot();
  const trainingRootBeforeStop = state.trainingRoot;
  const trainingColorBeforeStop = state.trainingRepColor;
  tryUpgradeRepertoireMedal(trainingRootBeforeStop, snapshot.progressPercent, trainingColorBeforeStop);
  if (state.auth?.token && trainingRootBeforeStop?.id) {
    apiRequest('/training-stats', {
      method: 'POST',
      token: state.auth.token,
      body: { variantKey: String(trainingRootBeforeStop.id), score: snapshot.completed }
    }).catch(() => {});
  }

  const report = {
    livesLeft: state.trainingSurvivalLives,
    goldenHeart: state.trainingSurvivalGoldenHeart,
    ...snapshot,
    mistakes: (state.trainingSurvivalMistakes || []).slice(),
    startNode: trainingRootBeforeStop,
    repColor: trainingColorBeforeStop,
  };
  state.trainingLastVictoryReport = report;
  state.trainingLastSurvivalReport = report; // pour le bouton "réessayer"

  const earnedMeta = getMedalDisplayMeta(report.startNode);
  const moveCount = countMoves(report.startNode, report.repColor);

  const modalBody = document.getElementById('modal-training-victory-body');
  if (modalBody) {
    const scoreLine = `${report.completed}/${report.total}`;
    const livesHtml = (() => {
      let h = '';
      for (let i = 0; i < SURVIVAL_LIVES; i++) {
        h += i < report.livesLeft ? '♥' : '♡';
      }
      if (report.goldenHeart) h += ' <span style="color:#fbbf24;">♥</span>';
      return h;
    })();

    const earnedMedalHtml = earnedMeta
      ? `<div class="survival-earned-medal">
          <div class="rep-medal-badge tier-${earnedMeta.tier}" data-shine="${earnedMeta.shine}">${earnedMeta.icon}</div>
          <span class="survival-earned-medal-label">${earnedMeta.label}</span>
        </div>`
      : `<div class="survival-earned-medal">
          <div class="rep-medal-badge">${getMedalIcon('none')}</div>
          <span class="survival-earned-medal-label">${getMedalLabel('none')}</span>
        </div>`;

    const mistakesSummary = report.mistakes.length === 0
      ? '<div class="survival-defeat-empty">Aucune erreur — performance parfaite ! 🎯</div>'
      : `<div class="survival-defeat-empty">${report.mistakes.length} erreur${report.mistakes.length > 1 ? 's' : ''} commise${report.mistakes.length > 1 ? 's' : ''} en route.</div>`;

    modalBody.innerHTML = `
      <div class="survival-defeat-summary">
        <div class="survival-defeat-score" style="font-size:1.1em;">Score final: <b>${scoreLine}</b></div>
        <div style="font-size:1.4rem;letter-spacing:.12em;color:#fb7185;margin:4px 0;">${livesHtml}</div>
        ${earnedMedalHtml}
      </div>
      ${mistakesSummary}
    `;
  }

  stopTraining();
  state.modalOverlayEl.style.display = 'flex';
  const modal = document.getElementById('modal-training-victory');
  if (modal) modal.style.display = 'block';
}

function renderMiniBoardFromFen(fen) {
  const pieceMap = {
    p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚',
    P: '♙', R: '♖', N: '♘', B: '♗', Q: '♕', K: '♔'
  };
  const rows = (fen?.split(' ')[0] || '').split('/');
  if (rows.length !== 8) return '';

  const squares = [];
  for (let r = 0; r < 8; r += 1) {
    const row = rows[r] || '';
    for (const ch of row) {
      if (/\d/.test(ch)) {
        const emptyCount = Number(ch);
        for (let k = 0; k < emptyCount; k += 1) squares.push('');
      } else {
        squares.push(pieceMap[ch] || '');
      }
    }
  }

  // Respecter l'orientation du grand échiquier
  const displaySquares = state.boardFlipped ? squares.slice(0, 64).reverse() : squares.slice(0, 64);

  return `
    <div class="survival-mini-board">
      ${displaySquares.map((piece, idx) => {
        const rank = Math.floor(idx / 8);
        const file = idx % 8;
        const dark = (rank + file) % 2 === 1;
        return `<div class="survival-mini-square ${dark ? 'is-dark' : 'is-light'}">${piece}</div>`;
      }).join('')}
    </div>
  `;
}

function showTrainingDefeatModal() {
  if (!state.trainingActive || state.trainingMode !== 'survival') return;

  const snapshot = getSurvivalProgressSnapshot();
  const report = {
    livesLeft: state.trainingSurvivalLives,
    ...snapshot,
    mistakes: (state.trainingSurvivalMistakes || []).slice(),
    startNode: state.trainingRoot,
    repColor: state.trainingRepColor,
  };
  state.trainingLastSurvivalReport = report;

  // Upgrade medal on the exact training node (not parent)
  tryUpgradeRepertoireMedal(report.startNode, report.progressPercent, report.repColor);

  if (state.auth?.token && report.startNode?.id) {
    apiRequest('/training-stats', {
      method: 'POST',
      token: state.auth.token,
      body: { variantKey: String(report.startNode.id), score: report.completed }
    }).catch(() => {});
  }

  // Display medal from the exact training node only
  const earnedMeta = getMedalDisplayMeta(report.startNode);
  const moveCount = countMoves(report.startNode, report.repColor);
  const nextReward = getNextRewardHint(report.completed, report.total, moveCount);

  const modalBody = document.getElementById('modal-training-defeat-body');
  if (modalBody) {
    const mistakesHtml = report.mistakes.length === 0
      ? '<div class="survival-defeat-empty">Aucune erreur enregistrée.</div>'
      : report.mistakes.map((entry, index) => `
          <div class="survival-mistake-card">
            <div class="survival-mistake-head">Erreur ${index + 1} · ${entry.path || 'Position'}</div>
            <div class="survival-mistake-moves">
              <span>Joué: <b>${entry.playedSan}</b></span>
              <span>Attendu: <b>${entry.expectedSan}</b></span>
            </div>
            ${renderMiniBoardFromFen(entry.fen)}
          </div>
        `).join('');

    const scoreLine = report.total > 0
      ? `${report.completed}/${report.total}`
      : '0/0';
    const earnedMedalHtml = earnedMeta
      ? `<div class="survival-earned-medal">
          <div class="rep-medal-badge tier-${earnedMeta.tier}" data-shine="${earnedMeta.shine}">${earnedMeta.icon}</div>
          <span class="survival-earned-medal-label">${earnedMeta.label}</span>
        </div>`
      : `<div class="survival-earned-medal">
          <div class="rep-medal-badge">${getMedalIcon('none')}</div>
          <span class="survival-earned-medal-label">${getMedalLabel('none')}</span>
        </div>`;

    const nextRewardHtml = nextReward
      ? `Réussissez <b>${nextReward.needed}</b> coups de plus pour déverouiller la prochaine récompense.`
      : 'Objectif maximal atteint.';

    modalBody.innerHTML = `
      <div class="survival-defeat-summary">
        <div class="survival-defeat-score">Score final: <b>${scoreLine}</b></div>
        ${earnedMedalHtml}
        <div class="survival-next-reward--compact">${nextRewardHtml}</div>
      </div>
      <div class="survival-defeat-list">${mistakesHtml}</div>
    `;
  }

  stopTraining();
  state.modalOverlayEl.style.display = 'flex';
  const modal = document.getElementById('modal-training-defeat');
  if (modal) modal.style.display = 'block';
}

export function showStopTrainingModal() {
  document.getElementById('modal-overlay').style.display = 'flex';
  document.getElementById('modal-training-stop').style.display = 'block';
}

export function openMedalsModal() {
  const overlay = document.getElementById('modal-overlay');
  const modal = document.getElementById('modal-medals');
  if (!overlay || !modal) return;
  overlay.style.display = 'flex';
  modal.style.display = 'block';
}

export function confirmStartTraining() { closeModals(); _doStartTraining(); }
export function cancelStartTraining() { closeModals(); }
export function confirmStopTraining() { stopTraining(); closeModals(); }
export function cancelStopTraining() { closeModals(); }
export function closeTrainingDone() { stopTraining(); closeModals(); }
export function retrySurvivalTraining() {
  const report = state.trainingLastSurvivalReport;
  if (!report?.startNode) {
    closeModals();
    return;
  }

  pendingTrainingNode = report.startNode;
  pendingTrainingColor = report.repColor;
  pendingTrainingMode = 'survival';
  pendingTrainingMissingNodes = collectMissingReplyNodes(report.startNode, report.repColor);
  closeModals();
  _doStartTraining();
}
export function abandonSurvivalTraining() { closeModals(); }
export function abandonSurvivalVictory() { closeModals(); }
export function retrySurvivalVictory() {
  const report = state.trainingLastVictoryReport;
  if (!report?.startNode) { closeModals(); return; }
  pendingTrainingNode = report.startNode;
  pendingTrainingColor = report.repColor;
  pendingTrainingMode = 'survival';
  pendingTrainingMissingNodes = collectMissingReplyNodes(report.startNode, report.repColor);
  closeModals();
  _doStartTraining();
}
export function confirmTrainingInterrupt() {
  const action = pendingTrainingInterruptAction;
  pendingTrainingInterruptAction = null;
  stopTraining();
  closeModals();
  if (typeof action === 'function') action();
}
export function cancelTrainingInterrupt() { closeModals(); }

function renderRepertoireList(container) {
  const savedOrder = loadState('rep-display-order');
  if (savedOrder && Array.isArray(savedOrder)) {
    state.repertoires.sort((a, b) => {
      const ia = savedOrder.indexOf(a.id);
      const ib = savedOrder.indexOf(b.id);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }
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
    if (state.trainingActive) return;
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

  // Drop zone at top of section so items can be moved to first position
  const sectionColor = key === 'white' ? 'w' : 'b';
  function makeDropZone(insertBeforeId) {
    const dz = document.createElement('div');
    dz.className = 'rep-drop-zone';
    dz.addEventListener('dragover', e => {
      if (!currentDragColor || currentDragColor !== sectionColor) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      dz.classList.add('active');
    });
    dz.addEventListener('dragleave', e => {
      if (!dz.contains(e.relatedTarget)) dz.classList.remove('active');
    });
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.classList.remove('active');
      const fromId = e.dataTransfer.getData('text/plain');
      if (!fromId || fromId === insertBeforeId) return;
      const fromIdx = state.repertoires.findIndex(r => r.id === fromId);
      if (fromIdx === -1 || state.repertoires[fromIdx].color !== sectionColor) return;
      const activeRepId = state.repertoires[state.activeRepIndex]?.id ?? null;
      const moved = state.repertoires.splice(fromIdx, 1)[0];
      let insertAt;
      if (insertBeforeId) {
        insertAt = state.repertoires.findIndex(r => r.id === insertBeforeId);
        if (insertAt === -1) insertAt = state.repertoires.length;
      } else {
        insertAt = state.repertoires.reduce((acc, r, i) => r.color === sectionColor ? i + 1 : acc, 0);
      }
      state.repertoires.splice(insertAt, 0, moved);
      if (activeRepId != null) state.activeRepIndex = state.repertoires.findIndex(r => r.id === activeRepId);
      saveRepOrder();
      render();
    });
    return dz;
  }

  // ── Construction des éléments répertoire ──────────────────────────────
  // On construit d'abord les wraps, puis on les regroupe par dossier.
  const builtItems = items.map(({ rep, index }) => {
    const wrap = document.createElement('div');
    wrap.className = 'rep-item-wrapper';
    const repHeader = document.createElement('div');
    repHeader.className = 'rep-header';
    if (state.activeRepIndex === index) wrap.classList.add('active');
    const repRow = document.createElement('div');
    repRow.className = 'rep-row';
    if (hasNamedDescendants(rep)) {
      repRow.appendChild(makeRepToggle(rep.id));
    }
    const repNameEl = document.createElement('b');
    repNameEl.style.cssText = 'flex:1;min-width:0;';
    const repAnnotStyle = ANNOTATION_STYLE[rep.varAnnotation] || null;
    repNameEl.innerHTML = `${rep.name}${rep.varAnnotation ? ` <span class="annotation-tag"${repAnnotStyle ? ` style="color:${repAnnotStyle.color}"` : ''}>${rep.varAnnotation}</span>` : ''}`;  
    repRow.appendChild(repNameEl);

    const medalMeta = getMedalDisplayMeta(rep);
    if (medalMeta) {
      const medalEl = document.createElement('div');
      medalEl.className = `rep-medal-badge tier-${medalMeta.tier}`;
      medalEl.dataset.shine = String(medalMeta.shine);
      medalEl.title = `${medalMeta.label} · niveau ${medalMeta.shine + 1}`;
      medalEl.textContent = medalMeta.icon;
      repRow.appendChild(medalEl);
    }

    repHeader.appendChild(repRow);

    const repTrainRow = document.createElement('div');
    repTrainRow.className = 'rep-train-row';
    const repMoveCount = countMoves(rep, rep.color);
    const repTrainBtn = document.createElement('button');
    repTrainBtn.className = 'train-btn';
    repTrainBtn.textContent = `S'entraîner (${repMoveCount} coups)`;
    repTrainBtn.onclick = e => { e.stopPropagation(); showTrainingConfirmModal(rep, rep.color); };
    repTrainRow.appendChild(repTrainBtn);
    repHeader.appendChild(repTrainRow);
    repHeader.onclick = e => {
      e.stopPropagation();
      if (state.trainingActive) return;
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

    // ── Render one named variant item ─────────────────────────────────
    function renderVariantItem(child, d) {
      const item = document.createElement('div');
      item.className = `sub-var-item ${state.currentNode.id === child.id ? 'active' : ''}`;
      item.style.marginLeft = d * 15 + 'px';
      const subVarMain = document.createElement('div');
      subVarMain.className = 'sub-var-main';
      if (hasNamedDescendants(child)) {
        subVarMain.appendChild(makeRepToggle(child.id));
      }
      const nameSpan = document.createElement('span');
      nameSpan.style.cssText = 'flex:1;min-width:0;';
      const childAnnotStyle = ANNOTATION_STYLE[child.varAnnotation] || null;
      nameSpan.innerHTML = `${child.varName}${child.varAnnotation ? ` <span class="annotation-tag"${childAnnotStyle ? ` style="color:${childAnnotStyle.color}"` : ''}>${child.varAnnotation}</span>` : ''}`;
      subVarMain.appendChild(nameSpan);
      const childMedalMeta = getMedalDisplayMeta(child);
      if (childMedalMeta) {
        const childMedalEl = document.createElement('div');
        childMedalEl.className = `rep-medal-badge tier-${childMedalMeta.tier}`;
        childMedalEl.dataset.shine = String(childMedalMeta.shine);
        childMedalEl.title = `${childMedalMeta.label} · niveau ${childMedalMeta.shine + 1}`;
        childMedalEl.textContent = childMedalMeta.icon;
        subVarMain.appendChild(childMedalEl);
      }
      item.appendChild(subVarMain);
      const moveCount = countMoves(child, rep.color);
      const trainBtn = document.createElement('button');
      trainBtn.className = 'train-btn';
      trainBtn.textContent = `S'entraîner (${moveCount} coups)`;
      trainBtn.onclick = e => { e.stopPropagation(); showTrainingConfirmModal(child, rep.color); };
      item.appendChild(trainBtn);
      item.onclick = e => {
        e.stopPropagation();
        if (state.trainingActive) return;
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
        buildSubVarTree(child, d + 1, new Set());
      }
    }

    // ── Walk sub-variant tree, grouping by folderId ───────────────────
    function buildSubVarTree(node, depth = 0, processedFolderIds = new Set()) {
      const folders = loadFolders();
      node.children.forEach(child => {
        if (!child.varName) {
          buildSubVarTree(child, depth, processedFolderIds);
          return;
        }

        const fid = child.folderId || null;
        const hasFolderDef = fid && folders[fid];

        if (!hasFolderDef) {
          renderVariantItem(child, depth);
          return;
        }

        // Folder: render once on first encounter
        if (processedFolderIds.has(fid)) return;
        processedFolderIds.add(fid);

        // All direct siblings belonging to this folder
        const members = node.children.filter(c => c.varName && c.folderId === fid);
        const folderKey = '__var_folder__' + fid;
        const folderOpen = state.repExpanded.has(folderKey + '__open')
          || !state.repExpanded.has(folderKey + '__closed');

        // Folder header — styled exactly like a sub-var-item
        const folderItem = document.createElement('div');
        folderItem.className = 'sub-var-item';
        folderItem.style.marginLeft = depth * 15 + 'px';
        folderItem.style.cursor = 'default';

        const folderMain = document.createElement('div');
        folderMain.className = 'sub-var-main';

        const toggle = document.createElement('div');
        toggle.className = 'tree-toggle';
        toggle.textContent = folderOpen ? '−' : '+';
        toggle.onclick = e => {
          e.stopPropagation();
          if (folderOpen) {
            state.repExpanded.add(folderKey + '__closed');
            state.repExpanded.delete(folderKey + '__open');
          } else {
            state.repExpanded.delete(folderKey + '__closed');
            state.repExpanded.add(folderKey + '__open');
          }
          render();
        };
        folderMain.appendChild(toggle);

        const nameSpan = document.createElement('span');
        nameSpan.style.cssText = 'flex:1;min-width:0;';
        nameSpan.textContent = '📁 ' + folders[fid];
        folderMain.appendChild(nameSpan);

        folderItem.appendChild(folderMain);
        subContainer.appendChild(folderItem);
        folderItem.onclick = e => {
          e.stopPropagation();
          if (folderOpen) {
            state.repExpanded.add(folderKey + '__closed');
            state.repExpanded.delete(folderKey + '__open');
          } else {
            state.repExpanded.delete(folderKey + '__closed');
            state.repExpanded.add(folderKey + '__open');
          }
          render();
        };
        folderItem.oncontextmenu = e => openFolderCtxMenu(e, fid, false);

        if (folderOpen) {
          members.forEach(m => renderVariantItem(m, depth + 1));
        }
      });
    }

    buildSubVarTree(rep);
    if (subContainer.children.length > 0 && state.repExpanded.has(rep.id)) {
      wrap.appendChild(subContainer);
    }

    // Drag-to-reorder: hold anywhere on the card (excluding interactive elements)
    wrap.dataset.repId = rep.id;
    wrap.addEventListener('mousedown', e => {
      if (e.target.closest('button, .tree-toggle, .rep-medal-badge, a')) return;
      wrap.draggable = true;
    });
    wrap.addEventListener('mouseup', () => { wrap.draggable = false; });
    wrap.addEventListener('dragstart', e => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', rep.id);
      currentDragColor = rep.color;
      setTimeout(() => wrap.classList.add('rep-dragging'), 0);
    });
    wrap.addEventListener('dragend', () => {
      wrap.draggable = false;
      currentDragColor = null;
      wrap.classList.remove('rep-dragging');
      content.querySelectorAll('.rep-drop-zone').forEach(el => el.classList.remove('active'));
    });

    return { rep, index, wrap };
  });

  // ── Groupement par dossier et insertion dans content ──────────────────
  const folders = loadFolders();
  const renderedFolderIds = new Set();

  builtItems.forEach(({ rep, index, wrap }) => {
    const fid = rep.folderId || null;

    if (!fid || !folders[fid]) {
      // Pas de dossier : insertion directe
      content.appendChild(makeDropZone(rep.id));
      content.appendChild(wrap);
      return;
    }

    // Dossier : créer le conteneur la première fois qu'on rencontre ce folderId
    if (!renderedFolderIds.has(fid)) {
      renderedFolderIds.add(fid);

      // Tous les wraps appartenant à ce dossier (dans l'ordre de builtItems)
      const folderWraps = builtItems.filter(b => b.rep.folderId === fid);
      const folderEl = document.createElement('div');
      folderEl.className = 'rep-folder';

      const folderHeader = document.createElement('div');
      folderHeader.className = 'rep-folder-header';
      const isExpanded = !state.repExpanded.has('__folder__' + fid) === false
        || state.repExpanded.has('__folder__' + fid);
      // Par défaut, les dossiers sont ouverts
      const folderOpen = state.repExpanded.has('__folder__' + fid + '__open')
        || !state.repExpanded.has('__folder__' + fid + '__closed');

      const folderToggle = document.createElement('span');
      folderToggle.className = 'folder-toggle';
      folderToggle.textContent = folderOpen ? '▼' : '▶';
      folderToggle.style.cssText = 'margin-right:6px;font-size:.75em;';

      const folderIcon = document.createElement('span');
      folderIcon.textContent = '📁 ';

      const folderName = document.createElement('span');
      folderName.textContent = folders[fid];
      folderName.style.fontWeight = '600';

      const folderCount = document.createElement('span');
      folderCount.style.cssText = 'margin-left:6px;font-size:.8em;color:var(--text-muted,#aaa);';
      folderCount.textContent = `(${folderWraps.length})`;

      folderHeader.appendChild(folderToggle);
      folderHeader.appendChild(folderIcon);
      folderHeader.appendChild(folderName);
      folderHeader.appendChild(folderCount);
      folderHeader.style.cssText = 'display:flex;align-items:center;padding:6px 8px;cursor:pointer;border-radius:6px;';
      folderHeader.onmouseenter = () => { folderHeader.style.background = 'var(--hover-bg,#2a2a2a)'; };
      folderHeader.onmouseleave = () => { folderHeader.style.background = 'transparent'; };
      folderHeader.onclick = () => {
        if (folderOpen) {
          state.repExpanded.add('__folder__' + fid + '__closed');
          state.repExpanded.delete('__folder__' + fid + '__open');
        } else {
          state.repExpanded.delete('__folder__' + fid + '__closed');
          state.repExpanded.add('__folder__' + fid + '__open');
        }
        render();
      };
      folderHeader.oncontextmenu = (e) => openFolderCtxMenu(e, fid, true);

      const folderBody = document.createElement('div');
      folderBody.style.display = folderOpen ? 'block' : 'none';
      folderBody.className = 'rep-folder-body';

      folderWraps.forEach(b => {
        folderBody.appendChild(makeDropZone(b.rep.id));
        folderBody.appendChild(b.wrap);
      });
      folderBody.appendChild(makeDropZone(null));

      folderEl.appendChild(folderHeader);
      folderEl.appendChild(folderBody);
      content.appendChild(folderEl);
    }
    // Si déjà rendu dans un dossier, ne rien faire (déjà ajouté)
  });

  content.appendChild(makeDropZone(null));

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

function renderSurvivalMonitorPanel(container) {
  const snapshot = getSurvivalProgressSnapshot();
  const lives = Math.max(0, state.trainingSurvivalLives || 0);
  const hasGolden = !!state.trainingSurvivalGoldenHeart;
  const progressValue = Math.min(100, Math.max(0, snapshot.progressPercent));
  const progressText = `${Math.round(snapshot.progressPercent)}%`;

  // Construire les spans de cœurs individuels
  let heartsHtml = '';
  for (let i = 0; i < SURVIVAL_LIVES; i++) {
    if (i < lives) {
      heartsHtml += '<span class="survival-heart">♥</span>';
    } else {
      heartsHtml += '<span class="survival-heart is-empty">♡</span>';
    }
  }
  if (hasGolden) {
    heartsHtml += ' <span class="survival-heart is-golden">♥</span>';
  }

  // Indice de progression vers la prochaine vie bonus
  const correct = snapshot.correct || 0;
  const nextMilestone = (state.trainingSurvivalMilestones + 1) * SURVIVAL_LIFE_BONUS_INTERVAL;
  const untilBonus = nextMilestone - correct;
  const bonusHint = (lives < SURVIVAL_LIVES || !hasGolden)
    ? `<div class="survival-monitor-row" style="font-size:.7rem;color:var(--text-muted,#aaa);">Prochain ♥ dans <b>${untilBonus}</b> coup${untilBonus > 1 ? 's' : ''}</div>`
    : '';

  container.innerHTML = `
    <div class="survival-monitor-card">
      <div class="survival-monitor-lives">Vies: <span class="survival-monitor-hearts">${heartsHtml}</span></div>
      ${bonusHint}
      <div class="survival-monitor-row">
        <span>Progression</span>
        <strong>${progressText}</strong>
      </div>
      <div class="survival-progress-track">
        <div class="survival-progress-fill" style="width:${progressValue}%"></div>
      </div>
    </div>
  `;
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

/* ========== NAVIGATION ENTRE VUES ========== */

/**
 * Affiche une vue applicative et cache toutes les autres.
 * @param {string} viewId - l'id HTML de la vue à afficher ('view-home' | 'view-app')
 */
export function showView(viewId) {
  document.querySelectorAll('.app-view').forEach(v => {
    v.classList.toggle('hidden', v.id !== viewId);
  });
}

/** Affiche la page d'accueil (landing page). */
export function showHomeView() {
  showView('view-home');
}

/** Affiche l'interface principale et force un render. */
export function showAppView() {
  showView('view-app');
  render();
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
    // Succès — fermer le splash, rester sur la vue courante
    hideSplashScreen();
    render();
  }
}

export function confirmGuestMode() {
  initExampleData();
  closeModals();
  hideSplashScreen();
  showHomeView();
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

  const userPanel  = document.getElementById('top-account-user');
  const guestPanel = document.getElementById('top-account-guest');

  if (state.auth.user) {
    // ── Utilisateur connecté ──────────────────────────────────────
    const avatarEl = document.getElementById('top-account-avatar');
    const nameEl   = document.getElementById('top-account-name');
    const statusEl = document.getElementById('top-account-status');

    if (avatarEl) {
      avatarEl.textContent = state.auth.user.username
        ? state.auth.user.username.substring(0, 2).toUpperCase()
        : 'US';
    }
    if (nameEl)   nameEl.textContent   = state.auth.user.username || 'Utilisateur';
    if (statusEl) statusEl.textContent = 'Connecté';

    if (userPanel)  userPanel.style.display  = 'flex';
    if (guestPanel) guestPanel.style.display = 'none';

    topAccountEl.onclick = () => openProfileModal();
  } else {
    // ── Mode invité / non connecté ────────────────────────────────
    if (userPanel)  userPanel.style.display  = 'none';
    if (guestPanel) guestPanel.style.display = 'flex';

    topAccountEl.onclick = () => openAuthModal();
  }
}

/* ========== MODALE AUTH (non connecté) ========== */

/** Ouvre la modale d'authentification sur le panneau de bienvenue. */
export function openAuthModal() {
  showAuthPanel('welcome');
  document.getElementById('auth-error').textContent = '';
  document.getElementById('auth-username-input').value = '';
  document.getElementById('auth-email-input').value = '';
  document.getElementById('auth-password-input').value = '';

  document.getElementById('modal-overlay').style.display = 'flex';
  document.getElementById('modal-auth').style.display = 'block';
}

export function closeAuthModal() {
  const modal = document.getElementById('modal-auth');
  if (modal) modal.style.display = 'none';
  const overlay = document.getElementById('modal-overlay');
  if (overlay) {
    const anyVisible = Array.from(overlay.querySelectorAll('.modal-box'))
      .some(m => m.style.display !== 'none' && m.id !== 'modal-auth');
    if (!anyVisible) overlay.style.display = 'none';
  }
}

/**
 * Bascule l'affichage interne de la modale auth.
 * @param {'welcome'|'login'|'signup'|'guest'} panel
 */
export function showAuthPanel(panel) {
  const welcome = document.getElementById('auth-panel-welcome');
  const form    = document.getElementById('auth-panel-form');
  const guest   = document.getElementById('auth-panel-guest');

  if (welcome) welcome.style.display = panel === 'welcome' ? 'block' : 'none';
  if (form)    form.style.display    = (panel === 'login' || panel === 'signup') ? 'block' : 'none';
  if (guest)   guest.style.display   = panel === 'guest' ? 'block' : 'none';

  if (panel === 'login' || panel === 'signup') {
    const isSignup = panel === 'signup';
    const loginTab   = document.getElementById('auth-tab-login');
    const signupTab  = document.getElementById('auth-tab-signup');
    const usernameRow = document.getElementById('auth-username-row');
    const emailRow    = document.getElementById('auth-email-row');
    const submitBtn   = document.getElementById('auth-submit-btn');
    const pwdInput    = document.getElementById('auth-password-input');

    if (loginTab)    loginTab.classList.toggle('active', !isSignup);
    if (signupTab)   signupTab.classList.toggle('active', isSignup);
    if (usernameRow) usernameRow.style.display = isSignup ? 'block' : 'none';
    if (emailRow)    emailRow.style.display    = isSignup ? 'none' : 'block';
    if (submitBtn)   submitBtn.textContent = isSignup ? 'Créer le compte' : 'Se connecter';
    if (pwdInput)    pwdInput.setAttribute('autocomplete', isSignup ? 'new-password' : 'current-password');

    const errorEl = document.getElementById('auth-error');
    if (errorEl) errorEl.textContent = '';
  }
}

export async function submitAuthForm() {
  const loginTab  = document.getElementById('auth-tab-login');
  const isSignup  = loginTab && !loginTab.classList.contains('active');
  const username  = document.getElementById('auth-username-input')?.value.trim() || '';
  const email     = document.getElementById('auth-email-input')?.value.trim()    || '';
  const password  = document.getElementById('auth-password-input')?.value        || '';
  const errorEl   = document.getElementById('auth-error');
  const submitBtn = document.getElementById('auth-submit-btn');

  errorEl.textContent = '';

  if (isSignup) {
    if (!username || !password) { errorEl.textContent = 'Remplissez tous les champs.'; return; }
    if (password.length < 8)   { errorEl.textContent = 'Mot de passe : 8 caractères minimum.'; return; }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Chargement…';
    await signupWithCredentials({ username, password });
    submitBtn.disabled = false;
    submitBtn.textContent = 'Créer le compte';
  } else {
    if (!email || !password) { errorEl.textContent = 'Email/pseudo et mot de passe requis.'; return; }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Chargement…';
    await loginWithCredentials({ email, password });
    submitBtn.disabled = false;
    submitBtn.textContent = 'Se connecter';
  }

  if (state.auth.error) {
    errorEl.textContent = state.auth.error;
  } else if (state.auth.user) {
    // Rester sur la vue courante, juste fermer la modale
    closeAuthModal();
    render();
  }
}

export function confirmAuthGuest() {
  initExampleData();
  closeAuthModal();
  showHomeView();
  render();
}

export async function logoutAccount() {
  await logoutSession();
  // Rediriger vers l'accueil seulement si la déconnexion a réussi (état effacé)
  if (!state.auth.user) {
    closeModals();
    showHomeView();
  }
}

/* ========== MODALE PROFIL / PARAMÈTRES ========== */

/** Ouvre la modale profil et pré-remplit les champs avec les données du compte. */
export function openProfileModal() {
  const user = state.auth.user;
  if (!user) return;

  const usernameInput = document.getElementById('profile-username-input');
  const emailInput    = document.getElementById('profile-email-input');
  const pwdCurrent    = document.getElementById('profile-password-current');
  const pwdNew        = document.getElementById('profile-password-new');
  const msgEl         = document.getElementById('profile-account-message');

  if (usernameInput) usernameInput.value = user.username || '';
  if (emailInput)    emailInput.value    = user.email    || '';
  if (pwdCurrent)    pwdCurrent.value    = '';
  if (pwdNew)        pwdNew.value        = '';
  if (msgEl)         msgEl.textContent   = '';

  // Toujours ouvrir sur l'onglet Paramètres
  switchProfileTab('settings');

  document.getElementById('modal-overlay').style.display = 'flex';
  document.getElementById('modal-profile').style.display = 'block';
}

export function closeProfileModal() {
  const modal = document.getElementById('modal-profile');
  if (modal) modal.style.display = 'none';
  const overlay = document.getElementById('modal-overlay');
  // Ne fermer l'overlay que si aucune autre modale n'est ouverte
  if (overlay) {
    const anyVisible = Array.from(overlay.querySelectorAll('.modal-box'))
      .some(m => m.style.display !== 'none' && m.id !== 'modal-profile');
    if (!anyVisible) overlay.style.display = 'none';
  }
}

/** Bascule entre les onglets 'settings' et 'stats' de la modale profil. */
export function switchProfileTab(tab) {
  document.querySelectorAll('.profile-tab').forEach(t => {
    t.classList.toggle('active', t.getAttribute('data-profile-tab') === tab);
  });
  const settingsEl = document.getElementById('profile-tab-settings');
  const statsEl    = document.getElementById('profile-tab-stats');
  if (settingsEl) settingsEl.classList.toggle('hidden', tab !== 'settings');
  if (statsEl)    statsEl.classList.toggle('hidden', tab !== 'stats');
}

export function saveProfileUsername() {
  const msgEl = document.getElementById('profile-account-message');
  if (msgEl) {
    msgEl.style.color = 'var(--text-muted)';
    msgEl.textContent = 'Modification du pseudo disponible prochainement.';
  }
}

export function saveProfileEmail() {
  const msgEl = document.getElementById('profile-account-message');
  if (msgEl) {
    msgEl.style.color = 'var(--text-muted)';
    msgEl.textContent = "Association d'e-mail disponible prochainement.";
  }
}

export function saveProfilePassword() {
  const msgEl = document.getElementById('profile-account-message');
  if (msgEl) {
    msgEl.style.color = 'var(--text-muted)';
    msgEl.textContent = 'Modification du mot de passe disponible prochainement.';
  }
}

/* ========== MODALE ENTRAÎNEMENT DEPUIS L'ACCUEIL ========== */

// État interne de la modale home-training
let _htrRepIndex = null;   // index dans state.repertoires
let _htrMode = 'vertical'; // mode sélectionné

/**
 * Ouvre la modale "lancer un entraînement" depuis la page d'accueil.
 * Construit dynamiquement la liste des répertoires et le sélecteur de mode.
 */
export function openHomeTrainingModal() {
  state.dynamicModals.innerHTML = '';
  state.modalOverlayEl.style.display = 'flex';

  // Pré-sélection : dernier répertoire actif (si valide) ou le premier disponible
  const activeIdx = state.activeRepIndex;
  _htrRepIndex = state.repertoires.length > 0
    ? (Number.isInteger(activeIdx) && activeIdx >= 0 && activeIdx < state.repertoires.length ? activeIdx : 0)
    : null;
  _htrMode = pendingTrainingMode || 'vertical';

  const modal = document.createElement('div');
  modal.className = 'modal-box modal-home-training';
  modal.style.display = 'block';
  modal.onclick = (e) => e.stopPropagation();

  state.dynamicModals.appendChild(modal);
  _renderHomeTrainingModal(modal);
}

function _renderHomeTrainingModal(modal) {
  modal.innerHTML = '';

  // ── Titre ──
  const h3 = document.createElement('h3');
  h3.textContent = 'Lancer un entraînement';
  modal.appendChild(h3);

  // ── Liste des répertoires ──
  const repLabel = document.createElement('div');
  repLabel.className = 'htr-section-label';
  repLabel.style.marginTop = '18px';
  repLabel.textContent = 'Choisir un répertoire';
  modal.appendChild(repLabel);

  if (state.repertoires.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'htr-status-msg';
    empty.textContent = 'Aucun répertoire — créez-en un d\'abord depuis l\'éditeur.';
    modal.appendChild(empty);
  } else {
    const repList = document.createElement('div');
    repList.className = 'htr-rep-list';

    state.repertoires.forEach((rep, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'htr-rep-btn';
      btn.dataset.selected = idx === _htrRepIndex ? 'true' : 'false';

      const dot = document.createElement('span');
      dot.className = `htr-rep-color-dot htr-rep-color-dot--${rep.color || 'w'}`;

      const name = document.createElement('span');
      name.textContent = rep.name || `Répertoire ${idx + 1}`;

      btn.appendChild(dot);
      btn.appendChild(name);
      btn.onclick = () => {
        _htrRepIndex = idx;
        _renderHomeTrainingModal(modal);
      };
      repList.appendChild(btn);
    });

    modal.appendChild(repList);
  }

  // ── Sélecteur de mode ──
  const modeLabel = document.createElement('div');
  modeLabel.className = 'htr-section-label';
  modeLabel.textContent = 'Mode d\'entraînement';
  modal.appendChild(modeLabel);

  const grid = document.createElement('div');
  grid.className = 'htr-modes-grid';

  // Survie en premier (pleine largeur)
  const survivalBtn = _buildHtrModeBtn('survival', TRAINING_MODES.survival, modal);
  survivalBtn.classList.add('htr-mode-survival');
  grid.appendChild(survivalBtn);

  // Autres modes
  Object.entries(TRAINING_MODES).forEach(([modeId, meta]) => {
    if (modeId === 'survival') return;
    grid.appendChild(_buildHtrModeBtn(modeId, meta, modal));
  });

  modal.appendChild(grid);

  // ── Actions ──
  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  actions.style.marginTop = '4px';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'ctrl-btn';
  cancelBtn.textContent = 'Annuler';
  cancelBtn.onclick = () => closeModals();

  const startBtn = document.createElement('button');
  startBtn.className = 'ctrl-btn';
  startBtn.textContent = 'Démarrer →';
  startBtn.disabled = _htrRepIndex === null;
  startBtn.onclick = () => _launchHomeTraining();

  actions.appendChild(cancelBtn);
  actions.appendChild(startBtn);
  modal.appendChild(actions);
}

function _buildHtrModeBtn(modeId, meta, modal) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'htr-mode-btn';
  btn.dataset.selected = _htrMode === modeId ? 'true' : 'false';

  const nameEl = document.createElement('span');
  nameEl.className = 'htr-mode-name';
  nameEl.textContent = meta.label;

  const descEl = document.createElement('span');
  descEl.className = 'htr-mode-desc';
  descEl.textContent = meta.description;

  btn.appendChild(nameEl);
  btn.appendChild(descEl);
  btn.onclick = () => {
    _htrMode = modeId;
    _renderHomeTrainingModal(modal);
  };
  return btn;
}

function _launchHomeTraining() {
  if (_htrRepIndex === null || !state.repertoires[_htrRepIndex]) return;

  const rep = state.repertoires[_htrRepIndex];
  const repColor = rep.color || 'w';
  // Le répertoire est lui-même le nœud racine (pas de propriété .root)
  const rootNode = rep;

  // Configurer les variables de l'entraînement en attente
  pendingTrainingNode = rootNode;
  pendingTrainingColor = repColor;
  pendingTrainingMissingNodes = collectMissingReplyNodes(rootNode, repColor);
  pendingTrainingMode = _htrMode;

  closeModals();
  showAppView();
  _doStartTraining();
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

// Hide tooltip on any scroll or click outside
if (!document.body.dataset.tooltipsafetybound) {
  document.addEventListener('scroll', hideCurrentTooltip, { capture: true, passive: true });
  document.addEventListener('click', () => {
    if (currentTooltip) hideCurrentTooltip();
  }, { capture: false, passive: true });
  document.body.dataset.tooltipsafetybound = '1';
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
    
    let html = '<div style="display:grid; grid-template-columns:repeat(8,24px); grid-template-rows:repeat(8,24px); gap:0; background:#000; padding:1px; margin:4px 0; overflow:hidden; width:194px; height:194px;">';
    
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const isLight = (r + c) % 2 === 0;
        const bg = isLight ? lightSquare : darkSquare;
        // Respecter l'orientation du grand échiquier
        const row = state.boardFlipped ? 7 - r : r;
        const col = state.boardFlipped ? 7 - c : c;
        const piece = board[row][col];
        const sq = String.fromCharCode(97 + col) + (8 - row);
        
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
