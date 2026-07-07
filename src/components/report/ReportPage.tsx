import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { useSearchParams } from 'react-router-dom';
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
import { btnSecondary } from './reportStyles';
import './report.css';

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
  const [searchParams] = useSearchParams();
  const [loadingPct, setLoadingPct] = useState(0);
  const [loadingPhase, setLoadingPhase] = useState<'idle' | 'conn' | 'load' | 'blunders' | 'done'>('idle');
  const [formTab, setFormTab] = useState<'analyze' | 'saved'>(searchParams.get('tab') === 'saved' ? 'saved' : 'analyze');
  const [gamesTarget, setGamesTarget] = useState(0);
  const animatedGames = useAnimatedCounter(gamesTarget);
  const [statusMsgIdx, setStatusMsgIdx] = useState(0);
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const rafRef = useRef(0);
  const archiveStartedRef = useRef(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

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
      setSaveStatus('saving');
      try {
        const saveResult = await saveReportToServer(params, result);
        if (saveResult?.missingAuth) {
          setSaveStatus('idle');
        } else {
          setSaveStatus('saved');
        }
      } catch {
        setSaveStatus('error');
      }
    } catch (err: unknown) {
      cancelAnimationFrame(rafRef.current);
      if (err instanceof DOMException && err.name === 'AbortError') return;
      let msg = err instanceof Error ? err.message : 'Erreur inconnue';
      if (err instanceof TypeError && msg === 'Failed to fetch') {
        msg = import.meta.env.DEV
          ? `Impossible de contacter le serveur (http://localhost:4000/api). Vérifiez que le backend est lancé.`
          : `Impossible de contacter le serveur. Vérifiez votre connexion.`;
      }
      setLoadingPct(0);
      setLoadingPhase('idle');
      await new Promise((r) => setTimeout(r, 600));
      setError(msg);
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
      <div className="report-page-root" style={{ padding: '32px 24px 80px' }}>
        <SplashScreen />
      </div>
    );
  }

  return (
    <div className="report-page-root" style={{ padding: '24px 24px 40px' }}>

      <div className="report-page-header">
        <span className="report-page-header-label" style={{ fontSize: '1.05rem', color: '#e2e8f0' }}>
          {view === 'results' && params.username ? `Rapport : ${params.username}` : 'Rapport'}
        </span>
      </div>

      {view === 'form' && (
        <>
          <div className="report-tabs">
            <button
              type="button"
              className={`report-tab${formTab === 'analyze' ? ' active' : ''}`}
              onClick={() => setFormTab('analyze')}
            >
              Analyser
            </button>
            {token && (
              <button
                type="button"
                className={`report-tab${formTab === 'saved' ? ' active' : ''}`}
                onClick={() => setFormTab('saved')}
              >
                Mes rapports
              </button>
            )}
          </div>
          {(formTab === 'analyze' || !token) && (
            <ReportForm
              params={params}
              onParamsChange={setParams}
              onSubmit={handleSubmit}
              error={error}
            />
          )}
          {formTab === 'saved' && token && (
            <ReportSavedList onLoad={handleLoadSaved} />
          )}
        </>
      )}

      {view === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 48, padding: '120px 0', width: '100%', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>
            <div className="report-loading-knight" style={{ fontSize: '4.5rem' }}>♞</div>
            <div className="report-loading-knight" style={{ fontSize: '4.5rem', animationDelay: '0.15s' }}>♞</div>
            <div className="report-loading-knight" style={{ fontSize: '4.5rem', animationDelay: '0.3s' }}>♞</div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f8fafc' }}>
              Analyse en cours…
            </div>
            <div style={{ fontSize: '1rem', color: '#94a3b8', marginTop: 6 }}>
              {params.username} · {params.color === 'white' ? 'Blancs' : 'Noirs'}
            </div>
          </div>

          <div style={{ width: '100%', padding: '0 24px' }}>
            <div
              style={{
                background: 'linear-gradient(160deg, rgba(15,25,50,0.6), rgba(8,16,29,0.7))',
                boxShadow: 'inset 0 1px 2px rgba(70,150,255,0.2)',
                borderRadius: 100,
                height: 16,
                overflow: 'hidden',
                width: '100%',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${loadingPct}%`,
                  borderRadius: 100,
                  background: loadingPct >= 100
                    ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                    : 'linear-gradient(90deg, #22D3EE, #6366F1)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>

            <div
              style={{
                fontSize: '0.9rem',
                color: '#94a3b8',
                minHeight: 22,
                marginTop: 14,
                textAlign: 'center',
              }}
            >
              {loadingPhase === 'conn' && 'Connexion au serveur…'}
              {loadingPhase === 'load' && gamesTarget === 0 && LOADING_MESSAGES[Math.min(statusMsgIdx, 3)]}
              {loadingPhase === 'load' && gamesTarget > 0 && `${Math.floor(animatedGames)} partie${Math.floor(animatedGames) > 1 ? 's' : ''} chargée${Math.floor(animatedGames) > 1 ? 's' : ''}`}
              {loadingPhase === 'blunders' && 'Calcul des blunders…'}
              {loadingPhase === 'done' && 'Terminé ✓'}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={handleCancel}
              className="rbtn-secondary"
              style={btnSecondary}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {view === 'results' && data && (
        <>
          {saveStatus === 'saving' && (
            <div style={{ textAlign: 'center', fontSize: '0.85rem', color: '#94a3b8', padding: '4px 0' }}>
              Sauvegarde automatique…
            </div>
          )}
          {saveStatus === 'saved' && (
            <div style={{ textAlign: 'center', fontSize: '0.85rem', color: '#22c55e', padding: '4px 0' }}>
              Rapport sauvegardé ✓
            </div>
          )}
          {saveStatus === 'error' && (
            <div style={{ textAlign: 'center', fontSize: '0.85rem', color: '#fb7185', padding: '4px 0' }}>
              Échec de la sauvegarde automatique
            </div>
          )}
          <ReportResults data={data} params={params} onNewAnalysis={handleNewAnalysis} />
        </>
      )}
    </div>
  );
});
