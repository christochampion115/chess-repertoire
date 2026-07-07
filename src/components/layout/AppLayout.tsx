import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useAnalysisStore } from '@/stores/analysisStore';
import { useChessStore } from '@/stores/chessStore';
import { useRepertoireStore } from '@/stores/repertoireStore';
import { useTrainingStore } from '@/stores/trainingStore';
import { useUiStore } from '@/stores/uiStore';
import { useToastStore } from '@/stores/toastStore';
import * as repertoireService from '@/services/repertoire';
import { scheduleRepertoireSync } from '@/services/authService';
import { Sidebar } from '@/components/layout/Sidebar';
import { RightPanel } from '@/components/layout/RightPanel';
import { SplashScreen } from '@/components/layout/SplashScreen';
import { ToastContainer } from '@/components/layout/ToastContainer';
import { Board } from '@/components/board/Board';
import { EngineArrows } from '@/components/board/EngineArrows';
import { EvalBarConnected } from '@/components/board/EvalBarConnected';
import { TrainingBanner } from '@/components/training/TrainingBanner';
import { BoardControls } from '@/components/board/BoardControls';
import { useStatsAutoLoad } from '@/hooks/useStats';

/**
 * Racine de l'application React — shell complet.
 *
 * Reproduit la structure HTML vanilla :
 *   header.top-bar  +  main.app-layout (aside.left | section.board-area | aside.right)
 *
 * Phase 5 y ajoutera : ContextMenu, ModalPortal.
 * Phase 6 : drag & drop.
 */
export function AppLayout() {
  const status      = useAuthStore((s) => s.status);
  const user        = useAuthStore((s) => s.user);
  const isGuestMode = useAuthStore((s) => s.isGuestMode);
  const activeModal = useUiStore((s) => s.activeModal);

  if (status === 'loading') return null;

  const showSplash  = status === 'guest' && activeModal?.type !== 'session-expired';

  /* ── Stats auto-load ─────────────────────────── */
  useStatsAutoLoad();

  /* ── Toasts syncStatus ───────────────────────── */
  const syncStatus = useAuthStore((s) => s.syncStatus);
  const prevSyncStatus = useRef(syncStatus);
  const pendingDirtyCount = useRef(0);
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    const prev = prevSyncStatus.current;
    prevSyncStatus.current = syncStatus;

    // Capture dirtyCount au début d'un cycle de sync
    if (prev !== 'syncing' && syncStatus === 'syncing') {
      pendingDirtyCount.current = useRepertoireStore.getState().dirtyIds.size;
    }

    // Sync échouée
    if (prev !== 'error' && syncStatus === 'error') {
      const count = useRepertoireStore.getState().dirtyIds.size;
      addToast(
        count > 0
          ? `⚠ Échec de la sauvegarde (${count} coup${count > 1 ? 's' : ''} non sauvegardé${count > 1 ? 's' : ''})`
          : '⚠ Échec de la sauvegarde',
        'error',
      );
    }

    // Cycle de sync terminé avec succès (syncing → idle)
    if (prev === 'syncing' && syncStatus === 'idle') {
      const saved = pendingDirtyCount.current;
      if (saved > 0) {
        addToast(`✓ ${saved} coup${saved > 1 ? 's' : ''} sauvegardé${saved > 1 ? 's' : ''}`, 'success');
      }
      pendingDirtyCount.current = 0;
    }
  }, [syncStatus, addToast]);

  /* ── Initialiser le worker Stockfish au montage ───────────── */
  const initWorker   = useAnalysisStore((s) => s.initWorker);
  const disposeWorker = useAnalysisStore((s) => s.disposeWorker);

  useEffect(() => {
    initWorker();
    repertoireService.initializeService();
    return () => { disposeWorker(); };
  }, [initWorker, disposeWorker]);

  /* ── Détection offline/online ────────────────────────────────────── */
  useEffect(() => {
    const handleOffline = () => {
      const { addToast: toast } = useToastStore.getState();
      toast('⚠ Connexion perdue — modifications synchronisées à la reconnexion', 'error');
      useAuthStore.getState().setSyncStatus(
        'error', 'Connexion perdue — modifications synchronisées à la reconnexion',
      );
    };
    const handleOnline = () => {
      const { token } = useAuthStore.getState();
      if (token) {
        const { addToast: toast } = useToastStore.getState();
        toast('✓ Connexion rétablie', 'success');
        useAuthStore.getState().setSyncStatus('idle', '');
        scheduleRepertoireSync();
      }
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  /* ── Ouverture depuis un rapport (bouton "Ouvrir →") ────── */
  const openModal = useUiStore((s) => s.openModal);

  useEffect(() => {
    const rawFen = sessionStorage.getItem('alphaChess.openAtFen');
    if (!rawFen) return;

    const fen = decodeURIComponent(rawFen);
    const color = (sessionStorage.getItem('alphaChess.openAtColor') || 'w') as 'w' | 'b';
    const rawPath = sessionStorage.getItem('alphaChess.openAtPath');
    const path = rawPath ? rawPath.split(' ').filter(Boolean) : undefined;
    const rawRootFen = sessionStorage.getItem('alphaChess.openAtRootFen');
    const rootFen = rawRootFen ? decodeURIComponent(rawRootFen) : undefined;

    sessionStorage.removeItem('alphaChess.openAtFen');
    sessionStorage.removeItem('alphaChess.openFreePlay');
    sessionStorage.removeItem('alphaChess.openAtColor');
    sessionStorage.removeItem('alphaChess.openAtPath');
    sessionStorage.removeItem('alphaChess.openAtRootFen');

    const matches = repertoireService.findRepsByFen(fen, color);

    if (matches.length === 0) {
      useChessStore.setState({ boardFlipped: color === 'b' });
      repertoireService.resetFreePlay(fen, color, path, rootFen);
      openModal({ type: 'new-repertoire', initialMode: 'current', initialColor: color });
    } else if (matches.length === 1) {
      repertoireService.navigateToNode(matches[0].nodeId);
    } else {
      openModal({ type: 'select-repertoire', repChoices: matches });
    }
  }, [openModal]);

  /* ── Analyse (désactivée pendant l'entraînement) ────────── */
  const chess         = useChessStore((s) => s.chess);
  const isEnabled     = useAnalysisStore((s) => s.isEnabled);
  const evaluateFen   = useAnalysisStore((s) => s.evaluateFen);
  const trainingPhase = useTrainingStore((s) => s.phase);

  useEffect(() => {
    if (!isEnabled) return;
    if (trainingPhase !== 'idle') return;
    evaluateFen(chess.fen());
  }, [chess, isEnabled, evaluateFen, trainingPhase]);

  /* ── Navigation clavier ← → ─────────────────────────────────── */

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showSplash) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); repertoireService.navBack(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); repertoireService.navForward(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showSplash]);

  /* ── Board theme → EngineArrows ─────────────────────────────── */
  const boardTheme  = useChessStore((s) => s.boardTheme);
  const boardFlipped = useChessStore((s) => s.boardFlipped);
  const results     = useAnalysisStore((s) => s.results);
  const settings    = useAnalysisStore((s) => s.settings);

  return (
    <div id="view-app">
      {showSplash && <SplashScreen />}
      <ToastContainer />

      <div className="main-layout">
        {/* ── Colonne gauche : répertoires + arbre ─── */}
        <aside className="left-panel">
          <Sidebar />
        </aside>

        {/* ── Zone centrale : échiquier ──────────────── */}
        <section className="board-area">
          <TrainingBanner />

          {/* board-panel : flex-column, aligne et centre board-shell + board-controls */}
          <div className="board-panel">
            <div className="board-shell">
              <div style={{ position: 'relative', gridColumn: 1, gridRow: 1 }}>
                <Board />
                {trainingPhase === 'idle' && (
                <EngineArrows
                  results={results}
                  boardFlipped={boardFlipped}
                  arrowCount={settings.arrowCount}
                  boardTheme={boardTheme}
                  showArrows={settings.showArrows && isEnabled}
                />
                )}
              </div>
              <EvalBarConnected />
            </div>

            <BoardControls />
          </div>
        </section>

        {/* ── Colonne droite : monitor / analyse / stats ─── */}
        <aside className="right-panel">
          <RightPanel />
        </aside>
      </div>
    </div>
  );
}
