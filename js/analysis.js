import { state } from './state.js';
import { eventBus } from './events.js';
import { getMoveTotalGames, getMoveWinRate, getMoveEnginePreference } from './statsUtils.js';

const SF_CDN = 'https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js';
const ANALYSIS_DEBOUNCE_MS = 200;
const STATS_ELO_MIN = 0;
const STATS_ELO_MAX = 3000;
const DEFAULT_ANNOT_DEPTH = 8;
const ANNOT_MAX_MOVES = 15;
const ANNOT_DEFAULT_VISIBLE = 5;
const ANNOT_DELAY_BASE_MS = 350;
const ANNOT_DELAY_PER_DEPTH_MS = 110;
const ANNOT_DELAY_PER_MOVE_MS = 90;
const ANNOT_DELAY_MAX_MS = 4500;

let engine = null;
let engineReady = false;
let engineLoading = false;
let analysisTimer = null;
let lastAnalyzedFen = '';

const pvMap = {};

let annotCurrentResolve = null;
let annotLastInfoCp = null;
let annotLastInfoPv = null;
let annotAborted = false;
let annotatingForFen = '';
let annotatingForDepth = 0;
let annotatingForCount = 0;
let annotatingForVisibleKey = '';
let annotationRenderQueued = false;
const pendingReadyResolvers = [];
let annotationRunToken = 0;

function queueAnnotationRender() {
  if (annotationRenderQueued) return;
  annotationRenderQueued = true;

  const schedule = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb) => setTimeout(cb, 0);

  schedule(() => {
    annotationRenderQueued = false;
    eventBus.emit('render');
  });
}

function waitForEngineReady() {
  return new Promise(resolve => {
    if (!engine) {
      resolve();
      return;
    }
    pendingReadyResolvers.push(resolve);
    engine.postMessage('isready');
  });
}

function hasCurrentStatsLoaded(fen) {
  if (!fen || state.statsLoading) return false;
  const min = state.statsFilters?.eloMin ?? STATS_ELO_MIN;
  const max = state.statsFilters?.eloMax ?? STATS_ELO_MAX;
  const db = state.statsFilters?.currentDatabase ?? 'lichess';
  return state.lastStatsRequestKey === `${fen}|${min},${max}|${db}`;
}

function getAnnotationDepth() {
  const depth = parseInt(state.analysisDepth, 10);
  if (!Number.isFinite(depth)) return DEFAULT_ANNOT_DEPTH;
  return Math.min(20, Math.max(5, depth));
}

function getAnnotationDisplayDelayMs(moveCount) {
  const depth = getAnnotationDepth();
  return Math.min(
    ANNOT_DELAY_MAX_MS,
    ANNOT_DELAY_BASE_MS + depth * ANNOT_DELAY_PER_DEPTH_MS + moveCount * ANNOT_DELAY_PER_MOVE_MS
  );
}

function formatAnnotationScore(cp) {
  if (typeof cp !== 'number') return '';
  if (Math.abs(cp) >= 90000) return 'Mat';
  return `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(2)}`;
}


function sortStatsMovesForAnalysis(moves, fen) {
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
        const diff = getMoveTotalGames(right.move) - getMoveTotalGames(left.move);
        if (diff !== 0) return diff;
      }

      const countDiff = getMoveTotalGames(right.move) - getMoveTotalGames(left.move);
      if (countDiff !== 0) return countDiff;
      return left.index - right.index;
    })
    .map(entry => entry.move);
}

function getVisibleStatsMoves() {
  if (!state.lichessStats?.moves?.length) return [];
  const visibleCount = state.statsShowAll ? ANNOT_MAX_MOVES : Math.min(ANNOT_DEFAULT_VISIBLE, ANNOT_MAX_MOVES);
  const sortedMoves = sortStatsMovesForAnalysis(state.lichessStats.moves, state.currentNode?.fen);
  return sortedMoves.slice(0, visibleCount);
}

export async function initAnalysis() {
  if (engine || engineLoading) return;
  engineLoading = true;
  state.analysisError = null;
  renderAnalysisPanelIfVisible();

  try {
    const res = await fetch(SF_CDN);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const code = await res.text();
    const blob = new Blob([code], { type: 'text/javascript' });
    engine = new Worker(URL.createObjectURL(blob));
    engine.onmessage = onEngineMessage;
    engine.postMessage('uci');
    engine.postMessage('setoption name MultiPV value 3');
    engine.postMessage('isready');
  } catch (err) {
    console.error('[analysis] Stockfish load failed:', err);
    engine = null;
    state.analysisError = 'Moteur indisponible (verifiez la connexion).';
  } finally {
    engineLoading = false;
    renderAnalysisPanelIfVisible();
  }
}

function onEngineMessage(event) {
  const line = typeof event === 'string' ? event : event.data;
  if (!line) return;

  if (line === 'readyok') {
    engineReady = true;
    if (pendingReadyResolvers.length) {
      const resolvers = pendingReadyResolvers.splice(0, pendingReadyResolvers.length);
      resolvers.forEach(resolve => resolve());
      return;
    }
    if (state.isAnalysisEnabled) {
      triggerAnalysisNow();
      if (state.currentNode?.fen && hasCurrentStatsLoaded(state.currentNode.fen)) {
        const visibleMoves = getVisibleStatsMoves();
        if (visibleMoves.length) annotateStatsMoves(state.currentNode.fen, visibleMoves);
      }
    }
    return;
  }

  if (annotCurrentResolve !== null) {
    if (line.startsWith('info')) {
      const cpM = line.match(/\bscore cp (-?\d+)/);
      const mateM = line.match(/\bscore mate (-?\d+)/);
      if (cpM) {
        annotLastInfoCp = parseInt(cpM[1], 10);
      } else if (mateM) {
        const mate = parseInt(mateM[1], 10);
        annotLastInfoCp = mate > 0 ? 99999 : -99999;
      }
      const pvM = line.match(/ pv ([\w\s]+)/);
      if (pvM) annotLastInfoPv = pvM[1].trim().split(/\s+/);
    } else if (line.startsWith('bestmove')) {
      const cp = annotLastInfoCp;
      const pv = annotLastInfoPv;
      annotLastInfoCp = null;
      annotLastInfoPv = null;
      const resolve = annotCurrentResolve;
      annotCurrentResolve = null;
      resolve({ cp, pv });
    }
    return;
  }

  if (!state.isAnalysisEnabled) return;

  if (line.startsWith('info') && line.includes(' pv ')) {
    const mpvM = line.match(/\bmultipv (\d+)/);
    if (!mpvM) return;
    const idx = parseInt(mpvM[1], 10);

    const cpM = line.match(/\bscore cp (-?\d+)/);
    const mateM = line.match(/\bscore mate (-?\d+)/);
    const pvM = line.match(/ pv ([\w\s]+)/);
    if (!pvM) return;

    const pv = pvM[1].trim().split(/\s+/);
    const bestMove = pv[0];
    if (!bestMove) return;

    const sideToMove = lastAnalyzedFen ? lastAnalyzedFen.split(' ')[1] : 'w';
    const sign = sideToMove === 'w' ? 1 : -1;

    let score;
    let cpValue = null;
    if (mateM) {
      const mate = sign * parseInt(mateM[1], 10);
      score = `#${mate}`;
    } else if (cpM) {
      cpValue = sign * parseInt(cpM[1], 10);
      score = `${cpValue >= 0 ? '+' : ''}${(cpValue / 100).toFixed(2)}`;
    } else {
      return;
    }

    pvMap[idx] = { bestMove, score, pv: pv.slice(0, 7), cpValue };
    state.analysisResults = Object.keys(pvMap)
      .map(Number)
      .sort((a, b) => a - b)
      .map(key => pvMap[key]);

    renderAnalysisPanelIfVisible();
  }
}

export function toggleAnalysis() {
  if (!state.isAnalysisEnabled) {
    state.isAnalysisEnabled = true;
    state.analysisResults = [];
    state.analysisError = null;
    lastAnalyzedFen = '';
    Object.keys(pvMap).forEach(key => delete pvMap[key]);

    if (!engine) {
      initAnalysis();
    } else if (engineReady) {
      triggerAnalysisNow();
      if (state.currentNode?.fen && hasCurrentStatsLoaded(state.currentNode.fen)) {
        const visibleMoves = getVisibleStatsMoves();
        if (visibleMoves.length) annotateStatsMoves(state.currentNode.fen, visibleMoves);
      }
    }
  } else {
    state.isAnalysisEnabled = false;
    if (analysisTimer) {
      clearTimeout(analysisTimer);
      analysisTimer = null;
    }
    if (engine) engine.postMessage('stop');
    state.analysisResults = [];
    state.analysisError = null;
    state.moveAnnotationsLoading = false;
    lastAnalyzedFen = '';
    Object.keys(pvMap).forEach(key => delete pvMap[key]);
    _abortAnnotation();
  }
}

export function setAnalysisDepth(d) {
  state.analysisDepth = Math.min(20, Math.max(5, parseInt(d, 10)));
  if (state.isAnalysisEnabled && engine && engineReady) {
    lastAnalyzedFen = '';
    state.moveAnnotations = {};
    state.moveAnnotationScores = {};
    state.moveAnnotationValues = {};
    state.moveAnnotationsKey = state.currentNode?.fen || '';
    state.moveAnnotationsVisibleKey = '';
    state.moveAnnotationsDepth = 0;
    state.moveAnnotationsCount = 0;
    state.moveAnnotationsComplete = false;
    state.moveAnnotationsLoading = true;
    queueAnnotationRender();
    triggerAnalysis();
    if (state.currentNode?.fen && hasCurrentStatsLoaded(state.currentNode.fen)) {
      const visibleMoves = getVisibleStatsMoves();
      if (visibleMoves.length) annotateStatsMoves(state.currentNode.fen, visibleMoves);
    }
  }
}

export function triggerAnalysisIfNeeded() {
  if (!state.isAnalysisEnabled || !engine || !engineReady) return;
  if (annotCurrentResolve !== null) return;
  const fen = state.currentNode?.fen;
  if (!fen || fen === lastAnalyzedFen) return;

  lastAnalyzedFen = fen;
  Object.keys(pvMap).forEach(key => delete pvMap[key]);
  state.analysisResults = [];
  renderAnalysisPanelIfVisible();
  triggerAnalysis();
}

function triggerAnalysis() {
  if (analysisTimer) clearTimeout(analysisTimer);
  analysisTimer = setTimeout(triggerAnalysisNow, ANALYSIS_DEBOUNCE_MS);
}

function triggerAnalysisNow() {
  if (!state.isAnalysisEnabled || !engine || !engineReady) return;
  if (annotCurrentResolve !== null) return;
  const fen = state.currentNode?.fen;
  if (!fen) return;
  lastAnalyzedFen = fen;
  engine.postMessage('stop');
  engine.postMessage(`position fen ${fen}`);
  engine.postMessage(`go depth ${state.analysisDepth}`);
}

function _abortAnnotation() {
  annotAborted = true;
  annotatingForFen = '';
  annotatingForDepth = 0;
  annotatingForCount = 0;
  annotatingForVisibleKey = '';
  state.moveAnnotationsLoading = false;
  if (annotCurrentResolve) {
    const resolve = annotCurrentResolve;
    annotCurrentResolve = null;
    annotLastInfoCp = null;
    annotLastInfoPv = null;
    resolve(null);
  }
}

function evalFenAnnotation(fen) {
  return new Promise(resolve => {
    if (!engine || !engineReady || annotAborted) {
      resolve(null);
      return;
    }
    annotLastInfoCp = null;
    annotLastInfoPv = null;
    annotCurrentResolve = resolve;
    engine.postMessage(`position fen ${fen}`);
    engine.postMessage(`go depth ${getAnnotationDepth()}`);
  });
}

async function evalFenAnnotationWithRetry(fen) {
  const first = await evalFenAnnotation(fen);
  if (first !== null || annotAborted || !state.isAnalysisEnabled) return first;

  await waitForEngineReady();
  if (annotAborted || !state.isAnalysisEnabled) return null;

  return evalFenAnnotation(fen);
}

function _resumeMainAnalysis() {
  if (analysisTimer) {
    clearTimeout(analysisTimer);
    analysisTimer = null;
  }
  if (!engine) return;
  engine.postMessage('setoption name MultiPV value 3');
  if (state.isAnalysisEnabled && engineReady) {
    lastAnalyzedFen = '';
    triggerAnalysis();
  }
}

function _finishAnnotationRun() {
  annotCurrentResolve = null;
  annotLastInfoCp = null;
  annotLastInfoPv = null;
  annotatingForFen = '';
  annotatingForDepth = 0;
  annotatingForCount = 0;
  annotatingForVisibleKey = '';
}

export function requestVisibleMoveAnnotations() {
  if (!state.isAnalysisEnabled || !engine || !engineReady) return;
  const fen = state.currentNode?.fen;
  if (!fen || !hasCurrentStatsLoaded(fen)) return;
  const visibleMoves = getVisibleStatsMoves();
  if (visibleMoves.length) annotateStatsMoves(fen, visibleMoves);
}

export async function annotateStatsMoves(baseFen, lichessMoves) {
  if (!engine || !engineReady || !state.isAnalysisEnabled) return;
  if (!baseFen || !Array.isArray(lichessMoves) || lichessMoves.length === 0) return;

  const annotationDepth = getAnnotationDepth();
  const visibleMoves = lichessMoves.slice(0, ANNOT_MAX_MOVES);
  const visibleKey = visibleMoves.map(move => move.uci).join(',');
  const sameCache = state.moveAnnotationsKey === baseFen && state.moveAnnotationsDepth === annotationDepth;
  const currentCount = sameCache ? state.moveAnnotationsCount : 0;
  const cachedVisibleMoves = sameCache && state.moveAnnotationsVisibleKey
    ? state.moveAnnotationsVisibleKey.split(',')
    : [];
  const canReusePrefix = cachedVisibleMoves.length > 0
    && cachedVisibleMoves.every((uci, index) => visibleMoves[index]?.uci === uci);

  if (
    annotatingForFen === baseFen
    && annotatingForDepth === annotationDepth
    && annotatingForVisibleKey === visibleKey
    && annotatingForCount >= visibleMoves.length
  ) return;

  if (sameCache && state.moveAnnotationsComplete && canReusePrefix && currentCount >= visibleMoves.length) return;

  const isIncremental = sameCache && state.moveAnnotationsComplete && canReusePrefix && currentCount > 0 && currentCount < visibleMoves.length;
  const movesToEvaluate = isIncremental ? visibleMoves.slice(currentCount) : visibleMoves;
  if (movesToEvaluate.length === 0) return;

  const runToken = ++annotationRunToken;
  const delayPromise = new Promise(resolve => {
    setTimeout(resolve, getAnnotationDisplayDelayMs(movesToEvaluate.length));
  });

  _abortAnnotation();
  if (analysisTimer) {
    clearTimeout(analysisTimer);
    analysisTimer = null;
  }
  engine.postMessage('stop');
  engine.postMessage('setoption name MultiPV value 1');

  annotatingForFen = baseFen;
  annotatingForDepth = annotationDepth;
  annotatingForCount = visibleMoves.length;
  annotatingForVisibleKey = visibleKey;
  state.moveAnnotationsKey = baseFen;
  state.moveAnnotationsVisibleKey = visibleKey;
  state.moveAnnotationsDepth = annotationDepth;
  state.moveAnnotationsLoading = true;
  state.moveAnnotationsComplete = false;
  if (!isIncremental) {
    state.moveAnnotations = {};
    state.moveAnnotationScores = {};
    state.moveAnnotationValues = {};
    state.moveAnnotationPvs = {};
    state.moveAnnotationsVisibleKey = '';
    state.moveAnnotationsCount = 0;
  }
  queueAnnotationRender();

  await waitForEngineReady();
  if (runToken !== annotationRunToken) return;

  annotAborted = false;
  annotLastInfoCp = null;
  annotLastInfoPv = null;
  annotCurrentResolve = null;
  const nextAnnotations = isIncremental ? { ...state.moveAnnotations } : {};
  const nextAnnotationScores = isIncremental ? { ...state.moveAnnotationScores } : {};
  const nextAnnotationValues = isIncremental ? { ...state.moveAnnotationValues } : {};
  const nextAnnotationPvs = isIncremental ? { ...state.moveAnnotationPvs } : {};

  try {
    const chessTemp = new Chess();
    const baseSideToMove = baseFen.split(' ')[1] || 'w';

    for (const move of movesToEvaluate) {
      if (runToken !== annotationRunToken || annotAborted || !state.isAnalysisEnabled) break;

      chessTemp.load(baseFen);
      const uci = move.uci;
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promo = uci[4];
      const ok = chessTemp.move({ from, to, ...(promo ? { promotion: promo } : {}) });
      if (!ok) continue;

      const afterFen = chessTemp.fen();
      const result = await evalFenAnnotationWithRetry(afterFen);
      if (runToken !== annotationRunToken || annotAborted || !state.isAnalysisEnabled) break;

      const afterSideToMove = afterFen.split(' ')[1] || 'w';
      // result peut être null si l'éval a échoué — on stocke 0 (neutre) pour garantir une couleur
      const rawCp = result !== null ? (result.cp ?? 0) : 0;
      const afterWhiteCp = (afterSideToMove === 'w' ? 1 : -1) * rawCp;
      const moverCp = baseSideToMove === 'w' ? afterWhiteCp : -afterWhiteCp;

      nextAnnotations[uci] = formatAnnotationScore(moverCp);
      nextAnnotationScores[uci] = formatAnnotationScore(moverCp);
      nextAnnotationValues[uci] = moverCp;
      // PV : le coup joué + la continuation depuis la position après
      const continuation = result?.pv ?? [];
      nextAnnotationPvs[uci] = [uci, ...continuation.slice(0, 4)];
    }

    await delayPromise;
    if (runToken !== annotationRunToken || annotAborted) return;

    state.moveAnnotations = nextAnnotations;
    state.moveAnnotationScores = nextAnnotationScores;
    state.moveAnnotationValues = nextAnnotationValues;
    state.moveAnnotationPvs = nextAnnotationPvs;
    state.moveAnnotationsKey = baseFen;
    state.moveAnnotationsVisibleKey = visibleKey;
    state.moveAnnotationsDepth = annotationDepth;
    state.moveAnnotationsCount = visibleMoves.length;
    state.moveAnnotationsLoading = false;
    state.moveAnnotationsComplete = !annotAborted;
  } finally {
    if (runToken === annotationRunToken) {
      state.moveAnnotationsLoading = false;
      queueAnnotationRender();
      _finishAnnotationRun();
      _resumeMainAnalysis();
    }
  }
}

function cpToWhitePct(cp) {
  const pct = 50 + 50 * (2 / (1 + Math.exp(-0.003 * cp)) - 1);
  return Math.min(97, Math.max(3, pct));
}


export function renderEvalBar() {
  const bar = document.getElementById('eval-bar');
  if (!bar) return;

  const results = state.analysisResults || [];
  if (!state.isAnalysisEnabled || results.length === 0) {
    bar.hidden = true;
    return;
  }

  bar.hidden = false;
  const fillEl = document.getElementById('eval-bar-fill');
  const scoreEl = document.getElementById('eval-bar-score');
  if (!fillEl || !scoreEl) return;

  const result = results[0];
  const flipped = Boolean(state.boardFlipped);
  let whitePct = 50;
  let scoreText = '±0.00';

  if (result) {
    if (typeof result.cpValue === 'number') {
      whitePct = cpToWhitePct(result.cpValue);
      const abs = Math.abs(result.cpValue);
      scoreText = (result.cpValue >= 0 ? '+' : '-') + (abs / 100).toFixed(2);
    } else if (result.score) {
      scoreText = result.score;
      whitePct = result.score.startsWith('-') ? 5 : 95;
    }
  }

  // Fill depuis le côté blanc
  if (!flipped) {
    fillEl.style.top = 'auto';
    fillEl.style.bottom = '0';
  } else {
    fillEl.style.bottom = 'auto';
    fillEl.style.top = '0';
  }
  fillEl.style.height = `${whitePct}%`;

  // Badge côté avantageux
  // Blanc gagne + pas flip → blanc en bas → badge en bas
  // Blanc gagne + flip  → blanc en haut → badge en haut
  // Noir gagne  + pas flip → noir en haut → badge en haut
  // Noir gagne  + flip  → noir en bas  → badge en bas
  const whiteWinning = whitePct > 50;
  const scoreAtBottom = whiteWinning !== flipped;

  if (scoreAtBottom) {
    scoreEl.style.bottom = '6px';
    scoreEl.style.top = 'auto';
  } else {
    scoreEl.style.top = '6px';
    scoreEl.style.bottom = 'auto';
  }

  scoreEl.style.color = whiteWinning ? '#111' : '#f0f0f0';
  scoreEl.style.writingMode = 'horizontal-tb';
  scoreEl.textContent = scoreText;
}

function renderAnalysisPanelIfVisible() {
  renderEvalBar();
  const panel = document.getElementById('analysis-panel');
  if (panel) renderAnalysisPanel(panel);
}

export function renderAnalysisPanel(panel) {
  if (!panel) return;

  if (!state.isAnalysisEnabled) {
    panel.innerHTML = '';
    return;
  }

  if (engineLoading) {
    panel.innerHTML = '<div class="analysis-loading"><span class="analysis-spinner"></span>Chargement du moteur...</div>';
    return;
  }

  if (state.analysisError) {
    panel.innerHTML = `<div class="analysis-loading">⚠️ ${state.analysisError}</div>`;
    return;
  }

  const results = state.analysisResults || [];
  if (results.length === 0) {
    panel.innerHTML = '<div class="analysis-loading"><span class="analysis-spinner"></span>Analyse en cours...</div>';
    return;
  }

  panel.innerHTML = '';
  const frag = document.createDocumentFragment();

  results.forEach(line => {
    const row = document.createElement('div');
    row.className = 'analysis-row';

    const scoreEl = document.createElement('span');
    const isMate = line.score.includes('#');
    const isNeg = !isMate && typeof line.cpValue === 'number' && line.cpValue < 0;
    scoreEl.className = 'analysis-score' + (isMate ? ' is-mate' : isNeg ? ' is-neg' : ' is-pos');
    scoreEl.textContent = line.score;

    const moveEl = document.createElement('span');
    moveEl.className = 'analysis-move';
    moveEl.textContent = line.bestMove;

    const pvEl = document.createElement('span');
    pvEl.className = 'analysis-pv';
    pvEl.textContent = line.pv.slice(1).join(' ');

    row.appendChild(scoreEl);
    row.appendChild(moveEl);
    row.appendChild(pvEl);
    frag.appendChild(row);
  });

  panel.appendChild(frag);
}

export function syncAnalysisControls() {
  const btn = document.getElementById('analysis-toggle-btn');
  const depthPanel = document.getElementById('analysis-depth-panel');
  const depthVal = document.getElementById('analysis-depth-value');
  const depthInput = document.getElementById('analysis-depth-input');
  const depthFill = document.getElementById('analysis-depth-fill');

  if (!btn) return;

  const depth = state.analysisDepth ?? 10;
  btn.classList.toggle('active', Boolean(state.isAnalysisEnabled));
  if (depthPanel) depthPanel.hidden = !state.isAnalysisEnabled;
  if (depthVal) depthVal.textContent = String(depth);
  if (depthInput) depthInput.value = String(depth);
  if (depthFill) {
    const pct = ((depth - 5) / 15) * 100;
    depthFill.style.width = `${pct}%`;
  }

  if (!btn.dataset.analysisbound) {
    btn.addEventListener('click', () => {
      toggleAnalysis();
      syncAnalysisControls();
      renderAnalysisPanelIfVisible();
    });
    btn.dataset.analysisbound = '1';
  }

  if (depthInput && !depthInput.dataset.analysisbound) {
    depthInput.addEventListener('input', () => {
      const d = parseInt(depthInput.value, 10);
      if (depthVal) depthVal.textContent = String(d);
      if (depthFill) {
        const pct = ((d - 5) / 15) * 100;
        depthFill.style.width = `${pct}%`;
      }
      setAnalysisDepth(d);
    });
    depthInput.dataset.analysisbound = '1';
  }
}

// Terminer proprement le Worker Stockfish à la fermeture de la page
window.addEventListener('beforeunload', () => {
  if (engine) {
    engine.postMessage('quit');
    engine.terminate();
    engine = null;
  }
});
