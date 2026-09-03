# 04 — App mobile : Capacitor (Android d'abord)

> Décisions actées : **Capacitor** (WebView native embarquant le build Vite existant — zéro réécriture), **Android en premier** (iOS exige macOS + Xcode → reporté). Docs de référence : capacitorjs.com/docs.
> Prérequis : Phase B terminée (auth stable, emails OK) — publier une app cassée sur le Play Store serait contre-productif.
> ✅ **Mise à jour audit 31/08/2026** : le responsive (§2) est déjà largement implémenté dans le code — le chantier mobile est plus court que prévu initialement.

---

## §0. Si tu me dis « GO » : la séquence exacte que j'exécuterais

Plan d'exécution concret, dans l'ordre, avec chaque commande et chaque modification de fichier. Un agent peut dérouler ce plan tel quel.

### Session 1 — Vérification responsive (~aucun code a priori)
1. `npm run dev -- --host` → ouvrir l'URL réseau sur un vrai téléphone
2. Dérouler la checklist §2 (points restants uniquement) ; corriger ce qui coince (CSS seulement)
3. **GO/NO-GO** : si l'app est utilisable au doigt sur téléphone → session 2

### Session 2 — Installation Capacitor (~1 h, aucun impact sur le web)
```powershell
npm install @capacitor/core @capacitor/app
npm install -D @capacitor/cli
npx cap init Blundertale com.blundertale.app --web-dir=dist
npm install @capacitor/android
npx cap add android
```
4. Vérifier que `capacitor.config.ts` correspond au modèle §3b
5. Créer `.env.capacitor` à la racine :
   ```
   VITE_API_URL=https://chess-repertoire.onrender.com/api
   ```
6. Ajouter dans `package.json` (racine), section scripts :
   ```json
   "build:android": "vite build --mode capacitor && cap sync android"
   ```
7. Commit : `android/` + `capacitor.config.ts` + `.env.capacitor` (aucune valeur secrète dedans)

### Session 3 — Adaptations code (~2 h, 5 fichiers)
8. **[src/App.tsx](../src/App.tsx)** (3 endroits : import ligne 2, ouverture ligne 38, fermeture ligne 55) :
   ```tsx
   import { BrowserRouter, HashRouter, Routes, Route, useLocation } from 'react-router-dom';
   import { Capacitor } from '@capacitor/core';

   const Router = Capacitor.isNativePlatform() ? HashRouter : BrowserRouter;
   // puis remplacer <BrowserRouter>…</BrowserRouter> par <Router>…</Router>
   ```
   (`@capacitor/core` sans plateforme native retourne simplement `false` sur le web → zéro impact Vercel)
9. **[index.html](../index.html)** ligne 6 — un seul attribut :
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
   ```
10. **[src/main.tsx](../src/main.tsx)** — bouton retour Android (guardé, no-op sur le web) :
    ```tsx
    import { Capacitor } from '@capacitor/core';
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/app').then(({ App: CapApp }) => {
        CapApp.addListener('backButton', ({ canGoBack }) => {
          if (canGoBack) window.history.back(); else CapApp.exitApp();
        });
      });
    }
    ```
11. **src/index.css** — safe areas sur la top bar (chercher le sélecteur `.top-bar`) :
    ```css
    .top-bar { padding-top: calc(8px + env(safe-area-inset-top)); }
    ```
12. **Backend CORS multi-origins** — appliquer §3e ([backend/src/config.js](../backend/src/config.js) + [backend/src/index.js](../backend/src/index.js)). ⚠️ À faire EN MÊME TEMPS que le fix M1 de [docs/08](08-audit-vibecoding.md) (`Vary: Origin`) — un seul remaniement du bloc CORS, pas deux.
13. **[HORS-CODE]** Render → Environment → `CORS_ORIGIN=https://<domaine-front>,https://localhost` (ajouter `capacitor://localhost` le jour d'iOS)

### Session 4 — Premier run (~1 h + installation Android Studio)
14. **[HORS-CODE]** Installer Android Studio si absent ; activer le débogage USB sur le téléphone
15. `npm run build:android` puis `npx cap open android` → Run ▶ sur l'émulateur, puis sur le device USB
16. Debug via Chrome desktop → `chrome://inspect` → inspecter la WebView

### Session 5 — Validation device réel (§5, l'ordre compte)
17. **Stockfish d'abord** (risque n°1) : lancer une analyse → éval + profondeur OK ?
18. Auth complète → si erreur réseau : c'est le CORS (étape 12-13) ou `VITE_API_URL`
19. Drag des pièces au doigt, entraînement complet, rotation, arrière-plan, back button, offline

### Session 6 — Publication (§6, hors-code sauf icônes)
20. Icône 512×512 + splash (depuis le logo, docs/06 §5) ; keystore signé ; AAB ; Play Console (25 $) ; Data Safety ; test fermé Google (~14 jours)

### Ce que je ne ferais PAS (anti-sur-ingénierie)
- Pas de `@capacitor/splash-screen`, `@capacitor/preferences`, `@capacitor/network` : le splash maison, localStorage et la gestion d'erreurs réseau existants suffisent pour la v1
- Pas de refonte du router en HashRouter partout (Option B §3c) — le conditionnel suffit
- Pas de build iOS tant qu'Android n'a pas prouvé la demande

---

## §1. Pourquoi Capacitor (justification)

| Option | Verdict |
|---|---|
| **Capacitor** | **Retenu** : réutilise 100 % du code React/Vite ; WebView system (Chrome) fait tourner le WASM Stockfish ; plugins natifs si besoin plus tard |
| PWA / TWA (Trusted Web Activity) | Alternative crédible et encore plus simple (Bubblewrap), MAIS : moins de contrôle natif, Play Store accepte les TWA mais l'app dépend à 100 % du réseau, et le passage iOS serait un cul-de-sac |
| React Native | Réécriture complète de l'UI → non |
| Flutter | Réécriture totale → non |

Risque principal identifié : **Stockfish WASM dans la WebView Android**. Les WebView modernes (Chrome ≥ 119) supportent WASM + threads si les headers COOP/COEP sont bons — mais le build actuel utilise `stockfish-18-lite-single.js` (single-threaded), ce qui **évite** justement le besoin de SharedArrayBuffer/COOP/COEP. Bonne nouvelle : le choix "single" déjà fait est le bon pour mobile. À valider sur device réel quand même (§5).

---

## §2. Prérequis responsive — ✅ largement DÉJÀ FAIT (vérifié dans le code le 31/08/2026)

Le plan `interfacemobile.md` a été appliqué depuis sa rédaction. État vérifié :

| Point | État | Preuve |
|---|---|---|
| Verrou `min-width: 900px` | ✅ supprimé | plus aucune occurrence dans src/index.css |
| Breakpoints mobiles | ✅ en place | `@media (max-width: 768px)` et `(max-width: 480px)` dans index.css (~L5554, ~L5605) |
| Menu hamburger ≤ 480 px | ✅ implémenté | `TopBar.tsx` : `isMobileMenuOpen`, `.top-menu-btn`, overlay portal (lignes 29, 135, 207+) |
| Drag tactile des pièces | ✅ Pointer Events | `useDragPiece.ts` : `onPointerDown`/`PointerEvent` (unifie souris + tactile) |
| `viewport-fit=cover` | ❌ manquant | index.html ligne 6 — traité en §0 étape 9 |
| Safe areas (`env(safe-area-inset-*)`) | ❌ manquant | aucun usage dans index.css — traité en §0 étape 11 |

### Reste à VÉRIFIER sur téléphone réel (pas à développer a priori)
1. Modales (Profile, Auth, analyse) : lisibles et fermables sur écran 360×740 ? Clavier virtuel ne masque pas les champs ?
2. Cibles tactiles ≥ 44 px sur les nœuds de l'arbre et les contrôles d'échiquier
3. Page /rapport (le travail responsive dédié a été fait — cf. mémoire projet `report-page-responsive`)

> `interfacemobile.md` (racine) est donc un document **historique** : ne pas re-dérouler son plan, il est appliqué.

---

## §3. Intégration Capacitor — [CODE]

### 3a. Installation
```powershell
npm install @capacitor/core
npm install -D @capacitor/cli
npx cap init Blundertale com.blundertale.app --web-dir=dist
npm install @capacitor/android
npx cap add android
```
Cela crée `capacitor.config.ts` + un dossier `android/` (projet Gradle natif, à committer).

### 3b. `capacitor.config.ts`
```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.blundertale.app',
  appName: 'Blundertale',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
};

export default config;
```

### 3c. Router — problème et deux solutions

`src/App.tsx` utilise `BrowserRouter`. Dans Capacitor, l'app est servie depuis `https://localhost/index.html` (WebView) : un refresh ou une navigation directe vers `/rapport` ne trouve pas de serveur pour faire le rewrite SPA → écran blanc.

- **Option A (recommandée, zéro impact web)** : garder `BrowserRouter` sur le web, `HashRouter` en natif :
  ```tsx
  import { Capacitor } from '@capacitor/core';
  import { BrowserRouter, HashRouter } from 'react-router-dom';

  const Router = Capacitor.isNativePlatform() ? HashRouter : BrowserRouter;
  // puis <Router> ... </Router> à la place de <BrowserRouter>
  ```
  Les liens d'emails (`/reset-password?token=`) ne concernent que le web → aucun conflit.
- **Option B** : `HashRouter` partout. Plus simple mais dégrade les URLs web (`/#/rapport`) et le SEO → non recommandé.

### 3d. URL de l'API — déjà quasi prêt ✅

Bonne surprise de l'audit : `src/services/api.ts` (fonction `buildApiCandidates`, lignes 8-26) supporte **déjà** `import.meta.env.VITE_API_URL` en candidat prioritaire, avec fallback `window.location.origin/api` (qui ne marchera PAS en natif) et fallbacks localhost en dev.

Il suffit donc de builder le natif avec la variable :
```powershell
# .env.capacitor (nouveau fichier) :
# VITE_API_URL=https://chess-repertoire.onrender.com/api
npx vite build --mode capacitor ; npx cap sync android
```
Et d'ajouter un script dans `package.json` :
```json
"build:android": "vite build --mode capacitor && cap sync android"
```
> ⚠️ Pointer directement Render (pas le rewrite Vercel) évite un hop inutile. Si plus tard tu as un domaine, utiliser `https://api.tondomaine.com`.

### 3e. CORS backend — [CODE]

`backend/src/index.js` utilise `config.corsOrigin` (une seule origin). En natif, l'origin de la WebView est `https://localhost` (Android) / `capacitor://localhost` (iOS). Passer à une liste :

```js
// backend/src/config.js
corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',').map(s => s.trim()),
```
```js
// backend/src/index.js — remplacer le header CORS statique par :
const origin = req.headers.origin;
if (origin && config.corsOrigin.includes(origin)) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
}
```
Puis sur Render : `CORS_ORIGIN=https://tondomaine.com,https://localhost,capacitor://localhost`

### 3f. Safe areas (encoches, barres système)
```css
/* index.css — le TopBar et le contenu bas doivent respecter les zones système */
:root { --safe-top: env(safe-area-inset-top); --safe-bottom: env(safe-area-inset-bottom); }
```
Appliquer `padding-top: var(--safe-top)` au TopBar en natif. Ajouter dans `index.html` : `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">`.

### 3g. Points de vigilance spécifiques au code
- **SplashScreen.tsx maison** : garder tel quel ; optionnellement ajouter `@capacitor/splash-screen` natif plus tard (pas indispensable)
- **localStorage** : persiste dans la WebView Android — OK pour le JWT et les données locales, comportement identique au web
- **`public/engine/`** : les fichiers Stockfish sont copiés dans `dist/` par Vite → embarqués dans l'APK (≈ +7 Mo, acceptable) ; le worker se charge depuis le bundle local, pas le réseau ✅
- **Back button Android** : par défaut Capacitor quitte l'app. Installer `@capacitor/app` et mapper sur la navigation du router :
  ```ts
  import { App as CapApp } from '@capacitor/app';
  CapApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back(); else CapApp.exitApp();
  });
  ```

---

## §4. Environnement Android — [HORS-CODE]

1. Installer **Android Studio** (≥ Ladybug/2025). Il inclut SDK + émulateur.
2. Variables : le CLI Capacitor détecte le SDK via Android Studio ; sinon `ANDROID_HOME`.
3. Ouvrir le projet : `npx cap open android` → build/run depuis Android Studio.
4. Device réel : activer le mode développeur + débogage USB → visible dans Android Studio.
5. Debug WebView : Chrome desktop → `chrome://inspect` → inspecter la WebView de l'app (console, network — indispensable pour diagnostiquer Stockfish/CORS).

---

## §5. Tests device réel — [TEST] · le plus gros risque du chantier

1. **Stockfish** : lancer une analyse → la barre d'éval bouge ? profondeur atteinte ? Si échec, `chrome://inspect` → erreurs console du worker
2. Auth complète (signup/login/logout) → si erreur réseau : vérifier CORS §3e et `VITE_API_URL`
3. Entraînement complet d'un répertoire, drag des pièces au doigt
4. Rotation d'écran, mise en arrière-plan/retour, back button
5. Offline : l'app doit afficher un message réseau propre, pas un crash (le `apiRequest` existant accumule les `networkErrors` — vérifier le message affiché)
6. Performance : sur un téléphone milieu de gamme, l'analyse ne doit pas figer l'UI (le worker isole déjà le calcul ✅)

---

## §6. Publication Play Store — [HORS-CODE]

1. **Compte Google Play Developer** : 25 $ une seule fois (play.google.com/console). Vérification d'identité (quelques jours).
2. **Signing** : Android Studio → Build → Generate Signed Bundle (AAB). Créer un keystore → **le sauvegarder précieusement** (même règle que la passphrase backup). Utiliser Play App Signing (Google gère la clé finale).
3. **Fiche store** : nom, description courte/longue, icône 512×512, feature graphic 1024×500, ≥ 2 screenshots par format. (Le logo docs/06 §5 sert ici.)
4. **Politique de confidentialité** : URL publique **obligatoire** → `https://tondomaine.com/confidentialite` (docs/05 doit être fait avant).
5. **Data Safety form** (obligatoire) — déclarer exactement :
   - Collecte : adresse email, nom d'utilisateur (identifiants de compte) — chiffrés en transit (HTTPS) — suppression possible (DELETE /api/user, docs/01 §3)
   - Pas de partage avec des tiers, pas de publicité, pas de localisation
6. **Test fermé obligatoire pour les nouveaux comptes développeur personnels** : Google exige un test fermé avec des testeurs pendant ~14 jours avant l'accès production. Prévoir des amis/testeurs (12 testeurs requis au moment de la rédaction — vérifier la règle actuelle dans la console).
7. Review Google : quelques jours.

---

## §7. iOS (reporté — pour mémoire)

- Nécessite : un Mac (ou location cloud type MacStadium), Xcode 26, compte Apple Developer **99 $/an**
- `npx cap add ios` — le code Capacitor est déjà prêt ; origin WebView = `capacitor://localhost` (déjà dans la liste CORS §3e)
- Review Apple plus stricte (design, valeur ajoutée vs site web)
- Décision : attendre que la version Android prouve la demande.
