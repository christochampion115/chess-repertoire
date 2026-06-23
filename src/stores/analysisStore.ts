import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AnalysisLine, AnnotationData, AnalysisSettings } from '@/types/analysis';
import { StockfishWorker } from '@/engine/sf-worker';
import { useChessStore } from '@/stores/chessStore';

/** Taille max du cache LRU Stockfish */
const CACHE_MAX_SIZE = 500;

/**
 * Instance singleton du worker — module-level pour éviter la sérialisation
 * par Zustand. Initialisée par `initWorker()`, détruite par `disposeWorker()`.
 */
let _sfWorker: StockfishWorker | null = null;

/** Token incrémental pour filtrer les résultats obsolètes (comme annotationRunToken vanilla). */
let _lastEvalToken = 0;

/** Token pour éviter les re-entrées dans runChildAnnotations (navigation rapide). */
let _annotationRunToken = 0;

/** Dernier FEN évalué — évite de relancer si la position n'a pas changé. */
let _lastEvalFen = '';

// ── Throttle flèches (anti-scintillement UX) ────────────────────────────────
/** Intervalle minimum entre deux mises à jour des flèches (ms). */
const THROTTLE_ARROWS_MS = 500;
/** Timestamp du dernier flush vers Zustand. */
let _throttleLastFlush = 0;
/** Timer du flush trailing (garantit que le dernier résultat est toujours affiché). */
let _throttleTimer: ReturnType<typeof setTimeout> | null = null;
/** Buffer du dernier résultat calculé, en attente de flush. */
let _throttlePendingResults: AnalysisLine[] = [];
let _throttlePendingFen = '';
let _throttlePendingToken = 0;

interface AnalysisState {
  isEnabled: boolean;
  depth: number;
  results: AnalysisLine[];
  error: string | null;
  settings: AnalysisSettings;
  /**
   * Cache LRU : fen → lignes d'analyse.
   * Map mutable non-reactive (jamais rendu dans le JSX, uniquement lu en interne).
   */
  cache: Map<string, AnalysisLine[]>;
  /**
   * Annotations consolidées — remplace les trois maps parallèles de state.js :
   *   moveAnnotationScores + moveAnnotationValues + moveAnnotationPvs
   */
  annotations: Record<string, AnnotationData>;
  annotationsKey: string;
  annotationsVisibleKey: string;
  annotationsDepth: number;
  annotationsCount: number;
  annotationsLoading: boolean;
  annotationsComplete: boolean;
}

interface AnalysisActions {
  toggle: () => void;
  setDepth: (depth: number) => void;
  updateResults: (fen: string, results: AnalysisLine[]) => void;
  setError: (error: string | null) => void;
  updateSettings: (patch: Partial<AnalysisSettings>) => void;
  cacheResults: (fen: string, results: AnalysisLine[]) => void;
  getCached: (fen: string) => AnalysisLine[] | undefined;
  setAnnotations: (
    annotations: Record<string, AnnotationData>,
    key: string,
    depth: number,
  ) => void;
  setAnnotationsLoading: (loading: boolean) => void;
  setAnnotationsVisibleKey: (key: string) => void;
  clearAnnotations: () => void;
  /** Crée le Web Worker Stockfish (idempotent). Appelé dans AppLayout au montage. */
  initWorker: () => void;
  /** Libère le worker. Appelé dans le cleanup de AppLayout. */
  disposeWorker: () => void;
  /** Lance une évaluation pour la position FEN courante. No-op si désactivé. */
  evaluateFen: (fen: string) => void;
  /**
   * Évalue chaque position-fille (un coup appliqué à baseFen) individuellement
   * pour produire les afterWhiteCp utilisés par les vignettes de coups.
   * Appelée par CandidatesSection quand les données stats sont chargées.
   */
  runChildAnnotations: (baseFen: string, ucis: string[], depth: number) => Promise<void>;
}

const DEFAULT_SETTINGS: AnalysisSettings = {
  multiPV: 3,
  showArrows: true,
  arrowCount: 3,
};

export const useAnalysisStore = create<AnalysisState & AnalysisActions>()(
  persist(
    (set, get) => ({
      isEnabled: false,
      depth: 10,
      results: [],
      error: null,
      settings: DEFAULT_SETTINGS,
      cache: new Map(),
      annotations: {},
      annotationsKey: '',
      annotationsVisibleKey: '',
      annotationsDepth: 0,
      annotationsCount: 0,
      annotationsLoading: false,
      annotationsComplete: false,

      toggle: () => {
        const s = get();
        if (s.isEnabled) {
          _sfWorker?.stop();
          _lastEvalFen = '';
          if (_throttleTimer !== null) { clearTimeout(_throttleTimer); _throttleTimer = null; }
          _throttlePendingResults = [];
          set({ isEnabled: false, results: [], error: null });
          return;
        }
        // Initialiser le worker au premier toggle (lazy — évite le fetch WASM au démarrage)
        if (!_sfWorker) get().initWorker();
        _lastEvalToken++;
        _lastEvalFen = '';
        set({ isEnabled: true, results: [], error: null });
      },

      setDepth: (d) => {
        const clamped = Math.min(20, Math.max(5, d));
        const { isEnabled } = get();
        get().cache.clear();
        if (isEnabled && _sfWorker) {
          _lastEvalToken++;
          _lastEvalFen = '';
          const fen = useChessStore.getState().chess.fen();
          set({ depth: clamped, results: [] });
          _sfWorker.evaluate(fen, [], clamped, _lastEvalToken);
        } else {
          set({ depth: clamped });
        }
      },

      updateResults: (fen, results) => {
        set({ results, error: null });
        // Ne cacher que les résultats complets (depth atteint) pour éviter
        // la pollution du cache par des résultats intermédiaires interrompus.
        const targetDepth = get().depth;
        if (fen && results.length > 0 && (results[0]?.depth ?? 0) >= targetDepth) {
          get().cacheResults(fen, results);
        }
      },

      setError: (error) => set({ error }),

      updateSettings: (patch) => {
        const s = get();
        const next = { ...s.settings, ...patch };
        next.multiPV = Math.min(5, Math.max(1, next.multiPV));
        next.arrowCount = Math.min(next.multiPV, Math.max(1, next.arrowCount));
        const multiPVChanged = patch.multiPV !== undefined && patch.multiPV !== s.settings.multiPV;

        if (multiPVChanged && _sfWorker) {
          // Arrêter la recherche en cours, changer l'option, puis attendre
          // le readyok avant de relancer — évite l'état incohérent WASM.
          get().cache.clear();
          _sfWorker.stop();
          _sfWorker.setOption('MultiPV', next.multiPV);
          set({ settings: next, results: [] });
          if (s.isEnabled) {
            _lastEvalToken++;
            _lastEvalFen = '';
            const fen = useChessStore.getState().chess.fen();
            const token = _lastEvalToken;
            const depth = s.depth;
            _sfWorker.waitReady().then(() => {
              if (_sfWorker && get().isEnabled && token === _lastEvalToken) {
                _sfWorker.evaluate(fen, [], depth, token);
              }
            });
          }
        } else {
          set({ settings: next });
        }
      },

      cacheResults: (fen, results) => {
        const { cache } = get();
        if (cache.size >= CACHE_MAX_SIZE) {
          const firstKey = cache.keys().next().value;
          if (firstKey !== undefined) cache.delete(firstKey);
        }
        cache.set(fen, results);
      },

      getCached: (fen) => get().cache.get(fen),

      setAnnotations: (annotations, key, depth) =>
        set({
          annotations,
          annotationsKey: key,
          annotationsDepth: depth,
          annotationsCount: Object.keys(annotations).length,
          annotationsComplete: true,
          annotationsLoading: false,
        }),

      setAnnotationsLoading: (loading) => set({ annotationsLoading: loading }),

      setAnnotationsVisibleKey: (key) => set({ annotationsVisibleKey: key }),

      clearAnnotations: () =>
        set({
          annotations: {},
          annotationsKey: '',
          annotationsVisibleKey: '',
          annotationsDepth: 0,
          annotationsCount: 0,
          annotationsLoading: false,
          annotationsComplete: false,
        }),

      // ── Stockfish worker ────────────────────────────────────────────────

      initWorker: () => {
        if (_sfWorker) return;
        const { settings } = get();
        _sfWorker = new StockfishWorker(settings.multiPV);

        _sfWorker.onResult((msg) => {
          // Ignorer les résultats d'une évaluation précédente (obsolètes)
          if (msg.token !== _lastEvalToken) return;

          const { settings } = get();

          const uci = msg.pv.split(/\s+/)[0] ?? '';

          const line: AnalysisLine = {
            pv:    msg.pv,
            score: msg.score,
            depth: msg.depth,
            uci,
            mate:  msg.mate ?? undefined,
            mpvIndex: msg.mpvIndex,
          };

          // Mettre à jour le buffer en mémoire (sans déclencher de set() Zustand)
          const filtered = _throttlePendingResults.filter((l) => l.mpvIndex !== msg.mpvIndex);
          filtered.push(line);
          filtered.sort((a, b) => a.mpvIndex - b.mpvIndex);
          _throttlePendingResults = filtered.slice(0, settings.multiPV);
          _throttlePendingFen = _lastEvalFen;
          _throttlePendingToken = _lastEvalToken;

          // Throttle-leading + debounce-trailing :
          // – Leading  : flush immédiat si le dernier flush est vieux (≥ THROTTLE_ARROWS_MS)
          // – Trailing : timer garantissant que le DERNIER résultat est toujours affiché
          const now = Date.now();
          if (now - _throttleLastFlush >= THROTTLE_ARROWS_MS) {
            _throttleLastFlush = now;
            if (_throttleTimer !== null) { clearTimeout(_throttleTimer); _throttleTimer = null; }
            get().updateResults(_throttlePendingFen, _throttlePendingResults);
          } else {
            if (_throttleTimer !== null) clearTimeout(_throttleTimer);
            _throttleTimer = setTimeout(() => {
              _throttleTimer = null;
              if (_throttlePendingToken !== _lastEvalToken) return;
              _throttleLastFlush = Date.now();
              get().updateResults(_throttlePendingFen, _throttlePendingResults);
            }, THROTTLE_ARROWS_MS);
          }
        });

        _sfWorker.onError((message) => {
          set({ error: message });
          _sfWorker = null;
          _lastEvalFen = '';
          // Auto-restart après 2s si l'analyse est toujours activée
          setTimeout(() => {
            const { isEnabled, initWorker: init } = useAnalysisStore.getState();
            if (isEnabled && !_sfWorker) {
              useAnalysisStore.setState({ error: null });
              init();
            }
          }, 2000);
        });

        _sfWorker.onReady(() => {
          const { isEnabled, evaluateFen: evalFn } = get();
          if (isEnabled) {
            const fen = useChessStore.getState().chess.fen();
            evalFn(fen);
          }
        });
      },

      disposeWorker: () => {
        if (_throttleTimer !== null) { clearTimeout(_throttleTimer); _throttleTimer = null; }
        _throttlePendingResults = [];
        _sfWorker?.terminate();
        _sfWorker = null;
      },

      evaluateFen: (fen) => {
        const { isEnabled, depth } = get();
        if (!isEnabled || !_sfWorker) return;
        // Guard : ne pas relancer si les résultats sont déjà complets (depth atteint).
        // On utilise la profondeur et non results.length pour ne pas bloquer
        // sur des résultats partiels issus d'une évaluation interrompue.
        const currentResults = get().results;
        if (
          fen === _lastEvalFen &&
          currentResults.length > 0 &&
          (currentResults[0]?.depth ?? 0) >= depth
        ) return;
        // Vérifier le cache LRU avant d'envoyer au worker
        const cached = get().getCached(fen);
        if (cached !== undefined) {
          _lastEvalFen = fen;
          _lastEvalToken++;
          if (_throttleTimer !== null) { clearTimeout(_throttleTimer); _throttleTimer = null; }
          _throttlePendingResults = [];
          set({ results: cached.slice(0, get().settings.multiPV), error: null });
          return;
        }
        _lastEvalFen = fen;
        _lastEvalToken++;
        // Réinitialiser le throttle : le premier résultat de cette position
        // doit être affiché immédiatement (leading edge).
        if (_throttleTimer !== null) { clearTimeout(_throttleTimer); _throttleTimer = null; }
        _throttleLastFlush = 0;
        _throttlePendingResults = [];
        set({ results: [] });
        _sfWorker.evaluate(fen, [], depth, _lastEvalToken);
      },

      runChildAnnotations: async (baseFen, ucis, depth) => {
        if (!_sfWorker) return;
        const token = ++_annotationRunToken;
        const { annotateMoves } = await import('@/services/annotations');
        set({
          annotationsLoading: true,
          annotationsComplete: false,
          annotationsKey: baseFen,
          annotationsDepth: depth,
        });

        try {
          const values = await annotateMoves(_sfWorker, baseFen, ucis, depth, (uci, result) => {
            if (token !== _annotationRunToken) return; // obsolète, ne plus mettre à jour
            if (result.score !== null) {
              set((s) => ({
                annotations: {
                  ...s.annotations,
                  [uci]: { score: result.score, value: '', pv: result.pv ?? '', depth },
                },
              }));
            }
          });

          if (token !== _annotationRunToken) return; // obsolète, ne pas appliquer

          // Appliquer les résultats finaux
          const finalAnnotations: Record<string, AnnotationData> = {};
          for (const uci of ucis) {
            const val = values[uci];
            if (val.score !== null) {
              finalAnnotations[uci] = { score: val.score, value: '', pv: val.pv ?? '', depth };
            }
          }
          set({
            annotations: finalAnnotations,
            annotationsKey: baseFen,
            annotationsDepth: depth,
            annotationsCount: Object.keys(finalAnnotations).length,
            annotationsComplete: true,
          });
        } catch {
          // Erreur silencieuse — le prochain appel ou le refresh corrigera
        } finally {
          if (token === _annotationRunToken) {
            set({ annotationsLoading: false });
          }
          // Les annotations ont peut-être interrompu l'évaluation principale.
          // Forcer une ré-évaluation propre si l'analyse est toujours active.
          if (get().isEnabled && _sfWorker) {
            _lastEvalFen = '';
            get().evaluateFen(useChessStore.getState().chess.fen());
          }
        }
      },
    }),
    {
      name: 'alphaChess-analysis',
      // Ne persister que les settings utilisateur — pas le cache, résultats, annotations
      partialize: (s) => ({
        isEnabled: s.isEnabled,
        depth:     s.depth,
        settings:  s.settings,
      }),
    },
  ),
);

