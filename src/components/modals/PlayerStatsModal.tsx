import { useRef, useState } from 'react';
import { useUiStore } from '@/stores/uiStore';
import { useStatsStore } from '@/stores/statsStore';
import { useChessStore } from '@/stores/chessStore';
import { useAnimatedCounter } from '@/hooks/useAnimatedCounter';
import { ModalBox } from './ModalBox';
import { fetchPlayerStats, fetchPlayerStatsBatch } from '@/services/stats';
import { resetFreePlay } from '@/services/repertoire';
import type { LichessStats } from '@/types/stats';
import type { Color } from '@/types/chess';

const TIME_CLASS_OPTIONS = [
  { value: 'all',    label: 'Toutes' },
  { value: 'bullet', label: 'Bullet' },
  { value: 'blitz',  label: 'Blitz' },
  { value: 'rapid',  label: 'Rapide' },
  { value: 'daily',  label: 'Correspondance' },
];

export function PlayerStatsModal() {
  const closeModal = useUiStore((s) => s.closeModal);

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

  const [loading, setLoading]     = useState(false);
  const [progress, setProgress]   = useState(0);
  const [loadingPhase, setLoadingPhase] = useState<'idle' | 'conn' | 'load' | 'blunders' | 'done'>('idle');
  const [gamesTarget, setGamesTarget]   = useState(0);
  const [error, setError]         = useState('');
  const animatedGames = useAnimatedCounter(gamesTarget);

  const abortRef = useRef<AbortController | null>(null);
  const archiveStartedRef = useRef(false);
  const rafRef = useRef(0);

  async function handleSubmit() {
    const trimmedUser = username.trim();
    if (!trimmedUser) { setError('Le pseudo Chess.com est requis.'); return; }

    setError('');
    setLoading(true);
    setProgress(0);
    setLoadingPhase('conn');
    setGamesTarget(0);
    archiveStartedRef.current = false;

    const abortCtrl = new AbortController();
    abortRef.current = abortCtrl;

    const animStart = performance.now();
    const CONN_DURATION = 5000;

    const connLoop = (now: number) => {
      if (archiveStartedRef.current) { cancelAnimationFrame(rafRef.current); return; }
      const elapsed = now - animStart;
      setProgress(Math.min((elapsed / CONN_DURATION) * 20, 20));
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

    const onProgress = (p: { current: number; total: number; gamesInArchive: number }) => {
      if (!archiveStartedRef.current) {
        archiveStartedRef.current = true;
        cancelAnimationFrame(rafRef.current);
        setLoadingPhase('load');
      }
      setProgress(20 + Math.round((p.current / p.total) * 65));
      setGamesTarget((prev) => prev + p.gamesInArchive);
    };

    try {
      // Reposition board to start
      const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      resetFreePlay(START_FEN, color as Color);
      const store = useStatsStore.getState();
      store.setLastStatsRequestKey('');

      const fen = START_FEN;
      const normFen = fen.split(' ').slice(0, 3).join(' ');
      const cacheKey = `${normFen}|player|${trimmedUser}|${color}|${timeClass}|${dateFrom}-${dateTo}|${playerEloMin}-${playerEloMax}`;

      // Check front-end cache first
      if (store.statsCache[cacheKey] !== undefined) {
        cancelAnimationFrame(rafRef.current);
        store.setFilters({ currentDatabase: 'player', ...newFilters, eloPanelOpen: false });
        store.setLichessStats(store.statsCache[cacheKey]);
        store.setLastStatsRequestKey(cacheKey);
        store.setSelectedUci('');
        store.setData(store.statsCache[cacheKey] as LichessStats | null);
        store.setLoading(false);
        closeModal();
        return;
      }

      const stats = await fetchPlayerStats(fen, newFilters, abortCtrl.signal, onProgress);

      cancelAnimationFrame(rafRef.current);
      setProgress(85);
      setLoadingPhase('blunders');

      // Pre-cache other positions for instant navigation after modal close
      const allFens = new Set<string>();
      const chess = useChessStore.getState().chess;
      const legalMoves = chess.moves({ verbose: true }) as Array<{ san: string }>;
      for (const m of legalMoves) {
        chess.move(m.san);
        allFens.add(chess.fen());
        chess.undo();
      }
      allFens.delete(fen);
      if (allFens.size > 0) {
        const s = useStatsStore.getState();
        await Promise.race([
          fetchPlayerStatsBatch([...allFens], newFilters).then((result: Record<string, unknown>) => {
            for (const [f, st] of Object.entries(result)) {
              const nf = f.split(' ').slice(0, 3).join(' ');
              const bKey = `${nf}|player|${trimmedUser}|${color}|${timeClass}|${dateFrom}-${dateTo}|${playerEloMin}-${playerEloMax}`;
              if (s.statsCache[bKey] === undefined) s.statsCache[bKey] = st;
            }
          }).catch(() => {}),
          new Promise((r) => setTimeout(r, 30000)),
        ]);
      }

      setProgress(100);
      setLoadingPhase('done');
      await new Promise((r) => setTimeout(r, 400));

      const store2 = useStatsStore.getState();
      store2.setFilters({ currentDatabase: 'player', ...newFilters, eloPanelOpen: false });
      store2.setLichessStats(stats);
      store2.setLastStatsRequestKey(cacheKey);
      store2.setSelectedUci('');
      store2.setStatsCacheEntry(cacheKey, stats);
      store2.setData(stats as LichessStats | null);
      store2.setLoading(false);

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
            {loadingPhase === 'conn' && 'Connexion au serveur…'}
            {loadingPhase === 'load' && `${animatedGames} partie${animatedGames > 1 ? 's' : ''} chargée${animatedGames > 1 ? 's' : ''}`}
            {loadingPhase === 'blunders' && 'Calcul des blunders…'}
            {loadingPhase === 'done' && 'Terminé ✓'}
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

