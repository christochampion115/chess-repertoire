/**
 * Wrapper main-thread pour Stockfish 18.
 *
 * Charge stockfish-18-lite-single.js en Worker avec l'URL du WASM dans le hash
 * (comme dans l'original analysis.js), puis communique en UCI texte brut.
 * Parse les réponses textes en callbacks typés pour analysisStore.
 *
 * Protections anti-crash WASM :
 *  - Debounce 200ms sur evaluate() : évite les rafales stop/go lors de la
 *    navigation clavier rapide (cause principale de RuntimeError: unreachable)
 *  - Toujours envoyer 'stop' avant 'go' dans _doEvaluate() — même si le moteur
 *    n'est pas en train de chercher, un stop redondant est sans danger.
 *  - bestmove ne réinitialise pas isSearching : éviter la race où un bestmove
 *    d'une ancienne recherche arrive après le start d'une nouvelle.
 *  - pendingReadyResolvers / waitReady() : synchronisation isready/readyok
 *    après chaque setoption, comme dans analysis.js vanilla
 */
import type { WorkerOutMessage } from './types';

const DEBOUNCE_MS = 200;

type ResultCallback = (result: Extract<WorkerOutMessage, { type: 'result' }>) => void;
type ErrorCallback = (message: string) => void;
type ReadyCallback = () => void;

export class StockfishWorker {
  private readonly worker: Worker;
  private ready = false;
  private isSearching = false;
  private currentFen = '';
  private currentToken = 0;
  private pendingDepth = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingReadyResolvers: Array<() => void> = [];
  private onResultCb: ResultCallback | null = null;
  private onErrorCb: ErrorCallback | null = null;
  private onReadyCb: ReadyCallback | null = null;
  private _singleEvalResolve: ((value: { cp: number | null; mate: number | null }) => void) | null = null;
  private _singleEvalReject: ((reason: unknown) => void) | null = null;
  private _singleEvalLastCp: number | null = null;
  private _singleEvalLastMate: number | null = null;
  private _singleEvalLastPv: string | null = null;
  private _originalMultiPV = 0;

  constructor(multiPV = 3) {
    this._originalMultiPV = multiPV;
    // Files are in public/engine/ so Vite serves them as static assets
    // without any ESM transformation. Stockfish reads self.location.hash
    // to locate the WASM: pass it as the URL fragment. This is identical
    // to what js/analysis.js does and is the only approach that correctly
    // triggers Stockfish's "worker" init path (it checks
    //   self.location.hash.split(",")[1] === "worker"
    // which only resolves to true when Stockfish loads *itself* as a
    // nested worker — the first instantiation just needs the WASM URL
    // in position [0] of the hash).
    const workerUrl =
      '/engine/stockfish-18-lite-single.js#' +
      encodeURIComponent('/engine/stockfish.wasm');

    // String URL → Vite does NOT bundle/transform it (no import() or
    // new URL(..., import.meta.url) pattern).
    this.worker = new Worker(workerUrl);

    this.worker.onmessage = (e: MessageEvent<unknown>) => {
      const line = typeof e.data === 'string' ? e.data : '';
      if (!line) return;
      this.handleLine(line);
    };

    this.worker.onerror = (e) => {
      this.isSearching = false;
      this.onErrorCb?.(e.message ?? 'Stockfish worker error');
    };

    // UCI init — Stockfish responds 'readyok' once the WASM is compiled
    this.worker.postMessage('uci');
    this.worker.postMessage('setoption name Hash value 64');
    this.worker.postMessage(`setoption name MultiPV value ${multiPV}`);
    this.worker.postMessage('isready');
  }

  private handleLine(line: string): void {
    if (line === 'readyok') {
      this.ready = true;
      // Drainer les waitReady() en attente (prioritaire sur onReadyCb initial)
      if (this.pendingReadyResolvers.length > 0) {
        const resolvers = this.pendingReadyResolvers.splice(0);
        resolvers.forEach((r) => r());
        return;
      }
      this.onReadyCb?.();
      return;
    }

    // Mode single eval (annotations par-coup) — comme le vanilla evalFenAnnotation :
    // accumuler le dernier score cp/mate/pv des lignes info, résoudre sur bestmove
    if (this._singleEvalResolve) {
      if (line.startsWith('info')) {
        const cpM = line.match(/\bscore cp (-?\d+)/);
        const mateM = line.match(/\bscore mate (-?\d+)/);
        if (cpM) {
          this._singleEvalLastCp = parseInt(cpM[1]!, 10);
          this._singleEvalLastMate = null;
        } else if (mateM) {
          const mate = parseInt(mateM[1]!, 10);
          this._singleEvalLastCp = null;
          this._singleEvalLastMate = mate;
        }
        const pvM = line.match(/ pv ([\w\s]+)/);
        if (pvM) {
          this._singleEvalLastPv = pvM[1]!.trim();
        }
        return;
      }
      if (line.startsWith('bestmove')) {
        const resolve = this._singleEvalResolve;
        this._singleEvalResolve = null;
        this._singleEvalReject = null;
        const cp = this._singleEvalLastCp;
        const mate = this._singleEvalLastMate;
        const pv = this._singleEvalLastPv ?? null;
        this._singleEvalLastCp = null;
        this._singleEvalLastMate = null;
        this._singleEvalLastPv = null;
        resolve({ cp, mate, pv });
        return;
      }
      return; // ignorer currmove, nodes, nps, hashfull, etc.
    }

    // Fin de recherche (multi-PV normal) — ne pas réinitialiser isSearching ici
    // car un nouveau go peut avoir été envoyé avant que ce bestmove n'arrive.
    if (line.startsWith('bestmove')) {
      return;
    }

    // Ignorer les lignes qui ne sont pas des résultats d'analyse
    if (!line.startsWith('info') || !line.includes(' pv ')) return;

    const mpvM = line.match(/\bmultipv (\d+)/);
    const mpvIndex = mpvM ? parseInt(mpvM[1]!, 10) : 1;

    const cpM = line.match(/\bscore cp (-?\d+)/);
    const mateM = line.match(/\bscore mate (-?\d+)/);
    const depthM = line.match(/\bdepth (\d+)/);
    const pvM = line.match(/ pv ([\w\s]+)/);
    if (!pvM) return;

    const pv = pvM[1]!.trim();
    const firstUci = pv.split(/\s+/)[0] ?? '';
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(firstUci)) return;

    const sideToMove = this.currentFen.split(' ')[1] ?? 'w';
    const sign = sideToMove === 'w' ? 1 : -1;

    let score = 0;
    let mate: number | null = null;

    if (mateM) {
      mate = sign * parseInt(mateM[1]!, 10);
    } else if (cpM) {
      score = sign * parseInt(cpM[1]!, 10);
    }

    const depth = depthM ? parseInt(depthM[1]!, 10) : 0;

    this.onResultCb?.({
      type: 'result' as const,
      fen: this.currentFen,
      pv,
      score,
      depth,
      mate,
      mpvIndex,
      token: this.currentToken,
    });
  }

  /**
   * Planifie une évaluation avec un debounce de 200ms.
   * Si plusieurs appels arrivent dans la fenêtre, seul le dernier est exécuté.
   * Protège contre les rafales lors de la navigation clavier rapide.
   */
  evaluate(fen: string, _ucis: string[], depth: number, token = 0): void {
    // Mettre à jour les paramètres cibles sans déclencher immédiatement
    this.currentFen = fen;
    this.currentToken = token;
    this.pendingDepth = depth;

    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this._doEvaluate();
    }, DEBOUNCE_MS);
  }

  private _doEvaluate(): void {
    if (!this.ready) return;
    // Toujours envoyer stop avant go pour éviter l'état WASM incohérent
    // (RuntimeError: unreachable). Stockfish ignore un stop redondant si aucun
    // go n'est en cours, donc c'est sans risque.
    this.worker.postMessage('stop');
    this.worker.postMessage(`position fen ${this.currentFen}`);
    this.worker.postMessage(`go depth ${this.pendingDepth}`);
    this.isSearching = true;
  }

  stop(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.worker.postMessage('stop');
    this.isSearching = false;
  }

  setOption(name: string, value: string | number): void {
    this.worker.postMessage(`setoption name ${name} value ${value}`);
  }

  /**
   * Envoie 'isready' et attend le 'readyok' correspondant.
   * À utiliser après chaque setoption pour garantir la synchronisation
   * avant d'envoyer la prochaine commande.
   */
  waitReady(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.worker) {
        resolve();
        return;
      }
      this.pendingReadyResolvers.push(resolve);
      this.worker.postMessage('isready');
    });
  }

  onResult(cb: ResultCallback): void {
    this.onResultCb = cb;
  }

  onError(cb: ErrorCallback): void {
    this.onErrorCb = cb;
  }

  onReady(cb: ReadyCallback): void {
    if (this.ready) {
      cb();
      return;
    }
    this.onReadyCb = cb;
  }

  /**
   * Évalue une position unique (MultiPV=1) et retourne une Promise avec le score.
   * Arrête toute recherche en cours, bascule temporairement en MultiPV=1,
   * puis restaure la config d'origine après résolution.
   *
   * Le resolver (_singleEvalResolve) n'est installé qu'APRÈS avoir envoyé `go`,
   * pour éviter qu'un bestmove issu de la recherche précédente ne le déclenche.
   */
  evaluateSingle(fen: string, depth: number): Promise<{ cp: number | null; mate: number | null; pv: string | null }> {
    // Annuler tout debounce pending de evaluate()
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.currentFen = fen;
    this.currentToken = 0;

    // Phase 1 : arrêter, basculer en MultiPV=1, attendre readyok
    this.worker.postMessage('stop');
    this.isSearching = false;
    this.worker.postMessage('setoption name MultiPV value 1');

    const promise = new Promise<{ cp: number | null; mate: number | null; pv: string | null }>((resolve, reject) => {
      const startSearch = () => {
        // Nettoyer le callback ready pour éviter de resservir la même fonction
        if (this.onReadyCb === startSearch) this.onReadyCb = null;

        // Phase 2 : lancer la recherche
        this.worker.postMessage(`position fen ${fen}`);
        this.worker.postMessage(`go depth ${depth}`);
        this.isSearching = true;

        // Installer le resolver MAINTENANT — après le go.
        // Tout bestmove arrivé avant était de la recherche précédente et est ignoré.
        this._singleEvalResolve = resolve;
        this._singleEvalReject = reject;

        // Timeout de sécurité
        setTimeout(() => {
          if (this._singleEvalResolve) {
            this._singleEvalResolve = null;
            this._singleEvalReject = null;
            resolve({ cp: null, mate: null, pv: null });
          }
        }, 30000);
      };

      if (this.ready) {
        this.pendingReadyResolvers.push(startSearch);
      } else {
        this.onReadyCb = startSearch;
      }
      this.worker.postMessage('isready');
    });

    return promise.finally(() => {
      // Restaurer le MultiPV original
      this.worker.postMessage('setoption name MultiPV value ' + this._originalMultiPV);
      this.worker.postMessage('isready');
    });
  }

  terminate(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.isSearching = false;
    this.worker.postMessage('quit');
    this.worker.terminate();
  }
}
