import { Chess } from 'chess.js';
import { useTrainingStore } from '@/stores/trainingStore';
import { useChessStore } from '@/stores/chessStore';
import { useRepertoireStore } from '@/stores/repertoireStore';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useAnalysisStore } from '@/stores/analysisStore';
import { nodeMap, expandPathToCurrentNode } from './repertoire';
import { apiRequest } from '@/services/api';
import type { RepertoireNode } from '@/types/repertoire';
import type { Color, Square } from '@/types/chess';
import type { SurvivalReport, SurvivalMistake, TrainingMode, MedalTier } from '@/types/training';
import { SURVIVAL_LIVES, SURVIVAL_LIFE_BONUS_INTERVAL, MEDAL_RANK } from '@/types/training';

let autoPlayTimer: ReturnType<typeof setTimeout> | null = null;
let pendingTrainingMode: TrainingMode = 'vertical';
let pendingTrainingNode: RepertoireNode | null = null;
let pendingTrainingColor: Color = 'w';
let pendingTrainingMissingNodes: RepertoireNode[] = [];
let pendingTrainingOutOfScopeTranspos: RepertoireNode[] = [];
let pendingTrainingIncludeOutOfScope = true;
let preTrainingCurrentNodeId: string | null = null;

function getPathString(node: RepertoireNode): string {
  const parts: string[] = [];
  let cur: RepertoireNode | undefined = node;
  while (cur && cur.parentId) {
    parts.unshift(cur.san);
    cur = nodeMap.get(cur.parentId);
  }
  return parts.join(' ');
}

export function countMoves(node: RepertoireNode, repColor: Color): number {
  let count = 0;
  function walk(n: RepertoireNode) {
    if (n.parentId && n.turn === repColor) count++;
    n.children.forEach(walk);
  }
  walk(node);
  return count;
}

function collectTrainableTargetsCount(root: RepertoireNode): number {
  if (!root) return 0;
  let count = 0;
  function walk(node: RepertoireNode) {
    if (!node) return;
    if (isTrainablePlayerNode(node)) count += 1;
    node.children.forEach(child => {
      if (!isInTrainingSubtree(child)) return;
      walk(child);
    });
  }
  walk(root);
  return count;
}

function getSurvivalProgressSnapshot() {
  const ts = useTrainingStore.getState();
  const total = Math.max(0, ts.totalTargets || 0);
  const completed = Math.min(total, ts.completedTargets?.size || 0);
  const correct = Math.min(completed, ts.answered?.size || 0);
  const mistakes = ts.mistakes?.length || 0;
  const progressPercent = total > 0 ? (completed / total) * 100 : 0;
  return { total, completed, correct, mistakes, progressPercent };
}

export function getRepertoireSizeBucket(moveCount: number): number {
  if (moveCount > 500) return 5;
  if (moveCount > 350) return 4;
  if (moveCount > 200) return 3;
  if (moveCount > 100) return 2;
  if (moveCount > 50) return 1;
  return 0;
}

function getMedalFromProgress(progressPercent: number, moveCount: number): { tier: MedalTier; shineLevel: number } {
  if (progressPercent < 30) return { tier: 'none', shineLevel: 0 };
  const shineLevel = getRepertoireSizeBucket(moveCount);
  if (progressPercent < 60) return { tier: 'bronze', shineLevel };
  if (progressPercent < 100) return { tier: 'silver', shineLevel };
  if (moveCount > 500) return { tier: 'chrome', shineLevel };
  if (moveCount > 350) return { tier: 'diamond', shineLevel };
  if (moveCount > 200) return { tier: 'platinum', shineLevel };
  return { tier: 'gold', shineLevel };
}

export function getMedalLabel(tier: MedalTier): string {
  const labels: Record<MedalTier, string> = {
    none: 'Aucune médaille',
    bronze: 'Médaille bronze',
    silver: 'Médaille argent',
    gold: 'Médaille or',
    platinum: 'Médaille platine',
    diamond: 'Médaille diamant',
    chrome: 'Médaille chromée',
  };
  return labels[tier] || 'Médaille';
}

export function getMedalIcon(tier: MedalTier): string {
  const icons: Record<MedalTier, string> = {
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

export function getMedalDisplayMeta(rep: RepertoireNode): { tier: MedalTier; shine: number; label: string; icon: string } | null {
  const tier = rep.trainingMedalTier || 'none';
  const shine = Number.isFinite(rep.trainingMedalShineLevel) ? rep.trainingMedalShineLevel! : 0;
  if (tier === 'none') return null;
  return { tier, shine, label: getMedalLabel(tier), icon: getMedalIcon(tier) };
}

export function getNextRewardHint(completed: number, total: number, moveCount: number): { needed: number; nextTier: MedalTier } | null {
  if (!total) return null;
  const progressPercent = (completed / total) * 100;
  if (progressPercent < 30) return { needed: Math.ceil(0.3 * total) - completed, nextTier: 'bronze' };
  if (progressPercent < 60) return { needed: Math.ceil(0.6 * total) - completed, nextTier: 'silver' };
  if (progressPercent < 100) return { needed: total - completed, nextTier: getMedalFromProgress(100, moveCount).tier };
  return null;
}

function tryUpgradeRepertoireMedal(trainingNode: RepertoireNode, progressPercent: number, trainingColor: Color): void {
  if (!trainingNode || !trainingColor) return;
  const moveCount = countMoves(trainingNode, trainingColor);
  const medal = getMedalFromProgress(progressPercent, moveCount);
  if (medal.tier === 'none') return;
  const previousTier = trainingNode.trainingMedalTier || 'none';
  if ((MEDAL_RANK[medal.tier] || 0) < (MEDAL_RANK[previousTier] || 0)) return;
  if ((MEDAL_RANK[medal.tier] || 0) === (MEDAL_RANK[previousTier] || 0)) {
    const previousShine = Number.isFinite(trainingNode.trainingMedalShineLevel) ? trainingNode.trainingMedalShineLevel! : 0;
    if (medal.shineLevel <= previousShine) return;
  }
  trainingNode.trainingMedalTier = medal.tier;
  trainingNode.trainingMedalShineLevel = medal.shineLevel;
  trainingNode.trainingMedalUpdatedAt = Date.now();
  useRepertoireStore.setState({ version: Date.now() });
}

function checkSurvivalLifeBonus(): void {
  const ts = useTrainingStore.getState();
  if (ts.phase !== 'active' || ts.mode !== 'survival') return;
  const correct = ts.answered?.size || 0;
  const expectedMilestone = (ts.milestones + 1) * SURVIVAL_LIFE_BONUS_INTERVAL;
  if (correct < expectedMilestone) return;
  ts.incrementMilestones();
  if (ts.lives < SURVIVAL_LIVES) {
    // Re-run the store's loseLife logic in reverse — gain a life
    useTrainingStore.setState({ lives: ts.lives + 1 });
  } else if (!ts.goldenHeart) {
    ts.gainGoldenHeart();
  }
}

function navigateToNodeFen(node: RepertoireNode) {
  useChessStore.setState({ chess: new Chess(node.fen), selectedSq: null });
  useRepertoireStore.setState({ currentNodeId: node.id, version: Date.now() });
  expandPathToCurrentNode(node.id);
}

function getTrainingNodeTurn(node: RepertoireNode): Color {
  return node.turn === 'w' ? 'b' : 'w';
}

function isTrainablePlayerNode(node: RepertoireNode): boolean {
  const ts = useTrainingStore.getState();
  return Boolean(node)
    && node.children.length > 0
    && getTrainingNodeTurn(node) === ts.repColor
    && !ts.ignoredNoReply.has(node.id);
}

function isFullyExplored(node: RepertoireNode): boolean {
  const ts = useTrainingStore.getState();
  if (node.children.length === 0) {
    return ts.visited.has(node.id) || ts.ignoredNoReply.has(node.id);
  }
  return node.children.every(c => isFullyExplored(c));
}

function isNodeInSubtree(node: RepertoireNode, subtreeRoot: RepertoireNode): boolean {
  let cur: RepertoireNode | undefined = node;
  while (cur) {
    if (cur.id === subtreeRoot.id) return true;
    if (!cur.parentId) break;
    cur = nodeMap.get(cur.parentId)!;
  }
  return false;
}

export function collectMissingReplyNodes(root: RepertoireNode, repColor: Color): RepertoireNode[] {
  const missing: RepertoireNode[] = [];
  function walk(node: RepertoireNode) {
    if (node.isTransposition && node.sourceNodeId) return;
    const nextToPlay: Color = node.turn === 'w' ? 'b' : 'w';
    if (nextToPlay === repColor && node.children.length === 0) {
      const tmp = new Chess(node.fen);
      if (!tmp.isGameOver()) missing.push(node);
      return;
    }
    node.children.forEach(walk);
  }
  walk(root);
  return missing;
}

export function collectOutOfScopeTranspositionNodes(root: RepertoireNode): RepertoireNode[] {
  const outOfScope: RepertoireNode[] = [];
  function walk(node: RepertoireNode) {
    if (node.isTransposition && node.sourceNodeId) {
      const src = node.sourceNodeId ? nodeMap.get(node.sourceNodeId) : undefined;
      if (src && !isNodeInSubtree(src, root)) outOfScope.push(node);
      return;
    }
    node.children.forEach(walk);
  }
  walk(root);
  return outOfScope;
}

function collectAllTrainingTargets(root: RepertoireNode, results: RepertoireNode[] = []): RepertoireNode[] {
  const ts = useTrainingStore.getState();
  if (!root) return results;
  if (isTrainablePlayerNode(root) && !ts.visited.has(root.id)) results.push(root);
  root.children.forEach(child => {
    if (!isInTrainingSubtree(child)) return;
    collectAllTrainingTargets(child, results);
  });
  return results;
}

function collectFinalTrainingTargets(root: RepertoireNode): RepertoireNode[] {
  const ts = useTrainingStore.getState();
  const targets = new Map<string, RepertoireNode>();
  function walk(node: RepertoireNode, latestTarget: RepertoireNode | null = null) {
    let nextLatestTarget = latestTarget;
    if (isTrainablePlayerNode(node)) nextLatestTarget = node;
    if (node.children.length === 0) {
      if (!ts.ignoredNoReply.has(node.id) && nextLatestTarget && !ts.visited.has(nextLatestTarget.id)) {
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

function getTrainingTargetsForCurrentMode(): RepertoireNode[] {
  const ts = useTrainingStore.getState();
  if (!ts.root) return [];
  if (ts.mode === 'express') {
    const targets = collectFinalTrainingTargets(ts.root);
    targets.sort((a, b) => getPathFromRoot(b).length - getPathFromRoot(a).length);
    return targets;
  }
  if (ts.mode === 'randomizer') return collectAllTrainingTargets(ts.root);
  return [];
}

function getPathFromRoot(targetNode: RepertoireNode): RepertoireNode[] {
  const ts = useTrainingStore.getState();
  const path: RepertoireNode[] = [];
  let cur: RepertoireNode | undefined = targetNode;
  while (cur) {
    path.unshift(cur);
    if (ts.root && cur.id === ts.root.id) break;
    if (!cur.parentId) break;
    cur = nodeMap.get(cur.parentId);
  }
  return path;
}

function isInTrainingSubtree(node: RepertoireNode): boolean {
  const ts = useTrainingStore.getState();
  if (!ts.root) return false;
  return isNodeInSubtree(node, ts.root);
}

function selectTrainingPath(node: RepertoireNode): RepertoireNode[] | null {
  const ts = useTrainingStore.getState();
  const paths = collectTrainingCandidatePaths(node);
  console.log('[TRAINING] selectTrainingPath nodeId:', node.id, 'mode:', ts.mode, 'pathsCount:', paths.length);
  if (paths.length === 0) {
    console.log('[TRAINING] selectTrainingPath => NO PATHS');
    return null;
  }

  const scored = paths.map((path, index) => ({
    path,
    index,
    stopDepth: getPathFromRoot(path[path.length - 1]).length - 1,
  }));
  console.log('[TRAINING] selectTrainingPath scored:', scored.map(s => ({ index: s.index, stopDepth: s.stopDepth, lastId: s.path[s.path.length-1].id, lastSan: s.path[s.path.length-1].san })));

  if (ts.mode === 'vertical') {
    scored.sort((a, b) => (a.stopDepth - b.stopDepth) || (a.index - b.index));
    const result = scored[0]?.path ?? paths[0];
    console.log('[TRAINING] selectTrainingPath VERTICAL returning path ending at:', result[result.length-1]?.san, 'depth:', scored[0]?.stopDepth);
    return result;
  }
  else if (ts.mode === 'express') {
    scored.sort((a, b) => (b.stopDepth - a.stopDepth) || (a.index - b.index));
    const result = scored[0]?.path ?? paths[0];
    console.log('[TRAINING] selectTrainingPath EXPRESS returning path ending at:', result[result.length-1]?.san, 'depth:', scored[0]?.stopDepth);
    return result;
  }
  else if (ts.mode === 'horizontal') {
    console.log('[TRAINING] selectTrainingPath HORIZONTAL returning paths[0] ending at:', paths[0][paths[0].length-1]?.san);
    return paths[0];
  }
  else if (ts.mode === 'survival') {
    console.log('[TRAINING] selectTrainingPath SURVIVAL returning paths[0] ending at:', paths[0][paths[0].length-1]?.san);
    return paths[0];
  }
  else if (ts.mode === 'randomizer') {
    const idx = Math.floor(Math.random() * paths.length);
    console.log('[TRAINING] selectTrainingPath RANDOMIZER returning paths[' + idx + '] ending at:', paths[idx][paths[idx].length-1]?.san);
    return paths[idx];
  }
  const result = scored[0]?.path ?? paths[0];
  console.log('[TRAINING] selectTrainingPath FALLBACK returning:', result[result.length-1]?.san);
  return result;
}

function collectTrainingCandidatePaths(node: RepertoireNode, currentPath: RepertoireNode[] = [], results: RepertoireNode[][] = []): RepertoireNode[][] {
  const ts = useTrainingStore.getState();
  if (!node) return results;
  if (currentPath.length > 0) {
    const nextToPlay = getTrainingNodeTurn(node);
    const isPlayerStop = nextToPlay === ts.repColor && !ts.answered.has(node.id) && !ts.skippedByError.has(node.id);
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

function showNextTrainingTarget(delay = 0) {
  const ts = useTrainingStore.getState();
  if (ts.phase !== 'active' || !(ts.mode === 'express' || ts.mode === 'randomizer')) return;

  const targets = getTrainingTargetsForCurrentMode();
  if (targets.length === 0) {
    setTimeout(() => useUiStore.getState().openModal({ type: 'training-done' }), 250);
    return;
  }

  const target = ts.mode === 'randomizer'
    ? targets[Math.floor(Math.random() * targets.length)]
    : targets[0];

  if (autoPlayTimer) clearTimeout(autoPlayTimer);
  autoPlayTimer = setTimeout(() => {
    if (useTrainingStore.getState().phase !== 'active') return;
    navigateToNodeFen(target);
    useChessStore.setState({ boardFlipped: ts.repColor === 'b' });
    useTrainingStore.getState().setExpectedChildId(target.children?.[0]?.id ?? null);
  }, delay);
}

function buildTrainingLabel(node: RepertoireNode, repColor: Color): string {
  const path: string[] = [];
  let cur: RepertoireNode | undefined = node;
  let root: RepertoireNode | undefined;
  while (cur) {
    if (cur.parentId) path.unshift(cur.san);
    if (!cur.parentId) { root = cur; break; }
    const parent = nodeMap.get(cur.parentId);
    if (!parent) break;
    cur = parent;
  }
  const repName = root?.name ?? 'Répertoire';
  const colorLabel = repColor === 'w' ? 'Blancs' : 'Noirs';
  return `${repName} — ${colorLabel} [${path.join(' ')}]`;
}

export function confirmTrainingStart(): void {
  console.log('[TRAINING] confirmTrainingStart called', { pendingTrainingMode, pendingTrainingColor: pendingTrainingColor, hasNode: !!pendingTrainingNode });
  const node = pendingTrainingNode;
  if (!node) return;
  preTrainingCurrentNodeId = useRepertoireStore.getState().currentNodeId;
  const repColor = pendingTrainingColor;
  const mode = pendingTrainingMode;
  console.log('[TRAINING] confirmTrainingStart mode:', mode, 'repColor:', repColor, 'nodeId:', node.id, 'nodeFen:', node.fen, 'nodeTurn:', node.turn);

  if (autoPlayTimer) clearTimeout(autoPlayTimer);
  useTrainingStore.getState().startTraining(node, repColor, mode, buildTrainingLabel(node, repColor));

  const ts = useTrainingStore.getState();
  ts.setTotalTargets(collectTrainableTargetsCount(node));
  ts.markVisited(node.id);
  pendingTrainingMissingNodes.forEach(n => ts.markIgnoredNoReply(n.id));

  const ignoreOutOfScope = mode === 'survival' || !pendingTrainingIncludeOutOfScope;
  if (ignoreOutOfScope) {
    pendingTrainingOutOfScopeTranspos.forEach(n => ts.markIgnoredNoReply(n.id));
  }

  useAnalysisStore.setState({ results: [] });
  navigateToNodeFen(node);
  useRepertoireStore.setState({ redoStack: [] });
  useChessStore.setState({ boardFlipped: repColor === 'b' });
  useUiStore.getState().closeModal();

  if (mode === 'express' || mode === 'randomizer') {
    showNextTrainingTarget();
    return;
  }
  advanceAutoPlay();
}

function delayForSteps(steps: number): number {
  if (steps <= 1) return 800;
  if (steps === 2) return 400;
  return 200;
}

function advanceAutoPlay(forcedDelay: number | null = null) {
  const ts = useTrainingStore.getState();
  if (ts.phase !== 'active') { console.log('[TRAINING] advanceAutoPlay => phase not active'); return; }

  const currentNodeId = useRepertoireStore.getState().currentNodeId;
  const node = currentNodeId ? nodeMap.get(currentNodeId) : undefined;
  if (!node) { console.log('[TRAINING] advanceAutoPlay => node not found for currentId:', currentNodeId); return; }
  console.log('[TRAINING] advanceAutoPlay nodeId:', node.id, 'san:', node.san, 'turn:', node.turn, 'mode:', ts.mode, 'repColor:', ts.repColor, 'answered:', ts.answered.has(node.id), 'skipped:', ts.skippedByError.has(node.id));

  if (ts.ignoredNoReply.has(node.id)) { console.log('[TRAINING] advanceAutoPlay => ignoredNoReply, lineComplete'); handleLineComplete(node); return; }
  if (node.children.length === 0) { console.log('[TRAINING] advanceAutoPlay => leaf, lineComplete'); handleLineComplete(node); return; }

  const nextToPlay = getTrainingNodeTurn(node);

  if (nextToPlay === ts.repColor) {
    console.log('[TRAINING] advanceAutoPlay => player turn');
    if (!ts.answered.has(node.id) && !ts.skippedByError.has(node.id)) {
      console.log('[TRAINING] advanceAutoPlay => waiting for player at node:', node.id, node.san);
      const expectedPath = selectTrainingPath(node);
      const expectedId = expectedPath?.[0]?.id ?? node.children[0]?.id ?? null;
      ts.setExpectedChildId(expectedId);
      console.log('[TRAINING] advanceAutoPlay => expectedChildId set to:', expectedId);
      return;
    } else {
      console.log('[TRAINING] advanceAutoPlay => player turn but already answered/skipped');
    }
  } else {
    console.log('[TRAINING] advanceAutoPlay => opponent turn, auto-playing');
  }

  const selectedPath = selectTrainingPath(node);
  if (!selectedPath || selectedPath.length === 0) {
    console.log('[TRAINING] advanceAutoPlay => no path selected, lineComplete');
    ts.setExpectedChildId(null);
    handleLineComplete(node);
    return;
  }

  const nextNode = selectedPath[0];
  ts.setExpectedChildId(nextNode.id);
  const steps = selectedPath.length;
  const delay = forcedDelay !== null ? forcedDelay : delayForSteps(steps);
  const currentId = node.id;
  console.log('[TRAINING] advanceAutoPlay => auto-playing', nextNode.san, 'in', delay, 'ms, steps:', steps);

  if (autoPlayTimer) clearTimeout(autoPlayTimer);
  autoPlayTimer = setTimeout(() => {
    if (useTrainingStore.getState().phase !== 'active') return;
    const curNode = useRepertoireStore.getState().currentNodeId ? nodeMap.get(useRepertoireStore.getState().currentNodeId!) : undefined;
    if (!curNode || curNode.id !== currentId) { console.log('[TRAINING] advanceAutoPlay timer => stale, curId:', curNode?.id, 'expected:', currentId); return; }

    const tmp = new Chess(node.fen);
    const mv = tmp.move(nextNode.san);
    ts.setExpectedChildId(null);
    navigateToNodeFen(nextNode);
    if (mv) useChessStore.setState({ pendingAnimation: { fromSq: mv.from, toSq: mv.to } });
    console.log('[TRAINING] advanceAutoPlay timer => navigated to:', nextNode.id, nextNode.san);
    advanceAutoPlay();
  }, delay);
}

function handleLineComplete(node: RepertoireNode) {
  const ts = useTrainingStore.getState();
  console.log('[TRAINING] handleLineComplete nodeId:', node.id, 'san:', node.san, 'mode:', ts.mode, 'fullyExplored(root):', isFullyExplored(ts.root!));
  ts.markVisited(node.id);
  ts.setExpectedChildId(null);

  if (ts.mode === 'express' || ts.mode === 'randomizer') {
    console.log('[TRAINING] handleLineComplete => direct target mode, showing next');
    showNextTrainingTarget();
    return;
  }

  if (isFullyExplored(ts.root!)) {
    console.log('[TRAINING] handleLineComplete => root FULLY explored!');
    if (ts.mode === 'survival') {
      const aliv = useTrainingStore.getState();
      const snapshot = getSurvivalProgressSnapshot();
      const report: SurvivalReport = {
        mistakes: [...aliv.mistakes],
        score: snapshot.completed,
        mode: aliv.mode,
        totalTargets: aliv.totalTargets,
        livesLeft: aliv.lives,
        goldenHeart: aliv.goldenHeart,
        startNodeId: aliv.root?.id,
        repColor: aliv.repColor!,
        correct: snapshot.correct,
        completed: snapshot.completed,
        progressPercent: snapshot.progressPercent,
      };
      ts.setLastReports(report, null);
      tryUpgradeRepertoireMedal(aliv.root!, snapshot.progressPercent, aliv.repColor!);
      const token = useAuthStore.getState().token;
      if (token) {
        apiRequest('/training-stats', { method: 'POST', token, body: { variantKey: String(aliv.root!.id), score: snapshot.completed } }).catch(() => {});
      }
      const earnedMeta = aliv.root ? getMedalDisplayMeta(aliv.root) : null;
      setTimeout(() => {
        useTrainingStore.getState().setFeedback(null);
        stopTraining();
        useUiStore.getState().openModal({ type: 'training-victory', report, earnedMeta });
      }, 600);
    } else {
      setTimeout(() => useUiStore.getState().openModal({ type: 'training-done' }), 600);
    }
    return;
  }

  setTimeout(() => {
    if (useTrainingStore.getState().phase !== 'active') return;
    navigateToNodeFen(ts.root!);
    advanceAutoPlay();
  }, 1000);
}

function getMoveSquares(node: RepertoireNode, moveSan: string): { from: Square; to: Square } {
  try {
    const tmp = new Chess(node.fen);
    const mv = tmp.move(moveSan);
    if (mv) return { from: mv.from as Square, to: mv.to as Square };
  } catch { /* ignore */ }
  return { from: 'a1' as Square, to: 'a1' as Square };
}

export function checkTrainingMove(moveSan: string): void {
  const ts = useTrainingStore.getState();
  if (ts.phase !== 'active') { console.log('[TRAINING] checkTrainingMove => phase not active'); return; }

  const currentNodeId = useRepertoireStore.getState().currentNodeId;
  const node = currentNodeId ? nodeMap.get(currentNodeId) : undefined;
  if (!node) { console.log('[TRAINING] checkTrainingMove => node not found'); return; }

  const expectedChildId = ts.expectedChildId;
  const expected = expectedChildId ? nodeMap.get(expectedChildId) : undefined;

  const existing = node.children.find(c => c.san === moveSan);
  const isExpectedMove = existing && expected && existing.id === expected.id;
  const isAlternativeMove = existing && expected && existing.id !== expected.id;
  console.log('[TRAINING] checkTrainingMove san:', moveSan, 'nodeId:', node.id, 'nodeSan:', node.san, 'expectedChildId:', expectedChildId, 'isExpected:', isExpectedMove, 'isAlternative:', isAlternativeMove, 'mode:', ts.mode);

  if (isExpectedMove || (existing && !expected)) {
    // Coup correct
    ts.markAnswered(node.id);
    ts.unmarkSkipped(node.id);
    ts.markCompleted(node.id);
    const wasDirectTarget = ts.mode === 'express' || ts.mode === 'randomizer';
    if (wasDirectTarget) ts.markVisited(node.id);
    const sqs = getMoveSquares(node, moveSan);
    ts.setFeedback({ type: 'correct', from: sqs.from, to: sqs.to });
    navigateToNodeFen(existing);
    useChessStore.setState({ pendingAnimation: { fromSq: sqs.from, toSq: sqs.to } });

    setTimeout(() => {
      if (useTrainingStore.getState().phase !== 'active') return;
      useTrainingStore.getState().setFeedback(null);
      if (ts.mode === 'survival') checkSurvivalLifeBonus();
      if (wasDirectTarget) {
        showNextTrainingTarget(50);
      } else if (ts.mode === 'vertical') {
        const vPath = selectTrainingPath(ts.root!);
        if (!vPath || vPath.length === 0) {
          handleLineComplete(ts.root!);
        } else {
          const targetNode = vPath[vPath.length - 1];
          navigateToNodeFen(targetNode);
          advanceAutoPlay(50);
        }
      } else {
        advanceAutoPlay(50);
      }
    }, 500);
  } else if (isAlternativeMove) {
    // Alternative repertoire move — retry
    const sqs = getMoveSquares(node, moveSan);
    ts.setFeedback({ type: 'retry', from: sqs.from, to: sqs.to });
    setTimeout(() => {
      if (useTrainingStore.getState().phase === 'active') {
        useTrainingStore.getState().setFeedback(null);
      }
    }, 420);
  } else if (ts.mode === 'survival') {
    // Coup incorrect en mode Survie → consomme une vie, passe à la suite
    const mistake: SurvivalMistake = {
      nodeId: node.id, fen: node.fen,
      path: getPathString(node),
      expectedSan: expected?.san || '(aucun)',
      playedSan: moveSan, nodeTurn: node.turn,
    };
    ts.markSkipped(node.id);
    ts.markCompleted(node.id);
    ts.markVisited(node.id);
    ts.addMistake(mistake);
    ts.loseLife();
    const sqs = getMoveSquares(node, moveSan);
    ts.setFeedback({ type: 'wrong', from: sqs.from, to: sqs.to });

    const ts2 = useTrainingStore.getState();
    if (ts2.lives <= 0 && !ts2.goldenHeart) {
      const snapshot = getSurvivalProgressSnapshot();
      const report: SurvivalReport = {
        mistakes: [...ts2.mistakes],
        score: snapshot.completed,
        mode: ts2.mode,
        totalTargets: ts2.totalTargets,
        livesLeft: ts2.lives,
        goldenHeart: false,
        startNodeId: ts2.root?.id,
        repColor: ts2.repColor!,
        correct: snapshot.correct,
        completed: snapshot.completed,
        progressPercent: snapshot.progressPercent,
      };
      ts.setLastReports(report, null);
      tryUpgradeRepertoireMedal(ts2.root!, snapshot.progressPercent, ts2.repColor!);
      const token = useAuthStore.getState().token;
      if (token) {
        apiRequest('/training-stats', { method: 'POST', token, body: { variantKey: String(ts2.root!.id), score: snapshot.completed } }).catch(() => {});
      }
      setTimeout(() => {
        useTrainingStore.getState().setFeedback(null);
        stopTraining();
        useUiStore.getState().openModal({ type: 'training-defeat', report });
      }, 1000);
    } else {
      setTimeout(() => {
        const a = useTrainingStore.getState();
        if (a.phase !== 'active') return;
        a.setFeedback(null);
        checkSurvivalLifeBonus();
        advanceAutoPlay(50);
      }, 500);
    }
  } else {
    // Coup incorrect en Vertical/Express/Randomizer → simple feedback, pas de skip
    const sqs = getMoveSquares(node, moveSan);
    ts.setFeedback({ type: 'wrong', from: sqs.from, to: sqs.to });
    setTimeout(() => {
      if (useTrainingStore.getState().phase === 'active') {
        useTrainingStore.getState().setFeedback(null);
      }
    }, 500);
  }
}

export function clearAutoPlayTimer(): void {
  if (autoPlayTimer) clearTimeout(autoPlayTimer);
  autoPlayTimer = null;
}

export function stopTraining(): void {
  clearAutoPlayTimer();
  useTrainingStore.getState().endTraining();
  useUiStore.getState().closeModal();
  useRepertoireStore.setState({ version: Date.now() });

  if (preTrainingCurrentNodeId) {
    const node = nodeMap.get(preTrainingCurrentNodeId);
    if (node) {
      navigateToNodeFen(node);
      expandPathToCurrentNode(node.id);
    }
    preTrainingCurrentNodeId = null;
  }

  const fen = useChessStore.getState().chess.fen();
  useAnalysisStore.getState().evaluateFen(fen);
}

export function retrySurvivalTraining(): void {
  const ts = useTrainingStore.getState();
  const rep = ts.lastSurvivalReport;
  if (!rep?.startNodeId) { useUiStore.getState().closeModal(); return; }
  const node = nodeMap.get(rep.startNodeId);
  if (!node) { useUiStore.getState().closeModal(); return; }
  pendingTrainingNode = node;
  pendingTrainingColor = rep.repColor || 'w';
  pendingTrainingMode = 'survival';
  pendingTrainingMissingNodes = collectMissingReplyNodes(node, pendingTrainingColor);
  pendingTrainingOutOfScopeTranspos = collectOutOfScopeTranspositionNodes(node);
  pendingTrainingIncludeOutOfScope = false;
  useUiStore.getState().closeModal();
  confirmTrainingStart();
}

export function retrySurvivalVictory(): void {
  const ts = useTrainingStore.getState();
  const rep = ts.lastVictoryReport;
  if (!rep?.startNodeId) { useUiStore.getState().closeModal(); return; }
  const node = nodeMap.get(rep.startNodeId);
  if (!node) { useUiStore.getState().closeModal(); return; }
  pendingTrainingNode = node;
  pendingTrainingColor = rep.repColor || 'w';
  pendingTrainingMode = 'survival';
  pendingTrainingMissingNodes = collectMissingReplyNodes(node, pendingTrainingColor);
  pendingTrainingOutOfScopeTranspos = collectOutOfScopeTranspositionNodes(node);
  pendingTrainingIncludeOutOfScope = false;
  useUiStore.getState().closeModal();
  confirmTrainingStart();
}

export function guardTrainingInterruption(
  title: string,
  message: string,
  onConfirm: () => void,
): void {
  if (useTrainingStore.getState().phase !== 'idle') {
    useUiStore.getState().openModal({
      type: 'training-interrupt',
      title,
      message,
      onConfirm: () => {
        stopTraining();
        onConfirm();
      },
    });
  } else {
    onConfirm();
  }
}

export function prepareTraining(node: RepertoireNode, repColor: Color): void {
  pendingTrainingNode = node;
  pendingTrainingColor = repColor;
  pendingTrainingMissingNodes = collectMissingReplyNodes(node, repColor);
  pendingTrainingOutOfScopeTranspos = collectOutOfScopeTranspositionNodes(node);
  pendingTrainingIncludeOutOfScope = true;
}

export function setPendingTrainingMode(mode: TrainingMode): void {
  pendingTrainingMode = mode;
}

export function setPendingTrainingIncludeOutOfScope(val: boolean): void {
  pendingTrainingIncludeOutOfScope = val;
}

export function getPendingTrainingInfo() {
  return {
    node: pendingTrainingNode,
    color: pendingTrainingColor,
    mode: pendingTrainingMode,
    missingNodes: pendingTrainingMissingNodes,
    outOfScopeTranspos: pendingTrainingOutOfScopeTranspos,
    includeOutOfScope: pendingTrainingIncludeOutOfScope,
  };
}
