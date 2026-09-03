# 06 — Refacto, nettoyage, bug tutoriel, logo, SEO

> Chantiers de qualité regroupés. Ordre interne conseillé : §1 (bug) → §2 (logs) → §5/§6 (logo, SEO) → §3/§4 (nettoyage, CI) → §7 (dettes diverses).

---

## §1. Bug tutoriel — étape « naviguer ×5 » — 🔎 DIAGNOSTIC ÉLUCIDÉ (analyse statique complète du 31/08/2026)

### Symptôme rapporté
« À l'étape 20/22, naviguer 5 fois dans l'arbre ne fait pas avancer l'étape. »

### ⚠️ Confusion de numérotation (vérifiée)
L'affichage est `{stepIndex + 1}/{totalSteps}` (`TutorialOverlay.tsx:628`) et le tableau `STEPS` compte 22 entrées, mais **les commentaires du code ont dérivé** (deux « 5 », un « 15b »…). En vrai :
- L'étape « naviguer ×5 » (commentaire `17: Test repertoire`, ligne 401) = index 18 → affichée **19/22**
- L'étape affichée **20/22** = index 19 (`18: Bouton entraînement`, ligne 448) : cliquer « S'entraîner » sur Gambit Dame, avance quand la modale `training-confirm` s'ouvre

→ Le bug rapporté concerne soit 19/22 (le compteur ×5), soit 20/22 (le bouton). **Tester les deux.** Les défauts réels trouvés dans le compteur (ci-dessous) peuvent produire les deux symptômes.

### Mécanisme réel (TutorialOverlay.tsx:401-447, lu intégralement)
À l'entrée de l'étape, `subscribe()` : (1) `initExampleData()` crée les répertoires « Gambit Dame » + « Sicilienne » ; (2) un `setTimeout(300ms)` appelle `selectRepertoire(1)` ; (3) `refId = currentNodeId` est capturé **avant** le timeout ; (4) une souscription zustand incrémente `navCount` à chaque changement de `currentNodeId` et appelle `next()` après 600 ms quand `navCount >= 5`.

### Défauts réels identifiés (par ordre de gravité)

| # | Défaut | Preuve | Effet |
|---|---|---|---|
| **D1** | **Timeouts empilés** : `if (navCount >= 5) setTimeout(next, 600)` se déclenche à CHAQUE navigation ≥ 5. Naviguer 6-7 fois vite = 2-3 `next()` → **saut d'étapes** (19/22 → 21/22 en sautant 20/22) | `TutorialOverlay.tsx:439-441` | L'utilisateur atterrit sur une étape dont la consigne ne correspond plus à l'écran → « bloqué » |
| **D2** | **Incrément fantôme** : `selectRepertoire(1)` à +300 ms change `currentNodeId` → la souscription compte **1 navigation sans action utilisateur** (refId capturé avant le timeout) | ordre des instructions lignes 420-432 | Compteur affiche 1/5 d'office ; combiné à D1, favorise le double-next |
| **D3** | **`navForward` (▶) inerte au départ** : `selectRepertoire` vide `redoStack` et positionne sur `_findLastUniquePosition` (fin du tronc commun, nœud c4). Le bouton ▶ ne fait rien (`redoStack` vide, `repertoire.ts:692-693`) et ◀ ne compte plus une fois à la racine (3 clics max). Un utilisateur qui « avance » au bouton ▶ voit **0 réaction** | `repertoire.ts:713-728` (selectRepertoire), `689-696` (navForward) | Perception « la navigation ne marche pas » — cause UX très plausible du ticket |
| **D4** | **`selectRepertoire(1)` = indice codé en dur** : si l'utilisateur n'a pas créé son répertoire aux étapes 2-4 (skip), `[1]` = Sicilienne (noirs, échiquier retourné) au lieu de Gambit Dame — incohérent avec l'étape 20/22 qui parle de « Gambit Dame » | `TutorialOverlay.tsx:423` | Étape 20/22 potentiellement incohérente |
| **D5** | **StrictMode** (activé, `main.tsx:12`) : en DEV uniquement, l'effet tourne 2× → `initExampleData()` 2× → **exemples dupliqués** dans le panneau | `useStepSubscriptions`, `TutorialOverlay.tsx:33-37` | Pollue le diagnostic en dev — tester en build prod aussi |

### Correctif proposé (petit, localisé dans le `subscribe` de l'étape)
```tsx
let navCount = 0;
let advanced = false;                       // D1 : un seul next()
let armed = false;                          // D2 : ignorer les changements programmatiques
setTimeout(() => {
  selectRepertoire(idxExampleWhite());      // D4 : repertoires.findIndex(r => r.isExample && r.color === 'w')
  …
  refId = useRepertoireStore.getState().currentNodeId;  // re-capturer APRÈS la sélection
  armed = true;
}, 300);
const unsub = useRepertoireStore.subscribe((state) => {
  if (!armed || advanced || state.currentNodeId === refId) return;
  refId = state.currentNodeId;
  navCount++;
  …
  if (navCount >= 5) { advanced = true; setTimeout(() => next(), 600); }
});
```
Pour D3 : soit démarrer sur la **racine** du répertoire d'exemple (la consigne « naviguer » devient naturelle avec ▶ après un premier clic d'arbre), soit reformuler la consigne : « Cliquez sur les coups dans l'arbre » (le clic d'arbre passe par `navigateToNode` et compte toujours).

### Protocole de test
1. Build prod (`npm run build && npm run preview`) — pas seulement dev (D5)
2. Étape 19/22 : naviguer **lentement** ×5 par clics d'arbre → avance une seule fois vers 20/22
3. Étape 19/22 : naviguer **vite** ×8 → ne doit PAS sauter 20/22 (test anti-D1)
4. Étape 19/22 : n'utiliser QUE les boutons ◀/▶ sous l'échiquier → doit pouvoir atteindre 5 (test D3)
5. Étape 20/22 : cliquer « S'entraîner » sur le répertoire actif → modale s'ouvre → avance
6. Dev : vérifier qu'il n'y a qu'UN « Gambit Dame » dans le panneau après l'étape (D5 — si doublon, déplacer `initExampleData` hors de l'effet ou le rendre idempotent)

### Solution de repli (inchangée)
Bouton « J'ai essayé, continuer » sur cette étape si le fix propre traîne.

---

## §2. Suppression des logs de debug — [CODE]

Occurrences re-vérifiées le 31/08/2026 (chemins exacts) :

| Fichier | Ligne | Contenu | Action |
|---|---|---|---|
| `src/components/modals/TrainingDefeatModal.tsx` | 13 | `[DEBUG TrainingDefeatModal] repColor…` | Supprimer |
| `src/services/tooltipContent.tsx` | 128, 203, 317 | `[DEBUG …Tooltip] boardFlipped…` | Supprimer |
| `src/services/report.ts` | 60 | `[DEBUG fetchChesscomReport] URL…` | Supprimer |
| `src/stores/reportStore.ts` | 48 | `[DEBUG setParams]` **avec stack trace** | Supprimer |
| `src/services/stats.ts` | 268, 277 | Timing des requêtes stats (`GET … → status (ms)`) | Utile au diagnostic → convertir en `_dbg` plutôt que supprimer |
| `backend/src/services/chesscomPlayerStatsService.js` | 291 | Résumé archives parsées | Log opérationnel légitime → **garder** (ou passer en `console.info`) |

Deux options :
- **Option A (rapide)** : supprimer purement les lignes marquées « Supprimer ».
- **Option B (recommandée)** : les remplacer par le pattern `_dbg` de `training.ts:15-17` (no-op hors `import.meta.env.DEV`). Extraire `_dbg` dans `src/utils/debug.ts` pour le partager.

Garde-fou : ajouter la règle ESLint dans `eslint.config.js` :
```js
rules: { 'no-console': ['warn', { allow: ['warn', 'error'] }] }
```
(en `warn` d'abord pour ne pas casser le lint existant ; passer en `error` une fois le code propre).

> État ESLint vérifié : `@typescript-eslint/no-explicit-any` est déjà en `error` ✅, mais **contourné par des `/* eslint-disable */` en tête de fichier** dans `src/services/api.ts` et `src/services/authService.ts` — précisément les fichiers à typer (audit docs/08 L1). La règle `no-console` est absente.

Vérification finale : `grep -rn "console.log" src/` → seul `debug.ts` (et les `console.warn/error` légitimes) doivent rester.

---

## §3. Nettoyage du code legacy — [CODE]

| Élément | Constat (re-vérifié 31/08) | Action |
|---|---|---|
| `js/` (racine) | ✅ **déjà vidé** — dossier vide | Supprimer le dossier vide + retirer `'js/'` des ignores de `eslint.config.js` |
| `engine/` (racine) | ✅ **déjà vidé** — dossier vide | Supprimer le dossier vide + retirer `'engine/'` des ignores ESLint |
| `data/openings.json` (racine) | Doublon ; le code charge `/data/openings.json` = `public/data/` (`src/services/openings.ts:18`). **Comparaison faite (SHA-256) : les 2 fichiers sont strictement identiques** (537 957 octets) | Supprimer la copie racine `data/` sans autre vérification |
| `backend/check-db.js`, `backend/check-dupes.js` | Scripts ponctuels | Les déplacer dans `backend/scripts/` ou les supprimer s'ils sont obsolètes |
| `backend/migrate-identity.sql` | Remplacé par migrate-v2 (docs/01) | Renommer `.OBSOLETE` ou supprimer après la migration v2 |
| `interfacemobile.md` | Plan **déjà appliqué** dans le code (cf. docs/04 §2) | Document historique — archiver ou supprimer |
| `SECURITE.md` (2 copies : racine + `.github/instructions/`) | Docs vivants ; disent « TTL 8h » alors que le code dit **24h** (`config.js:17`) | Corriger la valeur dans les DEUX copies après le fix docs/01 §4 ; envisager de n'en garder qu'une (celle de `.github/instructions/` est lue par les agents) |

⚠️ Avant chaque suppression : commit propre au préalable, suppression dans un commit dédié → réversible.

---

## §4. Dette technique backend — [CODE]

### 4a. `chess.js` désaligné — usage backend cartographié
- Frontend : `chess.js@^1.3` — Backend : `chess.js@^0.10.3`
- **Usage backend exact (vérifié)** : uniquement `chesscomPlayerStatsService.js` lignes 158-177 — `new Chess()`, `game.load_pgn(cleaned, { sloppy: true })`, `game.history({ verbose: true })`, `replay.fen()`, `replay.move({from,to,promotion})`
- **Migration ^1.x = ~10 lignes dans UNE fonction** : `load_pgn(pgn, {sloppy})` → `loadPgn(pgn)` (lance une exception au lieu de retourner `false` → envelopper dans try/catch qui `return null`) ; `history({verbose})`, `fen()`, `move()` gardent la même forme
- **Option A (recommandée)** : upgrader et adapter ces 10 lignes + re-tester un rapport chess.com complet
- Option B (supprimer la validation) : sans objet ici — ce n'est pas de la validation mais du parsing de PGN côté serveur, indispensable

### 4b. Tests backend inexistants
Le front a Vitest (`src/test/setup.ts`), le backend n'a rien. Minimum viable :
- `npm i -D vitest supertest` dans `backend/`
- Tests prioritaires (dans l'ordre de valeur) : `authService` (signup/login/logout + cas d'erreur), validators zod, `userController` (les 4 nouveaux endpoints docs/01 §3), tokenService (docs/03 §2 : expiration, usage unique)
- Base : SQLite en mémoire — **vérifié : `DB_PATH=:memory:` fonctionne tel quel** (`config.js` lit `process.env.DB_PATH` ; `initSqlite` fait `path.dirname(':memory:')` = `'.'` qui existe → `new Database(':memory:')` OK)

### 4c. CI GitHub Actions — `.github/workflows/ci.yml` (nouveau)
```yaml
name: CI
on: [push, pull_request]
jobs:
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npx tsc -p tsconfig.app.json --noEmit
      - run: npm test -- --run
      - run: npm run build
  backend:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: backend } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: backend/package-lock.json }
      - run: npm ci
      - run: npm test --if-present
        env: { JWT_SECRET: ci-test-secret }
```
> Adapter les noms de scripts aux `package.json` réels — **vérifié** : racine a bien `lint` (`eslint .`) et `test` (`vitest`, mode watch → le `-- --run` du workflow est indispensable) ; `backend/` n'a NI `lint` NI `test` (seulement `start`/`dev`) → le `--if-present` couvre ça en attendant 4b.

---

## §5. Logo & identité — [CODE léger]

État : `src/components/layout/TopBar.tsx` ligne 142 → `<div className="brand-logo">A</div>` (lettre placeholder). Décision actée : logo texte pour l'instant.

1. **Minimum** : remplacer « A » par « B » ou « ♞ » (cavalier Unicode, cohérent thème échecs) + vérifier le style `.brand-logo` dans index.css
2. **Recommandé (1 h de travail)** : petit SVG inline — un cavalier stylisé ou un « B » avec une pièce. Créer `src/components/common/BrandLogo.tsx` exportant le SVG, utilisé par TopBar (2 occurrences : lignes 142 et ~211) et par le SplashScreen
3. Générer depuis le même SVG :
   - `public/favicon.svg` + fallback `favicon.ico` (outil : realfavicongenerator.net)
   - Icône Play Store 512×512 (docs/04 §6)
   - Image Open Graph 1200×630 (§6)

---

## §6. SEO / metas — [CODE léger]

Audit de `index.html` : **rien** à part charset/viewport, et le titre dit encore « Blundertale : Beta Fermée ». À remplacer par :

```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>Blundertale — Répertoire d'ouvertures & entraînement aux échecs</title>
  <meta name="description" content="Construisez votre répertoire d'ouvertures d'échecs, entraînez-vous contre votre propre arbre et analysez vos parties avec Stockfish. Gratuit.">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <meta property="og:title" content="Blundertale — Entraînement aux ouvertures d'échecs">
  <meta property="og:description" content="Construisez votre répertoire, entraînez-vous, analysez avec Stockfish.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://tondomaine.com">
  <meta property="og:image" content="https://tondomaine.com/og-image.png">
  <meta name="twitter:card" content="summary_large_image">
  <html lang="fr"> <!-- déjà présent ✅ -->
</head>
```
+ créer `public/og-image.png` (1200×630) et `public/robots.txt` :
```
User-agent: *
Allow: /
Disallow: /app
```
> `Disallow: /app` : la SPA authentifiée n'a pas d'intérêt SEO ; la landing `/`, si.

Optionnel post-v1 : prerendering de la landing pour les crawlers (vite-plugin ou Vercel OG) — pas bloquant, Google exécute le JS.

---

## §7. Divers relevés pendant l'audit (petits, à traiter en passant)

1. `backend/src/config.js:17` — `tokenTTL: '24h'` : traité en docs/01 §4
2. `src/index.css` — fichier monolithique volumineux : découpage par domaine (layout/, board/, modals/…) **optionnel**, uniquement si une refonte CSS est déjà en cours. Ne pas le faire « pour faire beau » juste avant une publication.
3. `README.md` racine absent (seul `backend/README.md` existe) : en créer un minimal — setup dev (2 terminaux : `npm run dev` racine + backend, `JWT_SECRET` requis), architecture en 5 lignes, lien vers ROADMAP.md
4. Doublon de nom trompeur : `src/services/authService.ts` (front) vs `backend/src/services/authService.js` — pas d'action, juste s'en souvenir en naviguant
5. Nom du dossier workspace (« Projet echecs couille ») apparaît dans certains chemins d'outils — sans impact produit, mais si le repo devient public, vérifier qu'aucun chemin absolu n'est committé
6. **`GET /api/health` n'existe pas** (vérifié dans `index.js` — aucune route hors routers métier) : à ajouter avant UptimeRobot (docs/07 §6.5) — 3 lignes : `app.get('/api/health', (req, res) => res.json({ ok: true }))`
7. `index.html` : prévoir aussi `<meta name="theme-color" content="#…">` (couleur de la barre d'URL Android/onglets) en même temps que les metas §6
8. `storage.ts` : try/catch déjà partout ✅ (Safari nav. privée géré) — sauf `clearState()` sans try/catch (cas d'échec quasi théorique, à aligner en passant)
9. `backend/index.js` : le serveur démarre même si `initDb()` échoue en dev (`.finally()` → `app.listen`) — comportement voulu mais surprenant ; en prod il `process.exit(1)` ✅
