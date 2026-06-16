---
description: "Alpha Chess — types TypeScript, conventions Zustand, règles React. Document de référence (plus d'application automatique)."
---

# Alpha Chess — Conventions d'architecture

## Types fondamentaux (`src/types/chess.ts`)

```typescript
type File = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h';
type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
type Square = `${File}${Rank}`;
type Color = 'w' | 'b';
type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
interface Piece { color: Color; type: PieceType; square: Square }
type Board = (Piece | null)[][];
```

## RepertoireNode (`src/types/repertoire.ts`)

**IMPORTANT** : `parent` (référence récursive) est remplacé par `parentId: string | null`.
Ne jamais stocker de référence circulaire dans un store Zustand.

```typescript
type MedalTier = 'bronze' | 'silver' | 'gold' | 'platinum';

interface RepertoireNode {
  id: string;
  san: string;
  fen: string;
  parentId: string | null;   // PAS de référence récursive
  children: RepertoireNode[];
  moveNum: number;
  turn: Color;
  isTransposition?: boolean;
  sourceNodeId?: string | null;
  folderId?: string;
  trainingMedalTier?: MedalTier;
}
```

## Training (`src/types/training.ts`)

```typescript
type TrainingPhase = 'idle' | 'confirming' | 'active' | 'playing' | 'paused' | 'victory' | 'defeat';
type TrainingMode = 'survival' | 'vertical' | 'horizontal' | 'express' | 'randomizer';

interface SurvivalMistake { fen: string; expected: string; played: string }
interface SurvivalReport { mistakes: SurvivalMistake[]; score: number; mode: TrainingMode }
```

## Protocole Worker Stockfish (`src/engine/types.ts`)

```typescript
type WorkerMessage =
  | { type: 'eval'; fen: string; ucis: string[]; depth: number }
  | { type: 'stop' }
  | { type: 'result'; fen: string; pv: string; score: number; depth: number }
  | { type: 'error'; message: string };
```

## Modales — discriminated union (`src/types/ui.ts`)

```typescript
type ActiveModal =
  | { type: 'new-repertoire' }
  | { type: 'rename'; itemId: string }
  | { type: 'training-confirm'; rootId: string; mode: TrainingMode }
  | { type: 'training-victory'; report: SurvivalReport }
  | { type: 'training-defeat'; report: SurvivalReport }
  | { type: 'comment'; nodeId: string }
  | { type: 'board-theme' }
  | { type: 'auth' }
  | { type: 'profile' }
  | { type: 'player-stats' }
  | { type: 'medals' }
  | { type: 'delete-confirm'; itemId: string }
  | { type: 'name-variant'; nodeId: string }
  | { type: 'rename-folder'; folderId: string }
  | { type: 'account' }
  | null;
```

## Auth (`src/types/auth.ts`)

```typescript
interface User { id: string; username: string; email: string }
interface AuthState {
  user: User | null;
  token: string;
  status: 'guest' | 'logged' | 'loading';
  syncStatus: 'idle' | 'syncing' | 'error';
}
```

## Analyse (`src/types/analysis.ts`)

```typescript
interface AnalysisLine { pv: string; score: number; depth: number; uci: string }
interface AnnotationData { score: number; value: string; pv: string }
```

---

## 6 Stores Zustand (`src/stores/`)

### `chessStore.ts`
État : `chess` (instance chess.js), `selectedSq: Square | null`, `boardFlipped: boolean`, `pendingAnimation: string | null`
Actions : `flipBoard()`, `selectSquare(sq)`, `loadFen(fen)`, `reset()`

### `repertoireStore.ts`
État : `repertoires: Repertoire[]`, `activeRepIndex: number`, `treeExpanded: Set<string>`, `repExpanded: Set<string>`
**Sérialisation** : `Set<string>` → `string[]` pour localStorage (les `Set` ne sont pas JSON-sérialisables)
Actions : CRUD répertoire, gestion transpositions, toggle expand

### `trainingStore.ts`
Machine à états : `idle → confirming → active → playing → paused → victory / defeat`
État : `phase: TrainingPhase`, `mode: TrainingMode`, `lives: number`, `goldenHeart: boolean`, `mistakes: SurvivalMistake[]`, `feedback: 'correct' | 'wrong' | null`
**Timer autoplay** : toujours `useRef<ReturnType<typeof setTimeout>>` + cleanup dans `useEffect` return

### `analysisStore.ts`
État : `isEnabled: boolean`, `depth: number`, `results: AnalysisLine[]`, `error: string | null`, `annotations: Record<string, AnnotationData>`
**Cache LRU** : `Map<string, AnalysisLine[]>`, max 500 entrées, éviction manuelle (FIFO)
Actions : `toggle()`, `setDepth(n)`, `updateResults(fen, lines)`

### `statsStore.ts`
État : stats data, `filters: { elo: string; sort: string; database: string; player: string }`, `loading: boolean`, `error: string | null`
Actions : `fetch()`, `setFilter(key, value)`, `refresh()`

### `authStore.ts`
État : `user: User | null`, `token: string`, `status`, `syncStatus`
Actions : `login()`, `signup()`, `logout()`, `sync()`

---

## Règles TypeScript strict

- `strict: true` + `noUncheckedIndexedAccess: true` dans `tsconfig.json`
- Zéro `any` — utiliser `unknown` + type guard si nécessaire
- Tous les props de composants typés avec `interface` (pas `type` pour les props)
- Retour de fonction toujours annoté pour les fonctions publiques

## Règles React

- `React.memo` **obligatoire** sur : `Square`, `StatsRow`, `TreeNode` (composants feuilles rendus en boucle)
- `useMemo` pour `chess.board()` → `Board` (calcul coûteux)
- `useCallback` pour les handlers passés comme props à des composants mémoïsés
- `useTransition` pour les mises à jour de stats/analyse (non-urgentes)
- Jamais de `innerHTML` — toujours du JSX

## Variables d'environnement

- `window.ALPHA_CHESS_API_URL` (legacy) → `import.meta.env.VITE_API_URL`
- Définir dans `vite.config.ts` et `.env.local`
