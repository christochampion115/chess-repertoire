import { useEffect, useRef, useState } from 'react';
import { useUiStore } from '@/stores/uiStore';
import { useStatsStore } from '@/stores/statsStore';
import { useAuthStore } from '@/stores/authStore';

import { useAnimatedCounter } from '@/hooks/useAnimatedCounter';
import { ModalBox } from './ModalBox';
import { fetchPlayerStatsLoad, scheduleStatsReload } from '@/services/stats';

const LOADING_MESSAGES = [
  'Premier scan en cours',
  'Récupération des parties',
  'Répartitions des statistiques',
  'On y est presque..',
];

const TIME_CLASS_OPTIONS = [
  { value: 'all',    label: 'Toutes' },
  { value: 'bullet', label: 'Bullet' },
  { value: 'blitz',  label: 'Blitz' },
  { value: 'rapid',  label: 'Rapide' },
  { value: 'daily',  label: 'Correspondance' },
];

export function PlayerStatsModal() {
  const closeModal  = useUiStore((s) => s.closeModal);
  const openModal   = useUiStore((s) => s.openModal);

  const [username, setUsername]         = useState('');
  const [color, setColor]               = useState<'white' | 'black'>('white');
  const [timeClass, setTimeClass]       = useState('all');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [fromYear, setFromYear]         = useState('');
  const [fromMonth, setFromMonth]       = useState('');
  const [toYear, setToYear]             = useState('');
  const [toMonth, setToMonth]           = useState('');
  const [eloMin, setEloMin]             = useState('');
  const [eloMax, setEloMax]             = useState('');

  const [loading, setLoading]           = useState(false);
  const [progress, setProgress]         = useState(0);
  const [loadingPhase, setLoadingPhase] = useState<'idle' | 'conn' | 'archive' | 'positions' | 'done'>('idle');
  const [gamesTarget, setGamesTarget]   = useState(0);
  const [positionsCurrent, setPositionsCurrent] = useState(0);
  const [positionsTotal, setPositionsTotal]     = useState(0);
  const [error, setError]               = useState('');
  const animatedGames = useAnimatedCounter(gamesTarget);

  const [statusMsgIdx, setStatusMsgIdx] = useState(0);
  const statusIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const abortRef          = useRef<AbortController | null>(null);
  const archiveStartedRef = useRef(false);
  const rafRef            = useRef(0);

  useEffect(() => {
    if (loadingPhase === 'archive' && gamesTarget === 0) {
      statusIntervalRef.current = setInterval(() => {
        setStatusMsgIdx((prev) => Math.min(prev + 1, 3));
      }, 5000);
    } else {
      clearInterval(statusIntervalRef.current);
      setStatusMsgIdx(0);
    }
    return () => clearInterval(statusIntervalRef.current);
  }, [loadingPhase, gamesTarget]);

  const token = useAuthStore.getState().token;

  async function handleSubmit() {
    const trimmedUser = username.trim();
    if (!trimmedUser) { setError('Le pseudo Chess.com est requis.'); return; }

    setError('');
    setLoading(true);
    setProgress(0);
    setLoadingPhase('conn');
    setGamesTarget(0);
    setPositionsCurrent(0);
    setPositionsTotal(0);
    archiveStartedRef.current = false;

    const abortCtrl = new AbortController();
    abortRef.current = abortCtrl;

    const animStart = performance.now();
    const CONN_DURATION = 5000;

    const connLoop = (now: number) => {
      if (archiveStartedRef.current) { cancelAnimationFrame(rafRef.current); return; }
      const elapsed = now - animStart;
      setProgress(Math.min(Math.round((elapsed / CONN_DURATION) * 10), 10));
      if (elapsed < CONN_DURATION) rafRef.current = requestAnimationFrame(connLoop);
    };
    rafRef.current = requestAnimationFrame(connLoop);

    const dateFrom = (fromYear && fromMonth) ? `${fromYear}/${fromMonth}` : '';
    const dateTo   = (toYear && toMonth)     ? `${toYear}/${toMonth}`     : '';
    const rawMin   = parseInt(eloMin || '0',    10);
    const rawMax   = parseInt(eloMax || '3000', 10);
    const playerEloMin = Number.isFinite(rawMin) ? Math.min(3000, Math.max(0, rawMin)) : 0;
    const playerEloMax = Number.isFinite(rawMax) ? Math.min(3000, Math.max(0, rawMax)) : 3000;

    const newFilters = {
      playerUsername: trimmedUser,
      playerColor: color,
      playerTimeClass: timeClass,
      playerDateFrom: dateFrom,
      playerDateTo: dateTo,
      playerEloMin,
      playerEloMax,
    };

    const onArchive = (data: { current: number; total: number; gamesInArchive: number }) => {
      if (!archiveStartedRef.current) {
        archiveStartedRef.current = true;
        cancelAnimationFrame(rafRef.current);
        setLoadingPhase('archive');
      }
      setProgress(10 + Math.round((data.current / data.total) * 65));
      setGamesTarget((prev) => prev + data.gamesInArchive);
    };

    const onPositions = (data: { current: number; total: number }) => {
      setLoadingPhase('positions');
      setProgress(75 + Math.round((data.current / data.total) * 20));
      setPositionsCurrent(data.current);
      setPositionsTotal(data.total);
    };

    try {
      const result = await fetchPlayerStatsLoad(newFilters, abortCtrl.signal, onArchive, onPositions);

      cancelAnimationFrame(rafRef.current);
      setProgress(100);
      setLoadingPhase('done');

      await new Promise((r) => setTimeout(r, 400));

      const store = useStatsStore.getState();
      store.setSavedPlayerStats({ cacheKey: result.cacheKey, filters: newFilters, createdAt: new Date().toISOString() });
      store.setFilters({ currentDatabase: 'player', ...newFilters, eloPanelOpen: false });
      scheduleStatsReload(); // force=true, bypass stale statsCache

      closeModal();
    } catch (err: unknown) {
      cancelAnimationFrame(rafRef.current);
      if (abortCtrl.signal.aborted) return;
      setProgress(0);
      setLoadingPhase('idle');
      setLoading(false);
      setError((err instanceof Error ? err.message : null) || 'Erreur de chargement.');
    }
  }

  function handleAbort() {
    cancelAnimationFrame(rafRef.current);
    abortRef.current?.abort();
    setLoading(false);
    setProgress(0);
    setLoadingPhase('idle');
  }

  function handleClose() {
    if (!loading) closeModal();
  }

  if (!token) {
    return (
      <ModalBox title="Statistiques joueur (Chess.com)" onClose={closeModal}>
        <div className="ps-form">
          <p className="ps-form__hint">Connexion requise pour charger les statistiques joueur.</p>
          <div className="modal-actions">
            <button className="ctrl-btn" onClick={closeModal}>Fermer</button>
            <button
              className="ctrl-btn ctrl-btn--primary"
              onClick={() => { openModal({ type: 'auth' }); closeModal(); }}
            >
              Se connecter
            </button>
          </div>
        </div>
      </ModalBox>
    );
  }

  return (
    <ModalBox title="Statistiques joueur (Chess.com)" onClose={handleClose}>
      {loading ? (
        <div className="ps-progress">
          <p className="ps-progress__title">Chargement des parties de @{username}…</p>
          <div className="ps-progress__bar-wrap">
            <div
              className="ps-progress__bar-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="ps-progress__step">
            {loadingPhase === 'conn'      && 'Connexion au serveur…'}
            {loadingPhase === 'archive' && gamesTarget === 0 && LOADING_MESSAGES[Math.min(statusMsgIdx, 3)]}
            {loadingPhase === 'archive' && gamesTarget > 0 && `${Math.floor(animatedGames)} partie(s) chargée(s)`}
            {loadingPhase === 'positions' && `Précalcul des positions… (${positionsCurrent} / ${positionsTotal})`}
            {loadingPhase === 'done'      && 'Terminé ✓'}
          </p>
          <div className="modal-actions">
            <button className="ctrl-btn ctrl-btn--danger" onClick={handleAbort}>
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <div className="ps-form">
          <div className="ps-form__field">
            <label className="ps-form__label" htmlFor="ps-username">Pseudo Chess.com</label>
            <input
              id="ps-username"
              className="ps-form__input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              placeholder="ex: Hikaru"
              autoFocus
            />
          </div>

          <div className="ps-form__field">
            <span className="ps-form__label">Couleur analysée</span>
            <div className="ps-form__color-row">
              <label className={`ps-form__color-btn${color === 'white' ? ' active' : ''}`}>
                <input
                  type="radio"
                  value="white"
                  checked={color === 'white'}
                  onChange={() => setColor('white')}
                />
                ♔ Blancs
              </label>
              <label className={`ps-form__color-btn${color === 'black' ? ' active' : ''}`}>
                <input
                  type="radio"
                  value="black"
                  checked={color === 'black'}
                  onChange={() => setColor('black')}
                />
                ♚ Noirs
              </label>
            </div>
          </div>

          <div className="ps-form__field">
            <label className="ps-form__label" htmlFor="ps-timeclass">Cadence</label>
            <select
              id="ps-timeclass"
              className="ps-form__select"
              value={timeClass}
              onChange={(e) => setTimeClass(e.target.value)}
            >
              {TIME_CLASS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <button
            className="ps-form__advanced-toggle"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? '▾' : '▸'} Filtres avancés
          </button>

          {showAdvanced && (
            <div className="ps-form__advanced">
              <div className="ps-form__field">
                <span className="ps-form__label">Date de début (AAAA / MM)</span>
                <div className="ps-form__row">
                  <input
                    className="ps-form__input"
                    type="text"
                    placeholder="2023"
                    value={fromYear}
                    onChange={(e) => setFromYear(e.target.value)}
                    maxLength={4}
                  />
                  <input
                    className="ps-form__input"
                    type="text"
                    placeholder="01"
                    value={fromMonth}
                    onChange={(e) => setFromMonth(e.target.value)}
                    maxLength={2}
                  />
                </div>
              </div>
              <div className="ps-form__field">
                <span className="ps-form__label">Date de fin (AAAA / MM)</span>
                <div className="ps-form__row">
                  <input
                    className="ps-form__input"
                    type="text"
                    placeholder="2024"
                    value={toYear}
                    onChange={(e) => setToYear(e.target.value)}
                    maxLength={4}
                  />
                  <input
                    className="ps-form__input"
                    type="text"
                    placeholder="12"
                    value={toMonth}
                    onChange={(e) => setToMonth(e.target.value)}
                    maxLength={2}
                  />
                </div>
              </div>
              <div className="ps-form__field">
                <span className="ps-form__label">Elo adversaire (min – max)</span>
                <div className="ps-form__row">
                  <input
                    className="ps-form__input"
                    type="number"
                    placeholder="0"
                    value={eloMin}
                    onChange={(e) => setEloMin(e.target.value)}
                    min={0}
                    max={3000}
                  />
                  <input
                    className="ps-form__input"
                    type="number"
                    placeholder="3000"
                    value={eloMax}
                    onChange={(e) => setEloMax(e.target.value)}
                    min={0}
                    max={3000}
                  />
                </div>
              </div>
            </div>
          )}

          {error && <p className="ps-form__error">{error}</p>}

          <p className="ps-form__hint">
            Première analyse : 30–60 secondes selon l'historique.
          </p>

          <div className="modal-actions">
            <button className="ctrl-btn" onClick={closeModal}>Annuler</button>
            <button className="ctrl-btn ctrl-btn--primary" onClick={handleSubmit}>
              Charger les parties →
            </button>
          </div>
        </div>
      )}
    </ModalBox>
  );
}

