import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { useReportStore } from '@/stores/reportStore';
import { fetchChesscomReport, saveReportToServer, fetchSavedReportById } from '@/services/report';
import { ensureOpeningsLoaded } from '@/services/openings';
import { useAnimatedCounter } from '@/hooks/useAnimatedCounter';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { SplashScreen } from '@/components/layout/SplashScreen';
import { ReportForm } from './ReportForm';
import { ReportResults } from './ReportResults';
import { ReportSavedList } from './ReportSavedList';

const LOADING_MESSAGES = [
  'Premier scan en cours',
  'Récupération des parties',
  'Répartitions des statistiques',
  'On y est presque..',
];

export const ReportPage = React.memo(function ReportPage() {
  const { view, params, data, error, setView, setParams, setData, setError, reset } = useReportStore();
  const user = useAuthStore((s) => s.user);
  const isGuestMode = useAuthStore((s) => s.isGuestMode);
  const token = useAuthStore((s) => s.token);
  const [loadingPct, setLoadingPct] = useState(0);
  const [loadingPhase, setLoadingPhase] = useState<'idle' | 'conn' | 'load' | 'blunders' | 'done'>('idle');
  const [gamesTarget, setGamesTarget] = useState(0);
  const animatedGames = useAnimatedCounter(gamesTarget);
  const [statusMsgIdx, setStatusMsgIdx] = useState(0);
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const rafRef = useRef(0);
  const archiveStartedRef = useRef(false);

  useEffect(() => {
    if (loadingPhase === 'load' && gamesTarget === 0) {
      statusIntervalRef.current = setInterval(() => {
        setStatusMsgIdx((prev) => Math.min(prev + 1, 3));
      }, 5000);
    } else {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = null;
      }
      setStatusMsgIdx(0);
    }
    return () => {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = null;
      }
    };
  }, [loadingPhase, gamesTarget]);

  const openModal = useUiStore((s) => s.openModal);

  useEffect(() => {
    if (view !== 'loading') return;
    window.history.pushState(null, '', window.location.href);
    const onPopState = () => {
      openModal({
        type: 'training-interrupt' as const,
        title: 'Quitter la page ?',
        message: 'Un rapport est en cours de génération. Voulez-vous l\'interrompre ?',
        onConfirm: () => {
          cancelAnimationFrame(rafRef.current);
          abortRef.current?.abort();
          reset();
          window.history.back();
        },
      });
      window.history.pushState(null, '', window.location.href);
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('popstate', onPopState);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [view, openModal, reset]);

  const handleSubmit = useCallback(async () => {
    if (!params.username.trim()) {
      setError('Veuillez entrer un pseudo Chess.com.');
      return;
    }
    if (params.startFen) {
      try { new Chess(params.startFen); } catch {
        setError('La position fournie n\'est pas une FEN valide.');
        return;
      }
    }

    setError(null);
    setLoadingPct(0);
    setLoadingPhase('conn');
    setGamesTarget(0);
    archiveStartedRef.current = false;
    setView('loading');

    abortRef.current = new AbortController();
    useReportStore.getState().setAbortController(abortRef.current);
    const signal = abortRef.current.signal;

    const CONN_DURATION = 5000;
    const animStart = performance.now();

    const connLoop = (now: number) => {
      const elapsed = now - animStart;
      const connPct = Math.min((elapsed / CONN_DURATION) * 20, 20);
      setLoadingPct((prev) => Math.max(prev, connPct));
      if (elapsed < CONN_DURATION) rafRef.current = requestAnimationFrame(connLoop);
    };
    rafRef.current = requestAnimationFrame(connLoop);

    try {
      const result = await fetchChesscomReport(params, (evt) => {
        if (evt.type === 'archive') {
          if (!archiveStartedRef.current) {
            archiveStartedRef.current = true;
          }
          const pct = 20 + Math.round(((evt.current ?? 0) / (evt.total ?? 1)) * 65);
          setLoadingPct(pct);
          setLoadingPhase('load');
          setGamesTarget((prev) => prev + (evt.gamesInArchive ?? 0));
        }
      }, signal);

      cancelAnimationFrame(rafRef.current);

      setLoadingPhase('blunders');

      const blunderStart = performance.now();
      await new Promise<void>((resolve) => {
        const blunderLoop = (now: number) => {
          const t = Math.min((now - blunderStart) / 1500, 1);
          setLoadingPct(85 + t * 15);
          if (t >= 1) resolve();
          else requestAnimationFrame(blunderLoop);
        };
        requestAnimationFrame(blunderLoop);
      });

      await ensureOpeningsLoaded();
      setLoadingPct(100);
      setLoadingPhase('done');

      await new Promise((r) => setTimeout(r, 400));
      setData(result);
      setView('results');
      saveReportToServer(params, result).catch((err) =>
        console.warn('[auto-save] Échec sauvegarde rapport:', err)
      );
    } catch (err: unknown) {
      cancelAnimationFrame(rafRef.current);
      if (err instanceof DOMException && err.name === 'AbortError') return;
      let msg = err instanceof Error ? err.message : 'Erreur inconnue';
      if (err instanceof TypeError && msg === 'Failed to fetch') {
        msg = `Impossible de contacter le serveur (http://localhost:4000/api). Vérifiez que le backend est lancé.`;
      }
      setLoadingPct(0);
      setLoadingPhase('idle');
      await new Promise((r) => setTimeout(r, 600));
      setError(`Erreur : ${msg}`);
      setView('form');
    }
  }, [params, setView, setData, setError]);

  useEffect(() => {
    if (view !== 'results' || !isGuestMode) return;
    window.history.pushState(null, '', window.location.href);
    const onPopState = () => {
      openModal({
        type: 'training-interrupt' as const,
        title: 'Sauvegarder ce rapport ?',
        message: 'Vous êtes en mode invité. Connectez-vous pour sauvegarder ce rapport et le retrouver plus tard.',
        confirmLabel: 'Se connecter',
        cancelLabel: 'Quitter sans sauvegarder',
        onConfirm: () => {
          window.history.back();
          openModal({ type: 'auth' });
        },
        onCancel: () => {
          window.history.back();
        },
      });
      window.history.pushState(null, '', window.location.href);
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('popstate', onPopState);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [view, isGuestMode, openModal]);

  const handleCancel = useCallback(() => {
    openModal({
      type: 'training-interrupt',
      title: 'Annuler le rapport ?',
      message: 'Voulez-vous vraiment annuler la génération du rapport en cours ?',
      onConfirm: () => {
        cancelAnimationFrame(rafRef.current);
        abortRef.current?.abort();
        useReportStore.getState().setAbortController(null);
        reset();
      },
    });
  }, [openModal, reset]);

  const handleNewAnalysis = useCallback(() => {
    if (view === 'results' && isGuestMode) {
      openModal({
        type: 'training-interrupt' as const,
        title: 'Sauvegarder ce rapport ?',
        message: 'Vous êtes en mode invité. Connectez-vous pour sauvegarder ce rapport et le retrouver plus tard.',
        confirmLabel: 'Se connecter',
        cancelLabel: 'Quitter sans sauvegarder',
        onConfirm: () => {
          openModal({ type: 'auth' });
        },
        onCancel: () => {
          reset();
        },
      });
    } else {
      reset();
    }
  }, [view, isGuestMode, openModal, reset]);

  const handleLoadSaved = useCallback(async (id: number) => {
    try {
      const saved = await fetchSavedReportById(id);
      setParams(saved.params);
      setData(saved.data);
      await ensureOpeningsLoaded();
      setView('results');
    } catch {
      setError('Impossible de charger le rapport.');
    }
  }, [setParams, setData, setView, setError]);

  if (!user && !isGuestMode) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px 80px' }}>
        <SplashScreen />
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '32px 24px 80px',
      }}
    >
      <div
        style={{
          background: 'rgba(15,23,42,0.96)',
          borderBottom: '1px solid rgba(148,163,184,0.18)',
          padding: '0 24px',
          height: 56,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          margin: '-32px -24px 24px',
        }}
      >
        <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
          📊 Analyse des performances
        </span>
        <div style={{ flex: 1 }} />
        <span
          style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '.05em',
            padding: '2px 8px',
            borderRadius: 100,
            background: 'rgba(122,174,203,0.18)',
            color: '#7aaecb',
            border: '1px solid rgba(122,174,203,0.28)',
          }}
        >
          BÊTA
        </span>
      </div>

      {view === 'form' && (
        <>
          <ReportForm
            params={params}
            onParamsChange={setParams}
            onSubmit={handleSubmit}
            error={error}
          />
          {token && <ReportSavedList onLoad={handleLoadSaved} />}
        </>
      )}

      {view === 'loading' && (
        <div
          style={{
            background: 'rgba(17,24,39,0.96)',
            border: '1px solid rgba(148,163,184,0.18)',
            borderRadius: 10,
            padding: '48px 32px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>⚙️</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', marginBottom: 4 }}>
            Analyse en cours…
          </div>
          <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: 32 }}>
            {params.username} · {params.color === 'white' ? 'Blancs' : 'Noirs'}
          </div>

          <div
            style={{
              background: 'rgba(15,23,42,0.96)',
              border: '1px solid rgba(148,163,184,0.15)',
              borderRadius: 100,
              height: 10,
              overflow: 'hidden',
              marginBottom: 12,
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${loadingPct}%`,
                borderRadius: 100,
                background: loadingPct >= 100
                  ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                  : 'linear-gradient(90deg, #7aaecb, #818cf8)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>

          <div
            style={{
              fontSize: '0.8rem',
              color: '#94a3b8',
              minHeight: 20,
              marginBottom: 6,
            }}
          >
            {loadingPhase === 'conn' && 'Connexion au serveur…'}
            {loadingPhase === 'load' && gamesTarget === 0 && LOADING_MESSAGES[Math.min(statusMsgIdx, 3)]}
            {loadingPhase === 'load' && gamesTarget > 0 && `${Math.floor(animatedGames)} partie${Math.floor(animatedGames) > 1 ? 's' : ''} chargée${Math.floor(animatedGames) > 1 ? 's' : ''}`}
            {loadingPhase === 'blunders' && 'Calcul des blunders…'}
            {loadingPhase === 'done' && 'Terminé ✓'}
          </div>

          <button
            type="button"
            onClick={handleCancel}
            style={{
              background: 'none',
              border: '1px solid rgba(148,163,184,0.18)',
              color: '#94a3b8',
              padding: '7px 18px',
              borderRadius: 7,
              fontSize: '0.82rem',
              cursor: 'pointer',
              marginTop: 16,
            }}
          >
            Annuler
          </button>
        </div>
      )}

      {view === 'results' && data && (
        <ReportResults data={data} params={params} onNewAnalysis={handleNewAnalysis} />
      )}
    </div>
  );
});
