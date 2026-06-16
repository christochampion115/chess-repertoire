---
description: "Documentation de référence — migration du core répertoire vanilla → TypeScript (terminée). Conservé pour comprendre la logique legacy de repertoire.js."
---

# Core Répertoire — Migration Vanilla → TypeScript

## Objectif

Remplacer `js/repertoire.js` (fonctions d'arbre) par un service TypeScript `src/services/repertoire.ts`. Le service est la seule source de vérité pour les mutations d'arbre. Zustand stores ne contiennent que des projections sérialisables pour l'affichage React.

## Analyse approfondie — Logique vanilla des répertoires

### 1. Structure de données — le modèle fondamental

#### Le nœud racine est le répertoire

Il n'existe pas d'objet `Repertoire` séparé de l'arbre. La racine du nœud (`state.repertoires[i]`) est le répertoire. Elle porte à la fois les métadonnées du répertoire (champs présents uniquement à la racine) et les propriétés de nœud communes à tous les nœuds.

**Champs exclusifs à la racine** (`repertoire.js:26-62`) :
- `name` — nom du répertoire
- `color` — `'w'` ou `'b'` (couleur que l'utilisateur défend)
- `id` — identifiant runtime (chaîne aléatoire base-36, 9 chars)
- `folderId` — référence au dossier de la liste principale (optionnel)
- `isExample` — flag booléen pour les données de démonstration
- `updatedAt` — timestamp de dernière sync
- `_fenIndex` — `Map<normalizedFen, node>` non sérialisée, construite à la volée

**Champs communs à tous les nœuds (racine comprise)** :
- `id`, `san`, `fen`, `parent` (référence live, non sérialisée), `children[]`
- `moveNum`, `turn`, `createdAt` (compteur monotonique)
- `annotation`, `comment`, `varName`, `varAnnotation`
- `isTransposition`, `sourceNode` (référence live ou null)
- `trainingMedalTier`, `trainingMedalShineLevel`, `trainingMedalUpdatedAt`

**Compteur monotonique** (`nextCreatedAt()`, `repertoire.js:19`) : Chaque nœud reçoit un `createdAt` strictement croissant même en cas d'appels simultanés. Critique : détermine quel nœud est "source" et lequel est "transposition" (le plus ancien gagne).

### 2. Création d'un répertoire — 4 modes

Point d'entrée unique : `confirmRepertoireCreation()` déclenchée depuis le modal.

- **Mode `'start'`** — répertoire vide, FEN de départ. `createNewRepertoire(name, color)`
- **Mode `'current'`** — depuis la position actuelle du plateau. Remonte `node.parent` depuis `currentNode` jusqu'à la racine freeplay, rejoue les coups via `addMove()`.
- **Mode `'pgn-file'`** — import fichier PGN via `FileReader` + `PgnParser`.
- **Mode `'pgn-text'`** — même pipeline, depuis textarea.

**Stratégie d'import PGN** : deux passes — ligne principale d'abord (`createdAt` bas), variantes en ordre inverse. Les nœuds de la ligne principale gagnent toujours le conflit de transposition. `state._suppressSync = true` pendant l'import.

### 3. La mutation centrale : `addMove()`

`addMove(parent, san)` est la seule porte d'entrée pour modifier l'arbre.

**Séquence** :
1. Bloqué si `state.trainingActive`
2. Résolution de `state.activeRepIndex` si -1 (remonte vers la racine)
3. Chess temporaire sur `parent.fen` → validation SAN
4. Déduplication : si enfant avec même SAN existe → retour existant
5. Calcul du FEN cible
6. `nextCreatedAt()` → `now`
7. `findTranspositionFast(targetFen, now, parent)` → détection transposition
8. Création du nœud + `parent.children.push(node)`
9. Si non-transposition → mise à jour `_fenIndex`
10. `scheduleRepertoireSync()` (sauf si `_suppressSync`)

### 4. Système de transpositions

**Détection : `findTranspositionFast()` (O(1))** via `_fenIndex`.

Conditions pour transposition valide :
- `candidate.createdAt < currentTime` (candidat plus ancien)
- `candidate` n'est **pas** un descendant de `currentParent` (interdit transposition "vers le bas")
- `candidate.children.length > 0` (continuations existent)

**Index FEN** : `_fenIndex` = `Map<normFen, node>`. Non sérialisé, reconstruit à la première mutation après chargement par `buildFenIndex()`.

**Nettoyage** : `sanitizeTranspositions(rep)` après toute désérialisation. Lors d'une suppression de sous-arbre, tous les `sourceNode` pointant vers des IDs supprimés sont invalidés.

### 5. Coexistence de plusieurs répertoires

- **Tableau** `state.repertoires[]` — N répertoires en mémoire.
- **Répertoire actif** : `state.activeRepIndex`. -1 = freeplay mode (state.freePlayRoot).
- **Freeplay** : `state.freePlayRoot` est un nœud racine standalone, hors de `repertoires[]`.

### 6. Organisation : dossiers

**Dossiers de répertoires** (niveau macro) : `state.repFolders = { [folderId]: folderName }`. Clé localStorage `alphaChess.repFolders`.

**Dossiers de variantes** (niveau micro) : `child.folderId` sur nœud nommé dans l'arbre. Même store que les dossiers de répertoires (espace de noms partagé).

### 7. Navigation dans l'arbre

- **Nœud courant** : `state.currentNode` — référence live vers le nœud où se trouve l'utilisateur
- `expandPathToCurrentNode()` : remonte la chaîne `parent` et ajoute tous les IDs dans `treeExpanded`
- Clic répertoire → `state.activeRepIndex = index`, `currentNode = findLastUniquePosition(rep)`, `chess.load(currentNode.fen)`, `boardFlipped = rep.color === 'b'`
- Clic nœud arbre → `state.currentNode = node` + `chess.load(node.fen)`
- `findLastUniquePosition(rep)` : dernier nœud de la ligne principale sans branchement

### 8. Suppression

`confirmDelete()` couvre deux cas :

- **Répertoire entier** (`deleteTargetIdx !== -1`) : splice dans le tableau, retour freeplay si actif supprimé
- **Sous-arbre** : collecte IDs supprimés (DFS), retire de `parent.children`, invalide `sourceNode` cassés, reconstruit `_fenIndex`. Si `currentNode` était dans le sous-arbre → `currentNode = parent`

### 9. Persistance et synchronisation

**Deux formats** de sérialisation (coexistence legacy) :
- Nested legacy : `hydrateRepertoires()` (enfants imbriqués)
- Flat modern : `serializeRepertoire()` / `deserializeRepertoire()` (liste plate de nœuds, children = tableau d'IDs)

**Cycle de sync backend** : `addMove()` → `scheduleRepertoireSync()` → `persistLocalRepertoires()` (localStorage immédiat) → `scheduleDirtyFlush()` (debounce 1000ms) → `flushRepertoireSync()` → `saveRepertoireToBackend()` (PUT/POST)

**Conflit local/distant** : compare `updatedAt`, fallback `nodeCount`, fallback `latestCreatedAt`.

---

## Plan de migration — Option B (propre)

### Architecture cible

```
React Component
  │
  ├─ lit zustand (affichage — projection sérialisable)
  └─ appelle repertoireService (ACTION)
       │
       ▼
     repertoireService.ts
       ├─ mute nodeMap interne (Map<string, RepertoireNode>)
       ├─ utilise chessStore.chess pour valider les coups
       └─ écrit snapshot dans repertoireStore + chessStore
              │
              ▼
            React re-render
```

### Principe

Le service maintient une `Map<string, RepertoireNode>` en mémoire (module-level, pas dans zustand). Au lieu de `node.parent` (référence non sérialisable), on utilise `nodeMap.get(node.parentId)`. Après chaque opération, on écrit un snapshot propre dans les stores zustand.

### Fichiers

#### NOUVEAU : `src/services/repertoire.ts`

Contient toute la logique aujourd'hui dans `js/repertoire.js` + `js/ui.js` (navigation) :

```typescript
// ── État interne (module-level, pas dans zustand) ──
const nodeMap = new Map<string, RepertoireNode>();

// ── Fonctions exportées ──

/** Initialise la nodeMap depuis un état existant */
function initNodeMap(repertoires: RepertoireNode[]): void
function rebuildNodeMap(): void

/** Crée un nouveau répertoire, update les stores */
function createNewRepertoire(
  name: string,
  color: Color,
  folderId?: string | null,
): void

/** Clone l'arbre d'un répertoire avec parentId pour le store */
function cloneTreeForStore(root: RepertoireNode): RepertoireNode

/** Ajoute un coup à l'arbre du parent */
function addMove(parentId: string, san: string): RepertoireNode | null

/** Clic sur une case — sélection ou move */
function handleSquareClick(sq: Square): void

/** Navigue vers un nœud de l'arbre */
function navigateToNode(nodeId: string): void

/** Navigation historique */
function navBack(): void
function navForward(): void

/** Déplie le chemin vers un nœud dans treeExpanded */
function expandPathToCurrentNode(nodeId: string): void

/** Supprime un nœud ou répertoire */
function confirmDelete(targetId: string): void

/** Change de répertoire actif */
function selectRepertoire(idx: number): void

/** Revient à la position de départ */
function resetPosition(): void

/** Transpositions */
function findTranspositionFast(fen: string, currentTime: number, parentId: string): RepertoireNode | null
function isNodeDescendantOf(nodeId: string, ancestorId: string): boolean
function normalizeFen(fen: string): string
```

**Détails d'implémentation :**

- `addMove` crée un `Chess` temporaire pour valider le SAN et obtenir le FEN cible
- La déduplication cherche un enfant avec le même SAN dans `parent.children`
- `findTranspositionFast` utilise la `nodeMap` et le champ `parentId` pour la vérification O(1)
- Après chaque mutation, le service clone l'arbre racine modifié (`cloneTreeForStore`) et met à jour `repertoireStore`
- `handleSquareClick` suit la même logique que le vanilla : sélection si `selectedSq` null, move si cible légale, désélection si même case

#### MODIFIÉ : `src/stores/chessStore.ts`

```typescript
// Supprimer
- moves: string[]
- makeMove(from, to, promotion)
- navBack()
- loadFen()   // ← reset moves

// Garder
- chess: Chess
- selectedSq: Square | null
- boardFlipped: boolean
- boardTheme: BoardTheme
- selectSquare(sq)
- flipBoard()
- reset()
```

Le `chess.history()` est utilisé directement par les composants (Monitor, BoardControls pour disabled state).

#### MODIFIÉ : `src/stores/repertoireStore.ts`

```typescript
// Ajouter
- redoStack: string[]
- menuTargetId: string | null
- version: number  // incrémenté après chaque mutation → force React re-render

// Garder
- repertoires: RepertoireNode[]
- activeRepIndex: number
- currentNodeId: string | null
- freePlayRoot: RepertoireNode | null
- treeExpanded: Set<string>
- repExpanded: Set<string>
- openPanels, selectedColor, repFolders, pendingNewRepFolderId, etc.
```

Le type `RepertoireNode` reste inchangé (`parentId: string | null`). La nodeMap interne du service permet les lookups parent → parentId.

#### MODIFIÉ : `src/components/board/Board.tsx`

Remplacer `handleClick` interne par l'appel à `repertoireService.handleSquareClick(sq)`.

Avant :
```tsx
const handleClick = useCallback((sq, piece) => {
  if (!selectedSq) { if (piece && piece.color === turn) selectSquare(sq); }
  else if (sq === selectedSq) { selectSquare(null); }
  else if (legalTargets.has(sq)) { makeMove(selectedSq, sq); }
  else if (piece && piece.color === turn) { selectSquare(sq); }
  else { selectSquare(null); }
}, [selectedSq, legalTargets, makeMove, selectSquare]);
```

Après :
```tsx
const handleClick = useCallback((sq: Square) => {
  repertoireService.handleSquareClick(sq);
}, []);
```

#### MODIFIÉ : `src/components/board/BoardControls.tsx`

Remplacer :
- `chessStore.navBack()` → `repertoireService.navBack()`
- `chessStore.reset()` → `repertoireService.resetPosition()`
- Lire `chessStore.chess.history().length` pour désactiver ←

#### MODIFIÉ : `src/components/modals/NewRepModal.tsx`

Remplacer la `createRepNode()` interne + `store.setRepertoires()` par :
```tsx
repertoireService.createNewRepertoire(trimmed, store.selectedColor);
closeModal();
```

#### MODIFIÉ : `src/components/repertoire/TreePanel.tsx`

```tsx
const handleSelect = useCallback((node: RepertoireNode) => {
  repertoireService.navigateToNode(node.id);
}, []);
```

#### MODIFIÉ : `src/components/repertoire/RepertoirePanel.tsx`

```tsx
const handleRepClick = useCallback((idx: number) => {
  repertoireService.selectRepertoire(idx);
}, []);
```

#### MODIFIÉ : `src/components/monitor/Monitor.tsx`

Lire `chessStore.chess.history()` directement (plus de `moves[]`).

#### MODIFIÉ : `src/jsBridge.ts`

Retirer les exports devenus inutiles :
- `render`
- `navBack`, `navForward`, `resetPosition`
- `openNewRepModal`, `openNameVarModal`, `openCommentModal`, etc. (modales déjà React)
- `confirmDelete`, `addMove`, `createNewRepertoire` (remplacés par le service)

Garder :
- `handleRightClick`, `closeModals`, `hideMenus`
- `eventBus`
- `state` (si encore nécessaire)
- `auth`, `storage`
- Fonctions modales encore utilisées par ContextMenu

### Flux après migration

```
Clic plateau
  → Board.tsx → repertoireService.handleSquareClick(sq)
    → chessStore.getState().chess.move({ from, to })  // ou sélection
    → nodeMap.get(parentId) → addMove()
    → cloneTreeForStore(root) → repertoireStore.setRepertoires()
    → chessStore.getState().selectSquare(null)
  → React re-render (zustand setState)

Clic arbre
  → TreePanel → repertoireService.navigateToNode(nodeId)
    → chessStore.getState().chess.load(node.fen)
    → repertoireStore.setCurrentNodeId(node.id)
    → expandPathToCurrentNode(nodeId) → toggle treeExpanded
  → React re-render

Créer répertoire
  → NewRepModal → repertoireService.createNewRepertoire(name, color)
    → crée nœud racine
    → repertoireStore.setRepertoires([...reps, newRoot])
    → repertoireStore.setActiveRepIndex(newIndex)
    → chessStore.getState().chess.load(newRoot.fen)
  → closeModal() + React re-render
```

### Ce qui reste en vanilla (inchangé)

- `js/auth.js` — login, signup, sync backend, bootstrap session
- `js/stats.js` — stats Lichess/Masters/Player
- `js/analysis.js` — worker Stockfish
- `js/ui.js` — fonctions training, UI panels (sauf navigation board)
- `js/storage.js` — localStorage wrapper
- `js/events.js` — eventBus
- `js/state.js` — état global (peut être vidé progressivement)
- `js/repertoirePersistence.js` — sérialisation (inchangé tant que auth.js l'utilise)
- `js/arbre.js` — rendu arbre (mort, remplacé par TreePanel React)
- `js/board.js` — rendu board (mort, remplacé par Board React)
- `js/drag.js` — drag & drop (mort, remplacé par useDragPiece)
- `js/domBindings.js` — events DOM (mort, remplacé par React)

### Points de vigilance

1. **`parent` refs** : Le service utilise `nodeMap` pour remplacer les références `parent` directes. Après toute désérialisation, `rebuildNodeMap()` doit être appelé.

2. **`_fenIndex`** : Remplacé par `nodeMap` + recherche O(1) dans la map. `buildFenIndex()` peut disparaître ou être simplifié.

3. **`sourceNode`** : Dans le vanilla, c'est une référence live. Dans le service, c'est `sourceNodeId: string | null`. La transposition est une relation par ID.

4. **`freePlayRoot`** : Gardé dans `repertoireStore`. Le service gère sa mutation (enfants ajoutés en mode freeplay).

5. **`activeRepIndex`** : Index fragile. Le service garantit sa cohérence après chaque mutation (insertion/suppression).

6. **Import PGN** : Non migré dans un premier temps. Reste en vanilla via `repertoireService.addMove()` que le JS vanilla peut importer depuis le bridge.

7. **Schedule sync** : Le service appelle `scheduleRepertoireSync()` importé depuis `auth.ts` (via jsBridge ou directement) après chaque mutation.

### Ordre d'implémentation

1. `src/services/repertoire.ts` — le service complet
2. `src/stores/chessStore.ts` — nettoyage des champs supprimés
3. `src/stores/repertoireStore.ts` — ajout des champs manquants
4. `src/components/board/Board.tsx` — wiring handleSquareClick
5. `src/components/board/BoardControls.tsx` — wiring navBack/navForward
6. `src/components/modals/NewRepModal.tsx` — wiring createNewRepertoire
7. `src/components/repertoire/TreePanel.tsx` — wiring navigateToNode
8. `src/components/repertoire/RepertoirePanel.tsx` — wiring selectRepertoire
9. `src/components/monitor/Monitor.tsx` — simplification lecture historique
10. `src/jsBridge.ts` — nettoyage exports inutiles
