---
description: "Use when: working on Alpha Chess — React 19 + TypeScript 5.9 + Vite 8 chess training app; creating or refactoring TypeScript files in src/ (components, stores, services, types, hooks, utils); fixing bugs or adding features to the TypeScript codebase"
name: "Alpha Chess Agent"
tools: [read, search, edit]
model: "Claude Sonnet 4.6"
argument-hint: "Composant, store ou service à traiter"
---

Tu travailles sur **Alpha Chess** — application React 19 + TypeScript 5.9 + Vite 8. Tout le code s'écrit dans `src/`.

L'ancien code vanilla JS a été archivé dans `.vanilla/` — accessible en lecture seule pour comprendre la logique d'origine, mais jamais modifié.

## Stack

| Technologie | Version |
|---|---|
| Vite | 8.0.11 |
| React | 19.2.0 |
| TypeScript | 5.9.x |
| Zustand | 5.x |
| React Router | 7.x |
| Vitest | 4.1.x |
| chess.js | latest npm (ESM) |
| @mliebelt/pgn-parser | 1.4.19 |
| ESLint | 9.x flat config |
| @testing-library/react | 16.x |

## Architecture `src/bridge/`

Tout ce qui était importé depuis `js/` passe désormais par `src/bridge/` :
- `events.ts` — EventBus pub/sub
- `storage.ts` — localStorage
- `state.ts` — état global (stockage progressif vers Zustand)
- `api.ts` — fetch wrapper backend
- `auth.ts` — auth, sync backend
- `ui.ts` — context menu, modales
- `arbre.ts` — utilitaires arbre

Les composants React importent via `@/jsBridge` (qui re-exporte depuis `bridge/`).

## Règles TypeScript

- `strict: true` + `noUncheckedIndexedAccess: true`
- Zéro `any` — utiliser `unknown` + type guard
- Props de composants typés avec `interface`
- React.memo sur Square, StatsRow, TreeNode
- useMemo pour chess.board() → Board
- useCallback pour les handlers passés à des composants mémoïsés
- Jamais de innerHTML

## Contraintes

- `.vanilla/` — lecture seule, ne pas modifier
- `backend/` — Express + PostgreSQL, ne pas toucher
- `engine/` — Stockfish Worker, ne pas toucher
- CSS legacy — ne pas modifier
- NE PAS utiliser `any`
- NE PAS ajouter de commentaires au code
- TOUJOURS lire le code source concerné avant de générer une modification

## Points de vigilance

- `Set<string>` non sérialisable JSON — sérialiser en `string[]` pour localStorage
- Training autoplay timer : toujours `useRef` + cleanup dans useEffect
- LRU cache analysis : Map<string, EvalResult>, max 500 entrées
