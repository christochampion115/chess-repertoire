# Blundertale — Conventions & Architecture

## Stack
Vite 8.0.11 | React 19.2.0 | TypeScript 5.9 | Zustand 5 | React Router 7 | Vitest 4.1 | chess.js (npm ESM) | @mliebelt/pgn-parser 1.4.19 | ESLint 9 flat config

## Project Structure
```
src/
  services/    — logique métier (api, arbre, authService, stats, storage, training, repertoire, report, openings)
  stores/      — 8 stores Zustand (chess, repertoire, training, stats, analysis, auth, ui, report)
  components/  — React 19 (board, analysis, layout, modals, repertoire, report, stats, training)
  hooks/       — useDragPiece, useBoardAnimation, useStats, useTooltip, etc.
  types/       — chess, repertoire, training, stats, auth, analysis, ui, report
  utils/       — statsUtils, annotationStyle, format, pieceIcons
  engine/      — Web Worker Stockfish
```

## Key Architecture Decisions
- `navigateToNodeFen(node)` : set `chessStore.chess` + `repertoireStore.currentNodeId` + `version` + `expandPathToCurrentNode`
- `resetFreePlay(fen, color)` : crée nœud free-play root dans `nodeMap` + update `chessStore`/`repertoireStore`
- `checkTrainingMove` : import dynamique dans `repertoire.ts` (évite circularité repertoire ↔ training)
- Composants importent via `@/services/` pour la logique métier
- Dossier `bridge/` supprimé — plus aucune dépendance legacy

## Stores Overview
- **chessStore** : `chess` (instance chess.js), `selectedSq`, `boardFlipped`, `pendingAnimation`. Actions : `flipBoard`, `selectSquare`, `loadFen`, `reset`
- **repertoireStore** : `repertoires[]`, `activeRepIndex`, `currentNodeId`, `freePlayRoot`, `treeExpanded` (Set→string[] en localStorage), `version`. Actions : CRUD, transpositions, toggle expand
- **trainingStore** : Machine à états idle→confirming→active→playing→paused→victory/defeat. `phase`, `mode`, `lives`, `feedback`, `mistakes[]`
- **analysisStore** : `isEnabled`, `depth`, `results[]`, `annotations{}`. Cache LRU Map 500 entrées. Actions : `toggle`, `setDepth`, `updateResults`
- **statsStore** : `data`, `filters`, `loading`, `error`, `statsCache{}`, `lastStatsRequestKey`. Actions : `fetch`, `setFilter`, `refresh`
- **authStore** : `user`, `token`, `status` (guest/logged/loading), `syncStatus`. Actions : `login`, `signup`, `logout`, `sync`
- **uiStore** : `activeModal` (discriminated union 16 variants), `contextMenu`. Actions : `openModal`, `closeModal`, `openCtxMenu`
- **reportStore** : form params, loading, results, error

## Key Types (see `src/types/` for full definitions)
- `RepertoireNode` : `parentId: string | null` — PAS de référence parent récursive
- `TrainingPhase` / `TrainingMode` / `SurvivalMistake` / `SurvivalReport` — voir `training.ts`
- `ActiveModal` : discriminated union 16 variants — voir `ui.ts`
- `WorkerMessage` : eval/stop/result/error — voir `engine/types.ts`

## Coding Rules
- `strict: true` + `noUncheckedIndexedAccess: true`
- Zéro `any` — utiliser `unknown` + type guard
- Props de composants typés avec `interface` (pas `type`)
- `React.memo` sur Square, StatsRow, TreeNode
- `useMemo` pour `chess.board()` → Board
- `useCallback` pour handlers passés à composants mémoïsés
- `useTransition` pour stats/analyse non urgentes
- Jamais de `innerHTML`

## Points de Vigilance
- `Set<string>` non sérialisable JSON — sérialiser en `string[]` pour localStorage
- Training autoplay timer : toujours `useRef` + cleanup dans `useEffect`
- LRU cache analysis : `Map<string, AnalysisLine[]>`, max 500 entrées, FIFO
- CSS legacy — ne pas modifier

## Environnement
- `window.BLUNDERTALE_API_URL` — config dans `index.html`, lu par `services/api.ts`
- `window.LICHESS_STATS_PROXY_URL` — config dans `index.html`, lu par `services/stats.ts`
