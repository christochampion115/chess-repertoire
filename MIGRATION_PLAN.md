# Plan de migration — Rapport, Stats joueur & Appels backend

## Déjà en place en TS (ne pas réécrire)

| Fonctionnalité | Statut | Fichier TS |
|---|---|---|
| Appel API Lichess stats | ✅ Migré | `bridge/stats.ts` |
| Appel API Chess.com stats (JSON + SSE) | ✅ Migré | `bridge/stats.ts` |
| Appel API Chess.com batchstats | ✅ Migré | `bridge/stats.ts` |
| Appel API training-stats (POST) | ✅ Migré | `services/training.ts` |
| Appel API auth/me | ✅ Migré | `bridge/auth.ts` |
| POST/PUT/DELETE répertoires | ✅ Migré (stubs fonctionnels) | `bridge/auth.ts` |
| Formulaire stats joueur (UI React) | ✅ Existe | `PlayerStatsModal.tsx` |
| SSE streaming (stats joueur) | ✅ Migré | `bridge/stats.ts` |
| Bridge events, storage, api, state | ✅ Migré | `bridge/*.ts` |

### Bug connu

`src/bridge/auth.ts:38` — Appelle `/user/settings` au lieu de `/user-settings`. Les settings utilisateurs ne sont jamais synchronisés côté TS.

---

## PHASE A — Réparer le bridge stats joueur (prérequis)

**Problème :** `PlayerStatsModal.tsx:71` importe dynamiquement depuis `@/jsBridge` mais `render`, `fetchPlayerStats`, `fetchPlayerStatsBatch` ne sont pas dans la liste d'export de `jsBridge.ts`.

**Solution :** Ajouter les exports manquants.

### Fichiers à modifier

| Fichier | Changement |
|---|---|
| `src/bridge/index.ts` | Ajouter `render` à l'export depuis `./ui` |
| `src/jsBridge.ts` | Ajouter `render`, `fetchPlayerStats`, `fetchPlayerStatsBatch` aux re-exports |
| `src/components/modals/PlayerStatsModal.tsx` | Optionnel : remplacer `import('@/jsBridge')` par imports statiques depuis `@/bridge/stats` et `@/bridge/ui` |

### Critère de succès

La modale "Stats joueur" ne crashe plus à l'import. Le bouton "Joueur" dans `StatsFilterBar` fonctionne.

---

## PHASE B — Détoxiquer PlayerStatsModal du bridge state

**Problème :** `PlayerStatsModal.tsx` effectue **28 mutations directes** sur `bridge/state` (freePlayRoot, chess, lichessStats, statsCache, statsFilters...). Ces mutations sont le seul mécanisme qui alimente les stats dans le CandidatesSection.

**Solution :** Remplacer chaque mutation `state.X = Y` par son équivalent dans les stores Zustand.

### Correspondance mutations → stores

| Mutation bridge state | Store cible | Action |
|---|---|---|
| `state.freePlayRoot = ...` | `repertoireStore.setFreePlayRoot(...)` | Store |
| `state.activeRepIndex = -1` | `repertoireStore.setActiveRepIndex(-1)` | Store |
| `state.currentNode = ...` | `repertoireStore.setCurrentNodeId(...)` | Store |
| `state.chess.load(START_FEN)` | `chessStore.setChess(new Chess())` | Store |
| `state.redoStack = []` | `repertoireStore.setRedoStack([])` | Store |
| `state.boardFlipped = ...` | `chessStore.setBoardFlipped(...)` | Store |
| `state.lichessStats = stats` | `statsStore.setLichessStats(stats)` | Store (via service) |
| `state.statsFilters.*` | `statsStore.setStatsFilters(...)` | Store |
| `state.lastStatsRequestKey = ...` | `statsStore.setLastStatsRequestKey(...)` | Store |
| `state.statsSelectedUci = ''` | `statsStore.setStatsSelectedUci('')` | Store |
| `state.statsCache.set(...)` | `statsStore.setStatsCache(...)` | Store (nouveau champ) |

Supprimer les appels à `render()` (lignes 82, 95, 138) — remplacer par un signal au store qui déclenche un re-render React automatiquement.

### Fichiers à créer/modifier

| Fichier | Action |
|---|---|
| `src/stores/statsStore.ts` | Ajouter champs : `lichessStats`, `statsCache`, `lastStatsRequestKey`, `statsSelectedUci`, `currentDatabase` |
| `src/services/stats.ts` | Ajouter fonction `loadPlayerStats(username, filters, signal, onProgress)` qui appelle `bridge/stats.ts` et écrit dans le store |
| `src/components/modals/PlayerStatsModal.tsx` | Remplacer `state.* = ...` par appels store + appels service |
| `src/components/analysis/StatsFilterBar.tsx` | Lire `statsStore.currentDatabase` au lieu de `state.statsFilters` |
| `src/components/analysis/CandidatesSection.tsx` | Lire `statsStore.lichessStats` au lieu de `state.lichessStats` |

### Critère de succès

La modale "Stats joueur" charge des stats Chess.com, se ferme, et les stats apparaissent dans le panneau des coups candidats sans muter `bridge/state`.

---

## PHASE C — Rapport (Performance Analysis) — Nouveau module

### Source
- `.vanilla/rapport.js` (~1 146 lignes)
- `rapport.html` (~1 427 lignes CSS + HTML)

### Nouveaux fichiers à créer

| Fichier | Description |
|---|---|
| `src/services/rapport.ts` | Helpers métier : `lookupEco`, `getOpeningName`, `pathToPgn`, `wdlBar`, `confidenceDots`, `priorityBadge`, `groupItems` |
| `src/services/rapportStream.ts` | Client SSE : `runAnalysis(params, onProgress, signal)` vers `GET /api/chesscom/report/stream` |
| `src/stores/rapportStore.ts` | Store Zustand : formulaires, état loading, résultats, erreurs |
| `src/components/rapport/RapportForm.tsx` | Formulaire avec username, couleur, time class, dates, ELO |
| `src/components/rapport/RapportLoading.tsx` | Écran de chargement avec barre de progression SSE |
| `src/components/rapport/RapportResults.tsx` | Résultats : summary cards, tabs, heavy cards, child cards |
| `src/components/rapport/RapportPage.tsx` | Page complète qui orchestre form → loading → results |
| `src/components/rapport/PositionEditor.tsx` | Éditeur de position interactif (mini-board avec placement de pièces) |
| `src/components/rapport/ReportCard.tsx` | Heavy card réutilisable (mini-board + WDL + stats + badges) |
| `src/components/rapport/ReportChildCard.tsx` | Compact child card |
| `src/components/rapport/ReportWdlBar.tsx` | Composant barre WDL |
| `src/components/rapport/ReportConfidenceDots.tsx` | Points de confiance |
| `src/components/rapport/ReportTab.tsx` | Système d'onglets priorités/forces |

### Données statiques

| Fichier | Description |
|---|---|
| `public/data/openings.json` | Déplacer depuis `data/openings.json` (ou garder en place) |

### Modifications de fichiers existants

| Fichier | Changement |
|---|---|
| `src/App.tsx:68` | Remplacer `<div>Rapport (Phase 8)</div>` par `<RapportPage />` |
| `src/index.css` | Ajouter toutes les classes `.rapport-*` / `.report-*` / `.fen-board-*` / loading / form |
| `src/components/layout/TopBar.tsx` | Optionnel : ajouter lien `/rapport` |

### Fonctions à porter (ordre de priorité)

| # | Fonction vanilla | Destination TS | Complexité |
|---|---|---|---|
| 1 | `runAnalysis(params, onProgress, signal)` | `services/rapportStream.ts` | Moyenne (SSE déjà dans bridge/stats.ts, adapter) |
| 2 | `getFormParams()` | `RapportForm.tsx` (React state) | Faible |
| 3 | `updateLoadingProgress(pct, detail)` | `RapportLoading.tsx` (React state) | Faible |
| 4 | `ensureOpeningsLoaded()` + `lookupEco(path)` | `services/rapport.ts` | Faible |
| 5 | `priorityBadge(item)` | `services/rapport.ts` | Faible |
| 6 | `wdlBar(wins, draws, losses)` | `ReportWdlBar.tsx` | Faible |
| 7 | `confidenceDots(total)` | `ReportConfidenceDots.tsx` | Faible |
| 8 | `pathToPgn(path, highlightLast, startMove)` | `services/rapport.ts` | Faible |
| 9 | `getOpeningName(item, repertoires)` | `services/rapport.ts` | Moyenne |
| 10 | `initPositionEditor()` + éditeur | `PositionEditor.tsx` | **Haute** |
| 11 | `groupItems(items, baselineScore)` | `services/rapport.ts` | **Haute** (algo métier) |
| 12 | `renderReport(data, params)` → décomposer | `RapportResults.tsx` | **Haute** |
| 13 | `renderGroupAsHeavyCard(...)` | `ReportCard.tsx` | Moyenne |
| 14 | `renderChildCard(item, ...)` | `ReportChildCard.tsx` | Faible |
| 15 | `summarizeParams(params, data)` | `services/rapport.ts` | Faible |
| 16 | `renderMetricLabel(label, helpText)` | `services/rapport.ts` ou inline | Très faible |
| 17 | `attachReportEvents()` | Remplacé par React event handlers | Faible |

### Position Editor (complexité haute)

Composant React qui reproduit :
- Grille 8×8 cliquable avec pièces
- Palette de sélection de pièce (12 pièces + vide)
- `handlePositionSquareClick(square)` avec sélection → déplacement
- `chess.js` pour validation des coups légaux
- Boutons reset/undo/clear
- `syncPositionFenField()` → input FEN readonly
- Sync orientation avec couleur choisie

### Critère de succès

La page `/rapport` dans React affiche le formulaire, lance l'analyse SSE avec barre de progression, et affiche les résultats avec cartes, onglets, WDL, badges.

---

## PHASE D — Auth (création de compte, connexion, session)

### Source
- `.vanilla/auth.js` (~1 018 lignes)
- `src/bridge/auth.ts` (5 fonctions, migrées partiellement)

### Nouveaux fichiers à créer

| Fichier | Description |
|---|---|
| `src/services/authService.ts` | Port complet des fonctions auth : `login`, `signup`, `logout`, `bootstrapSession`, `syncUserSettings`, `scheduleRepertoireSync`, `registerCreatedRepertoire`, `deleteRepertoireFromBackend` |

### Fonctions à porter depuis `.vanilla/auth.js`

| # | Fonction | Destination | Complexité |
|---|---|---|---|
| 1 | `loginWithCredentials(email, password)` | `authService.ts` | Faible (POST existant) |
| 2 | `signupWithCredentials(username, email, password)` | `authService.ts` | Faible (POST existant) |
| 3 | `logoutSession()` | `authService.ts` | Faible (POST existant) |
| 4 | `bootstrapSession()` | `authService.ts` | Moyenne (enchaîne /auth/me + GET repertoires + GET user-settings) |
| 5 | `syncUserSettings(settings)` | `authService.ts` | Faible (corriger le bug de path) |
| 6 | `scheduleRepertoireSync()` | `authService.ts` | Moyenne (dirty tracking, debounce, retry) |
| 7 | `registerCreatedRepertoire(rep)` | `authService.ts` | Faible (POST existant) |
| 8 | `deleteRepertoireFromBackend(rep)` | `authService.ts` | Faible (DELETE existant) |
| 9 | Gestion guest mode | `authStore.ts` | Faible |
| 10 | Gestion read-only mode (127.0.0.1) | `authStore.ts` | Très faible |

### Modifications de fichiers existants

| Fichier | Changement |
|---|---|
| `src/components/modals/AuthModal.tsx` | Remplacer le stub de 22 lignes par un vrai formulaire login/signup avec validation |
| `src/stores/authStore.ts` | Ajouter actions : `login(email, password)`, `signup(username, email, password)`, `logout()`, `bootstrapSession()`, `syncUserSettings()` |
| `src/bridge/auth.ts` | Supprimer ou rediriger vers `services/authService.ts` |
| `src/services/pgn.ts:19` | Remplacer `scheduleRepertoireSync` du bridge par `authService.scheduleRepertoireSync()` |
| `src/services/repertoire.ts:8-14` | Remplacer imports bridge auth par `services/authService` |
| `src/services/contextMenu.ts:19` | Remplacer `scheduleRepertoireSync` du bridge par `authService` |
| `src/components/modals/BoardThemeModal.tsx:3` | Remplacer `syncUserSettings` bridge par `authService` |
| `src/components/modals/FolderGroupModal.tsx:5-6` | Remplacer bridge storage + auth par stores + service |
| `src/components/modals/NameVarModal.tsx:5-6` | Idem |
| `src/components/modals/AccountModal.tsx` | Remplacer imports `@/jsBridge` par `authService` + `authStore` |
| `src/components/modals/ProfileModal.tsx:11` | Remplacer `state.lichessProfile` par `authStore.user` |
| `src/components/modals/RenameFolderModal.tsx:26` | Remplacer `syncUserSettings` par `authService` |
| `src/components/layout/TopBar.tsx` | Câbler le bouton "Connexion" pour ouvrir `AuthModal` via `useUiStore` |

### Critère de succès

Un utilisateur peut se créer un compte, se connecter, voir ses répertoires synchronisés, et se déconnecter — tout depuis React sans rechargement d'ancienne page vanilla.

---

## PHASE E — Réparation backend bridge + nettoyage

### Bugs à corriger

| Bug | Fichier | Correctif |
|---|---|---|
| `syncUserSettings` appelle `/user/settings` (manque un `s`) | `src/bridge/auth.ts:38` | Remplacer par `/user-settings` |
| `render` non exporté par `jsBridge.ts` | `src/jsBridge.ts` | Ajouter à la liste d'export |
| `fetchPlayerStats` / `fetchPlayerStatsBatch` absents de `jsBridge.ts` | `src/jsBridge.ts` | Ajouter à la liste |
| 6 dead events dans `bridge/ui.ts:handleRightClick` | `bridge/ui.ts` + `App.tsx` | Ajouter les handlers correspondants ou supprimer les options de menu |
| `MedalBadge.tsx` jamais importé | `src/components/training/MedalBadge.tsx` | L'importer dans `RepertoirePanel.tsx` ou supprimer |

### Orphelins à nettoyer

| Orphelin | Action |
|---|---|
| `syncVanillaToTSStore()` dans `App.tsx` | Supprimer (plus rien à sync depuis le bridge) |
| `syncVanillaRenderToTS()` dans `App.tsx` | Supprimer |
| `bridge/state.ts` (champs training, stats, auth dupliqués) | Supprimer champs redondants |
| `services/eventBus.ts` (deuxième event bus inutilisé) | Supprimer |
| 6 events orphelins : `hideMenus`, `openInTree`, `removeVariant`, `addMoveToTree`, `exploreFreePlay`, `selectSymbol` | Ajouter handlers ou supprimer des menus |

### Critère de succès

`npx tsc --noEmit` = zéro erreur. Plus aucun appel à `bridge/state` depuis les components React.

---

## Ordre d'exécution recommandé

```
Phase A (Réparer jsBridge) ──→ Phase B (Détoxiquer PlayerStatsModal)
                                        │
                                        ↓
Phase D (Auth) ──────────────→ Phase C (Rapport)
                                        │
                                        ↓
                                   Phase E (Nettoyage)
```

**Pourquoi cet ordre ?**
- **A** doit être fait en premier (bug bloque PlayerStatsModal existant)
- **B** vient ensuite car il dépend du bridge réparé et prépare le terrain pour le nettoyage
- **D** (Auth) peut être fait en parallèle de **C** (Rapport) — peu de dépendances croisées
- **E** en dernier, une fois que tout le bridge est vidé de ses consumers

## Estimation de charge

| Phase | Fichiers TS à créer | Fichiers TS à modifier | Charge estimée |
|---|---|---|---|
| A — Réparer jsBridge | 0 | 3 | Très faible (~30 min) |
| B — Détoxiquer PlayerStatsModal | 0 | 4 | Moyenne (1-2 jours) |
| C — Rapport | 10+ | 2-3 | **Haute** (4-5 jours) |
| D — Auth | 1 | ~12 | **Haute** (3-4 jours) |
| E — Nettoyage bridge | 0 | 4-5 | Faible (~1/2 jour) |

## Backend intact

Tous les endpoints backend (auth, repertoires, lichess, chesscom, training-stats, user-settings) restent **inchangés**. La migration est 100% front-end. Aucune modification backend nécessaire.
