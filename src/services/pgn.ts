/**
 * Service PGN TypeScript — importe et parse des parties PGN
 * pour peupler le répertoire actif ou en créer un nouveau.
 *
 * Utilise @mliebelt/pgn-parser pour le parsing et appelle
 * repertoire.ts pour les mutations d'arbre.
 */
import { parse } from '@mliebelt/pgn-parser';
import type { Color } from '@/types/chess';
import {
  addMove,
  createNewRepertoire,
  selectRepertoire,
  getNode,
  _writeRepertoireSnapshot,
  initNodeMap,
  _incrementVersion,
} from '@/services/repertoire';
import { scheduleRepertoireSync } from '../bridge/auth';
import { useRepertoireStore } from '@/stores/repertoireStore';

// Déclaration de type minimal pour les moves du parser
interface PgnMove {
  notation?: { notation?: string };
  commentAfter?: string;
  commentMove?: string;
  nag?: string[];
  variations?: PgnMove[][];
  ravs?: Array<{ moves?: PgnMove[] }>;
}

/** Correspondance NAG → symbole d'annotation */
const NAG_MAP: Record<string, string> = {
  $1: '!',
  $2: '?',
  $3: '!!',
  $4: '??',
  $5: '!?',
  $6: '?!',
};

// ------------------------------------------------------------------
// Parsing PGN brut
// ------------------------------------------------------------------

/**
 * Parse un texte PGN et retourne le tableau de coups de la première partie.
 * Essaie d'abord la règle 'games', puis 'pgn' en fallback.
 * Lève une erreur si le PGN est invalide ou vide.
 */
export function importPGN(pgn: string): PgnMove[] {
  try {
    const games = parse(pgn.trim(), { startRule: 'games' }) as Array<{ moves?: PgnMove[] }>;
    const moves = games?.[0]?.moves;
    if (Array.isArray(moves) && moves.length > 0) return moves;
  } catch {
    // essai du fallback
  }

  try {
    const tree = parse(pgn.trim(), { startRule: 'pgn' }) as { moves?: PgnMove[] };
    const moves = tree?.moves;
    if (Array.isArray(moves) && moves.length > 0) return moves;
  } catch {
    // intentionnel
  }

  throw new Error('PGN invalide ou vide');
}

// ------------------------------------------------------------------
// Construction de l'arbre à partir d'une liste de coups
// ------------------------------------------------------------------

/**
 * Algorithme 2-passes miroir de importPgnVariationTree de repertoire.js :
 *  - Passe 1 (forward) : ligne principale
 *  - Passe 2 (reverse) : variations récursives
 *
 * @param moves   Tableau de PgnMove à intégrer
 * @param parentId  ID du nœud parent dans lequel greffer les coups
 */
export function importPgnVariationTree(moves: PgnMove[], parentId: string): void {
  const entries: Array<{ move: PgnMove; branchParentId: string }> = [];
  let currentParentId = parentId;

  // Passe 1 : ligne principale
  for (const move of moves) {
    const san = move?.notation?.notation;
    if (!san) continue;

    const branchParentId = currentParentId;

    // Extraire annotations avant de créer le nœud
    const rawComment = (move.commentAfter ?? move.commentMove ?? '').trim();
    let annotation = '';
    if (Array.isArray(move.nag) && move.nag.length > 0) {
      annotation = NAG_MAP[move.nag[0]!] ?? '';
    }

    const nextNode = addMove(branchParentId, san, {
      comment: rawComment || undefined,
      annotation: annotation || undefined,
    });

    if (!nextNode) continue;

    // Stop à la première transposition : le nœud ↪ est une feuille,
    // ses continuations appartiennent au nœud source.
    if (nextNode.isTransposition) break;

    entries.push({ move, branchParentId });
    currentParentId = nextNode.id;
  }

  // Passe 2 (reverse) : variations / RAVs
  for (let i = entries.length - 1; i >= 0; i--) {
    const { move, branchParentId } = entries[i]!;

    // Support des deux formats de variantes selon la version du parser
    const variationArrays: PgnMove[][] = [];

    if (Array.isArray(move.variations)) {
      for (const v of move.variations) {
        if (Array.isArray(v) && v.length > 0) variationArrays.push(v);
      }
    } else if (Array.isArray(move.ravs)) {
      for (const rav of move.ravs) {
        const ravMoves = (rav as { moves?: PgnMove[] }).moves;
        if (Array.isArray(ravMoves) && ravMoves.length > 0) variationArrays.push(ravMoves);
      }
    }

    for (const variation of variationArrays) {
      importPgnVariationTree(variation, branchParentId);
    }
  }
}

// ------------------------------------------------------------------
// Builders
// ------------------------------------------------------------------

/**
 * Construit un répertoire depuis les coups PGN parsés (mode pgn-file / pgn-text).
 * Désactive la sync pendant l'import puis l'active une fois terminé.
 */
export function buildRepertoireFromPgnMoves(
  moves: PgnMove[],
  fallbackName: string,
  color: Color = 'w',
  folderId: string | null = null,
): void {
  const store = useRepertoireStore.getState();
  store.setSuppressSync(true);
  store.setSuppressSnapshot(true);

  try {
    const newRep = createNewRepertoire(fallbackName, color, folderId);
    importPgnVariationTree(moves, newRep.id);
    _writeRepertoireSnapshot();
    initNodeMap();
    _incrementVersion();
    const idx = useRepertoireStore.getState().activeRepIndex;
    if (idx >= 0) selectRepertoire(idx);
  } finally {
    store.setSuppressSnapshot(false);
    store.setSuppressSync(false);
    scheduleRepertoireSync();
  }
}

/**
 * Construit un répertoire depuis une liste de SANs (mode 'current').
 * Chaque SAN est ajouté séquentiellement depuis la racine.
 */
export function buildRepertoireFromMoves(
  sans: string[],
  name: string,
  color: Color = 'w',
  folderId: string | null = null,
): void {
  const store = useRepertoireStore.getState();
  store.setSuppressSync(true);
  store.setSuppressSnapshot(true);

  try {
    const newRep = createNewRepertoire(name, color, folderId);
    let currentParentId = newRep.id;

    for (const san of sans) {
      const node = addMove(currentParentId, san);
      if (!node) throw new Error('Coup invalide : ' + san);
      currentParentId = node.id;
    }

    _writeRepertoireSnapshot();
    initNodeMap();
    _incrementVersion();
    const idx = useRepertoireStore.getState().activeRepIndex;
    if (idx >= 0) selectRepertoire(idx);
  } finally {
    store.setSuppressSnapshot(false);
    store.setSuppressSync(false);
    scheduleRepertoireSync();
  }
}

/**
 * Retourne la liste des SANs depuis la racine jusqu'au nœud courant (exclu).
 * Utile pour construire un répertoire depuis la position actuelle (mode 'current').
 */
export function getCurrentLineMoves(currentNodeId: string): string[] {
  const sans: string[] = [];
  let node = getNode(currentNodeId);
  // Remonter jusqu'à la racine (parentId === null)
  while (node && node.parentId) {
    sans.unshift(node.san);
    node = getNode(node.parentId);
  }
  return sans;
}
