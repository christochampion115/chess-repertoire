# Alpha Chess — Migration .vanilla/ → TypeScript

## Goal
- Migrer Alpha Chess en full TypeScript en archivant le vanilla JS (`.vanilla/`) et en remplaçant chaque fonctionnalité par son équivalent TypeScript natif.

## Constraints & Preferences
- `bridge/ui.ts` ne doit plus contenir de stubs no-op — chaque fonction doit être implémentée ou supprimée.
- Les composants React importent via `@/services/` pour la logique métier, pas via le bridge.
- Le plan suit 6 phases : render+statsUtils → StatsPanel → Tooltips → Training → Auth → Nettoyage.

## Progress
### Done
- `js/` déplacé vers `.vanilla/` (19 fichiers, lecture seule)
- Créé `src/bridge/events.ts`, `storage.ts`, `state.ts`, `api.ts`, `auth.ts`, `ui.ts`, `arbre.ts`, `stats.ts`, `index.ts`
- Réécrit `src/jsBridge.ts` : re-export depuis `./bridge/`
- `syncVanillaToTSStore` et `syncVanillaRenderToTS` synchronisent `state` bridge → Zustand stores (repertoireStore, chessStore)
- Réécrit `src/services/repertoire.ts` : navigateToNode avec redirect transposition, sanitizeTranspositions
- `src/services/pgn.ts` : import depuis `bridge/auth`
- `PlayerStatsModal.tsx` : imports dynamiques simplifiés
- `contextMenu.ts` : imports fixés
- **Phase 1** : `src/utils/statsUtils.ts` (3 fonctions)
- **Phase 2** : `src/services/stats.ts`, `src/hooks/useStats.ts`, branché dans `AppLayout.tsx`
- **Phase 3** : `TooltipContext`, `TooltipProvider`, `StatsTooltip`, branché `CandidatesSection`/`StatsRow`
- **Phase 4** : Moteur d'entraînement complet — `src/services/training.ts` (426 lignes) avec :
  - `prepareTraining` / `confirmTrainingStart` / `stopTraining`
  - `checkTrainingMove` — validation coup joueur pendant l'entraînement
  - `advanceAutoPlay` — défilement automatique avec délais adaptatifs
  - `showNextTrainingTarget` — modes Express/Randomizer
  - `collectMissingReplyNodes`, `collectOutOfScopeTranspositionNodes`
  - `collectFinalTrainingTargets`, `collectAllTrainingTargets`
  - `selectTrainingPath` — modes Vertical/Express/Randomizer/Survival
  - `SURVIVAL_LIVES` = 3, système de vies + goldenHeart + milestones
- `handleSquareClick` (`repertoire.ts:401`) : route les coups vers `checkTrainingMove` quand `trainingStore.phase !== 'idle'`
- Tous les modaux d'entraînement (`TrainingConfirmModal`, `TrainingStopModal`, `TrainingDoneModal`, `TrainingBanner`) importent depuis `@/services/training` directement
- `RepertoirePanel.tsx` appelle `prepareTraining` + `setPendingTrainingMode` avant d'ouvrir le modal
- Audit complet de tous les `.vanilla/*.js` vs équivalents TS réalisé
- **Phase A — Board/repertoire fix**: ajout `resetFreePlay()` dans `repertoire.ts` qui crée un nœud free-play dans `nodeMap` + met à jour `chessStore` / `repertoireStore` correctement (au lieu de muter `bridge/state.*` directement dans `PlayerStatsModal`)
- `PlayerStatsModal.tsx` : bridge state mutations remplacées par appel à `resetFreePlay()` + chessStore pour le pré-cache
- **Phase A finish**: `CandidatesSection.tsx` appelle `playUciMove` au clic (candidates cliquables) ; le bridge state est synchronisé après `resetFreePlay` pour que `syncVanillaToTSStore` n'écrase pas les stores Zustand
- `syncVanillaToTSStore` et `syncVanillaRenderToTS` supprimées (jsBridge.ts) — plus aucun fichier vanilla chargé, le sync écrasait les stores Zustand avec des données bridge obsolètes

### In Progress
- *(none)*

### Rapport — Toutes features vanilla migrées
- **FEN text input éditable** (`FenEditor.tsx`) : saisie directe de FEN avec validation chess.js + retour d'erreur visuel
- **Validation FEN avant submit** (`ReportPage.tsx`) : `new Chess(params.startFen)` catch + message d'erreur
- **Board theme localStorage** (`ReportMiniBoard.tsx`, `FenEditor.tsx`) : `loadItem(STORAGE_KEYS.BOARD_THEME)` avec fallback couleurs par défaut
- **Scope note focusDepth/focusMoveNumber** (`ReportResults.tsx`) : affiché sous forme de bandeau bleu `🔍 Analyse fiable jusqu'au Xe coup…`
- **"Open in app" button** (`ReportGroupCard.tsx`) : bouton "Ouvrir →" à côté du mini-board, écrit sessionStorage + redirect index.html
- **Repertoire lookup branché** (`ReportGroupCard.tsx`) : `useRepertoireStore` → `repInfo` passé à `getOpeningNameByPath`

### Blocked
- *(none)*

## Key Decisions
- `navigateToNodeFen(node)` helper qui set `chessStore.chess`, `repertoireStore.currentNodeId`, `repertoireStore.version`, et appelle `expandPathToCurrentNode`
- `resetFreePlay(fen, color)` dans repertoire.ts crée un nœud free-play root dans `nodeMap` + met à jour `chessStore.boardFlipped` / `repertoireStore` au lieu de muter `bridge/state.*`
- `syncVanillaToTSStore` vidé de ses syncs bridge→Zustand pour `activeRepIndex`, `freePlayRoot`, `currentNodeId`, `boardFlipped`, `treeExpanded`, `selectedColor` — ces champs sont gérés par la TS, le sync les écrasait avec des valeurs obsolètes du bridge, désynchronisant `nodeMap`
- Le sync ne garde que `repertoires` et `repFolders` (encore chargés via `bridge/auth`)
- `checkTrainingMove` importé dynamiquement dans `repertoire.ts` pour éviter la circularité (repertoire ↔ training)
- Les modaux importent directement depuis `@/services/training` plutôt que via le pont `@/jsBridge`
- Les events `trainingStart`/`trainingStop`/`closeModals` dans bridge/ui.ts sont orphelins (plus appelés par les composants React)
- `syncVanillaToTSStore` et `syncVanillaRenderToTS` supprimées — le vanilla n'est plus chargé, le bridge `state` n'est plus la source de vérité pour les stores Zustand. Seuls `state.auth` (bridge/auth.ts) et `state.statsCache`/`state.lichessStats` (bridge/stats.ts) sont encore utilisés directement.
- **Rapport feature migrée en React/TS** : types, services (openings, report SSE), store Zustand, composants (FenEditor, ReportMiniBoard SVG, ReportGroupCard, ReportChildCard, ReportForm, ReportResults, ReportPage), route `/rapport` branchée dans App.tsx

## Next Steps
- (optional) Nettoyer les imports `@/bridge/` restants dans les composants React (préférer `@/services/`)
- Nettoyer les fonctions orphelines du bridge (confirmStartTraining, confirmStopTraining, closeTrainingDone)
- Ajouter un watcher Board.tsx → trainingStore.feedback pour l'affichage des retours visuels (sq-correct, sq-wrong)

## Critical Context
- `npx tsc --noEmit` : zéro erreur
- `npx eslint src/bridge/ --max-warnings 0` : zéro erreur
- `npx eslint src/components/report/ src/services/report.ts src/services/openings.ts src/stores/reportStore.ts src/types/report.ts --max-warnings 0` : zéro erreur
- Plus aucun import vers `js/` dans les `.ts`/`.tsx`
- Plus aucun import vers `js/` ou référence à `rapport.html` dans le code React
- L'ancienne version vanilla est dans `.vanilla/` : 19 fichiers, git-tracked
- `src/components/report/` : 10 fichiers TSX (nouveaux)
- `src/services/openings.ts` : service ECO lookup + helpers
- `src/services/report.ts` : fetch SSE + JSON Chess.com report
- `src/stores/reportStore.ts` : store Zustand pour le rapport
- **Partiellement migré signifie cassé** : chaque fonction bridge sans implémentation réelle = fonctionnalité cassée

## Relevant Files
- `.vanilla/` : archive vanilla JS (lecture seule)
- `src/services/training.ts` : moteur d'entraînement complet (426 lignes)
- `src/stores/trainingStore.ts` : store Zustand training
- `src/services/repertoire.ts` : handleSquareClick avec routage training
- `src/components/repertoire/RepertoirePanel.tsx` : prépare + lance training
- `src/components/modals/TrainingConfirmModal.tsx` : appelle confirmTrainingStart
- `src/components/modals/TrainingStopModal.tsx` : appelle stopTraining
- `src/components/modals/TrainingDoneModal.tsx` : appelle stopTraining
- `src/components/training/TrainingBanner.tsx` : appelle stopTraining
