/**
 * Protocole de messages du Web Worker Stockfish.
 *
 * MainThread → Worker : WorkerInMessage
 * Worker → MainThread : WorkerOutMessage
 */

export type WorkerInMessage =
  | { type: 'eval'; fen: string; ucis: string[]; depth: number }
  | { type: 'stop' };

export type WorkerOutMessage =
  | { type: 'result'; fen: string; pv: string; score: number; depth: number; mate?: number | null; mpvIndex: number; token: number }
  | { type: 'error'; message: string };

/** Union complète pour les cas où on ne distingue pas le sens */
export type WorkerMessage = WorkerInMessage | WorkerOutMessage;
