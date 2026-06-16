# Prompt pour review du plan de migration

## Contexte du projet

Alpha Chess est une application de répertoire d'échecs avec entraînement, stats Lichess/Chess.com, analyse par moteur, et rapports de performance. L'app a été écrite à l'origine en vanilla JS (dossier `.vanilla/`, 20 fichiers), puis progressivement migrée vers TypeScript + React + Zustand.

### État actuel

- Le vanilla JS est archivé dans `.vanilla/` (read-only, git-tracked, plus chargé par l'app)
- L'app tourne entièrement en TypeScript/React
- **Mais** : il reste un dossier `src/bridge/` (8 fichiers) qui contient la logique métier migrée depuis le vanilla, encore appelée par les composants React
- Le fichier `src/jsBridge.ts` sert de proxy de ré-export pour quelques imports dynamiques

### Ce qu'il reste à faire

Supprimer toute dépendance au dossier `bridge/` en remplaçant chaque appel par son équivalent Zustand store / service natif.

---

## Plan de migration proposé — 7 étapes

### Étape 1 — `showTrainingConfirmModal` → appel direct `uiStore`

**Problème** : `RepertoirePanel.tsx` importe `showTrainingConfirmModal` depuis `@/bridge/ui`. Cette fonction émet `eventBus.emit('openModal', ...)` qui est écouté par `App.tsx` pour appeler `uiStore.openModal()`.

**Solution** : Appeler `useUiStore.getState().openModal({ type:'training-confirm', rootId:node.id, mode:'vertical' })` directement depuis `RepertoirePanel.tsx`, sans passer par le eventBus.

**Fichiers** : `RepertoirePanel.tsx`, `bridge/ui.ts`
**Risque** : ⬜ Nul

---

### Étape 2 — `render()` + `eventBus.emit('render')` → nothing

**Problème** : `PlayerStatsModal.tsx` importe `render` de `@/bridge/ui` (3 appels) et `CommentModal.tsx` appelle `eventBus.emit('render')`. Mais l'event `'render'` n'a plus aucun listener depuis la suppression de `syncVanillaRenderToTS`. Ces appels ne font rien.

**Solution** : Supprimer les appels et la fonction.

**Fichiers** : `PlayerStatsModal.tsx`, `CommentModal.tsx`, `bridge/ui.ts`
**Risque** : ⬜ Nul

---

### Étape 3 — `CommentModal` → arrêter de muter `state.menuTarget.comment`

**Problème** : `CommentModal.tsx` importe dynamiquement `state` depuis `@/jsBridge` et mute `state.menuTarget.comment = comment`. Le `menuTargetId` est déjà stocké dans `repertoireStore` (set par `buildContextMenu`). Le nœud cible est dans `nodeMap`.

**Solution** : Lire `menuTargetId` depuis `repertoireStore`, trouver le nœud dans `nodeMap`, muter `node.comment` directement, et incrémenter `version` du store pour forcer le re-render.

**Fichiers** : `CommentModal.tsx`
**Risque** : 🟡 Faible

---

### Étape 4 — `ProfileModal` / `AccountModal` / `RenameFolderModal` → arrêter `@/jsBridge`

**ProfileModal** : lit `state.lichessProfile` — n'est plus jamais écrit (vanilla parti). Remplacer par `useAuthStore.getState().user`.

**AccountModal** : lit/écrit `state.username` via `import('@/jsBridge')`. Remplacer par localStorage direct + `syncUserSettings` importé statiquement.

**RenameFolderModal** : appelle `syncUserSettings` via `import('@/jsBridge')`. Remplacer par import statique.

**Fichiers** : `ProfileModal.tsx`, `AccountModal.tsx`, `RenameFolderModal.tsx`
**Risque** : 🟡 Faible

---

### Étape 5 — `services/stats.ts` + `PlayerStatsModal` → migrer le cache stats vers `statsStore`

**Problème** : Les stats sont lues par `CandidatesSection.tsx` via `useStatsStore.data`, mais écrites dans `bridge/state.statsCache` / `state.lichessStats` / `state.lastStatsRequestKey` / etc. par `services/stats.ts` et `PlayerStatsModal.tsx`. Double source de vérité.

**Détail des mutations bridge state encore actives** :

| Propriété | Écrite par |
|-----------|-----------|
| `state.statsCache` | `services/stats.ts:28-32,70` + `PlayerStatsModal.tsx:111-166` |
| `state.lichessStats` | `services/stats.ts:32,67` + `PlayerStatsModal.tsx:114,162` |
| `state.lastStatsRequestKey` | `services/stats.ts:33,38,68,96,110` + `PlayerStatsModal.tsx:103,115,163` |
| `state.statsSelectedUci` | `services/stats.ts:69` + `PlayerStatsModal.tsx:116,164` |
| `state.statsFilters` | `PlayerStatsModal.tsx:113,161` |
| `state.statsError` | `services/stats.ts:51,76` |
| `state.statsLoading` | `services/stats.ts:81` |
| `state.currentStatsRequestKey` | `services/stats.ts:50,82` |

**Solution** :
1. Ajouter `statsCache: Map`, `lastStatsRequestKey`, `lichessStats` au `statsStore` Zustand
2. Remplacer chaque mutation `state.X = Y` par son setter Zustand correspondant
3. `StatsFilterBar.tsx` est déjà migré (aucun accès bridge state)
4. `CandidatesSection.tsx` est déjà migré (lit `store.data`)

**Fichiers** : `stores/statsStore.ts`, `services/stats.ts`, `PlayerStatsModal.tsx`
**Risque** : 🔴 Moyen-élevé (flux stats critique, à tester soigneusement)

---

### Étape 6 — Auth functions → service dédié (`services/authService.ts`)

**Problème** : `bridge/auth.ts` contient 7 fonctions actives + 1 stub. Elles sont importées depuis 10+ fichiers. Le stub `scheduleRepertoireSync()` est no-op (TODO P1 — dirty tracking non implémenté). `syncUserSettings()` appelle `/user/settings` au lieu de `/user-settings` (bug).

**Fonctions à migrer** :
- `bootstrapSession()` — chargement session + répertoires
- `loginWithCredentials()` / `signupWithCredentials()` — auth
- `logoutSession()` — déconnexion
- `syncUserSettings()` — sauvegarde dossiers (corriger le bug de path)
- `registerCreatedRepertoire()` — POST création répertoire
- `deleteRepertoireFromBackend()` — DELETE suppression
- `scheduleRepertoireSync()` — garder le stub (ou implémenter, mais hors scope)

**Consommateurs à mettre à jour** : `AppLayout.tsx`, `SplashScreen.tsx`, `AuthModal.tsx`, `BoardThemeModal.tsx`, `FolderGroupModal.tsx`, `NameVarModal.tsx`, `RenameFolderModal.tsx`, `repertoire.ts`, `contextMenu.ts`, `pgn.ts`

**Fichiers** : `services/authService.ts` (nouveau), puis modifier les 10 consommateurs
**Risque** : 🟠 Moyen

---

### Étape 7 — Nettoyage final

Une fois 1-6 faites :
- `bridge/ui.ts` → supprimer (vide)
- `bridge/state.ts` → supprimer (plus rien d'utilisé)
- `bridge/events.ts` → supprimer (les 4 listeners App.tsx deviennent morts — les remplacer par des appels directs aux stores)
- `bridge/storage.ts` → remplacer par `utils/storage.ts` ou localStorage direct
- `bridge/arbre.ts` → déplacer `countTotalChildren` dans `repertoire.ts` ou `utils/`
- `bridge/api.ts` → déplacer dans `services/api.ts`
- `bridge/stats.ts` → fusionner dans `services/stats.ts`
- `bridge/index.ts` → supprimer
- `src/jsBridge.ts` → supprimer
- `src/services/eventBus.ts` → supprimer (déjà dead)
- `.vanilla/` → supprimer (archive)
- `index.html` / `dist/index.html` → supprimer CDN scripts redondants (chess.js, pgn-parser)
- `eslint.config.js` → retirer ignore `js/` (inexistant)

**Risque** : 🟡 Faible

---

## Questions pour le review

1. **Ordre** : Les étapes 1-2 sont indépendantes (peuvent être faites en parallèle). Les étapes 3-4 aussi. L'étape 5 est la plus risquée. L'ordre proposé est-il optimal ?

2. **statsStore** : `CandidatesSection.tsx` lit déjà `store.data` (Zustand) pour afficher les stats. `StatsFilterBar.tsx` lit déjà `store.filters`. Le flux stats semble déjà migré côté lecture. Pourtant `services/stats.ts` continue d'écrire dans `bridge/state` **en plus** du store. Y a-t-il un risque que certains composants lisent encore `state.lichessStats` ou `state.statsFilters` directement (via un import bridge state dans un fichier qu'on aurait oublié) ?

3. **eventBus après migration** : Une fois que plus rien n'émet d'events via `eventBus.emit()`, les 4 listeners dans `App.tsx` deviennent morts. Faut-il les supprimer immédiatement ou les garder pour de futurs events potentiels ?

4. **scheduleRepertoireSync()** : Actuellement no-op (stub TODO P1). Si on le déplace dans `authService.ts` sans l'implémenter, aucune régression. OK ?

5. **Risque étape 5** : Y a-t-il une approche plus sûre (ex: wrapper progressif avec double écriture bridge + store pendant un temps) pour éviter de casser les stats ?

6. **Dépendances** : Y a-t-il des dépendances cachées entre les étapes que le plan ne mentionne pas ?
