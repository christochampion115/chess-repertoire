# 07 — Checklist de publication (revérification globale)

> À dérouler en dernier, quand tous les autres chantiers sont fermés. Chaque ❌ = NO-GO.
> Deux passes : une avant la mise en ligne web « officielle », une avant la soumission Play Store.

---

## §1. GO/NO-GO — prérequis absolus

| # | Critère | Comment vérifier | Doc |
|---|---|---|---|
| 1 | Backup automatique en place ET restauration testée une fois | Artefact GitHub Actions téléchargé + restauré en local | 02 |
| 2 | Signup/login/logout fonctionnels en prod | Test manuel prod | 01 |
| 3 | Mot de passe oublié fonctionnel en prod | Email reçu, reset OK | 03 |
| 4 | Suppression de compte fonctionnelle | Compte test supprimé, données absentes en DB | 01 |
| 5 | Mentions légales + politique de confidentialité publiées | Les 2 URLs répondent | 05 |
| 6 | Aucun console.log de debug en prod | `grep -rn "console.log" src/` | 06 |
| 7 | Bug tutoriel 20/22 corrigé (ou étape contournée) | Tutoriel complet de bout en bout | 06 |
| 8 | `migrate-v2` exécutée, anciens comptes se connectent | Login compte historique | 01 |

---

## §2. Parcours utilisateurs manuels (prod)

### Parcours A — Nouveau venu
1. Arrivée sur `/` (landing) → splash → contenu OK, pas d'erreur console
2. Signup (email + pseudo + mdp) → email de vérification reçu → lien OK → bandeau disparu
3. Tutoriel complet (22 étapes, sans exception)
4. Créer un répertoire : ajouter ~10 coups, annotations, sauvegarde
5. F5 → tout est toujours là (persistance serveur)
6. Entraînement sur ce répertoire : victoire ET défaite (TrainingDefeatModal)
7. Analyse Stockfish : barre d'éval réagit, profondeur monte
8. Rapport (`/rapport`) : génération sans erreur
9. Logout → login → tout est là

### Parcours B — Compte historique (pré-migration)
1. Login par pseudo → OK
2. Répertoires intacts, stats intactes
3. Pas de bandeau « vérifie ton email » injustifié (exemption `emailVerified=TRUE`)
4. Ajouter un email depuis le profil → flux change-email complet

### Parcours C — Récupération
1. « Mot de passe oublié » → email < 1 min → reset → ancien mdp KO, nouveau OK
2. Email inconnu → même message (anti-énumération), aucune différence visible
3. Lien de reset réutilisé → erreur propre

### Parcours D — Destruction
1. Changer pseudo, changer mdp (→ déconnexion forcée attendue), re-login
2. Supprimer le compte → confirmation → retour landing
3. Login avec les anciens identifiants → refus propre
4. En DB : `SELECT` sur users/repertoires/training_stats/user_settings → zéro ligne pour cet id

### Parcours E — Mobile (web responsive puis APK)
1. Tous les parcours A-D sur un vrai téléphone (Chrome Android)
2. Puis sur l'APK Capacitor (docs/04 §5) — en particulier Stockfish et le drag tactile

---

## §3. Matrice navigateurs

| Navigateur | Priorité | Points sensibles |
|---|---|---|
| Chrome desktop | P0 | Référence |
| Firefox desktop | P1 | WASM Stockfish, CSS grid/flex de l'arbre |
| Edge | P2 | Normalement = Chrome |
| Safari desktop | P2 (pas de Mac → BrowserStack essai gratuit ou ami) | WASM, `env(safe-area-inset)`, date handling |
| Chrome Android | P0 | Touch, clavier virtuel qui pousse les modales |
| Safari iOS | P1 (même sans app iOS, le SITE sera visité depuis iPhone) | WASM, `env(safe-area-inset)`, date handling. localStorage nav. privée : ✅ `storage.ts` a déjà try/catch partout (vérifié) — reste à vérifier le comportement du persist zustand (`alphaChess-auth`) qui écrit en direct |

---

## §4. Sécurité (re-passe SECURITE.md + vérifs finales)

1. `npm audit --omit=dev` (racine ET backend/) → 0 vulnérabilité high/critical
2. securityheaders.com sur le domaine → viser A (helmet est déjà configuré, vérifier que Vercel n'écrase rien)
3. Test manuel : requête `/api/repertoire` sans token → 401 ; avec token expiré → 401 ; token d'un autre user → ne voit pas les données (IDOR)
4. Rate limiting : 11 logins ratés d'affilée → 429
5. XSS : créer un répertoire avec annotation `<img src=x onerror=alert(1)>` → doit s'afficher en texte, jamais exécuter
6. `JWT_SECRET` : longueur ≥ 32 chars aléatoires sur Render (pas un mot du dictionnaire)
7. Mettre à jour SECURITE.md : cocher les points résolus (#9 TTL+jti, #14 emails/effacement), corriger la mention « 8h »

---

## §5. Performance & qualité

1. **Lighthouse** (Chrome DevTools, mode navigation privée, sur le domaine prod) : viser Performance ≥ 80, Accessibility ≥ 90, Best Practices ≥ 90, SEO ≥ 90
   - Le WASM de 7 Mo ne doit PAS être chargé sur la landing (vérifier l'onglet Network : `stockfish-18-lite-single.js` seulement chargé en entrant dans `/app` / à la première analyse — si ce n'est pas le cas, lazy-loader le worker)
2. `npm run build` : taille du bundle — chercher les chunks > 500 kB (`npx vite-bundle-visualizer` en option) ; `react-router`, `chess.js`, `zustand` sont légers, le risque vient d'imports accidentels
3. Accessibilité rapide : navigation clavier complète (Tab) sur AuthModal et ProfileModal ; contrastes des textes secondaires ; `alt` sur les images
4. 404 : une URL bidon `/nimportequoi` → page propre (vérifier la route catch-all dans App.tsx, sinon en ajouter une)

---

## §6. Infrastructure finale

1. Domaine : HTTPS forcé, redirection www→apex (ou l'inverse) configurée chez Vercel
2. `vercel.json` : ✅ vérifié — rewrite `/api/(.*)` → Render ET fallback SPA `/(.*) → /index.html` déjà en place (les URLs profondes `/rapport`, `/reset-password` marchent en accès direct)
3. Render : le service Free s'endort après 15 min → premier appel lent (~30-60 s). Deux options :
   - **Option A** : accepter (le front affiche déjà les erreurs réseau proprement — améliorer avec un message « Réveil du serveur… » sur timeout du premier appel)
   - **Option B** : upgrade Render 7 $/mois (supprime le sleep ET donne les backups → double bénéfice, premier achat conseillé si le budget se débloque)
   - ⚠️ Ne PAS utiliser de « ping » cron pour maintenir éveillé : contraire aux ToS Render
4. Variables d'env Render toutes présentes : `JWT_SECRET`, `DATABASE_URL`, `CORS_ORIGIN` (liste, docs/04 §3e), `RESEND_API_KEY`, `EMAIL_FROM`, `APP_BASE_URL`
5. UptimeRobot (gratuit) sur `https://tondomaine.com` + `/api/health` — ❌ vérifié : **aucun endpoint health n'existe** dans `index.js` → en ajouter un trivial d'abord (3 lignes, docs/06 §7.6) → email si down

---

## §7. Play Store (2e passe, avant soumission)

1. Toute la §2 parcours E validée sur APK signé (pas debug)
2. `versionCode`/`versionName` cohérents dans `android/app/build.gradle`
3. Data Safety form = exactement ce que fait l'app (docs/04 §6)
4. URL politique de confidentialité renseignée et accessible
5. Test fermé Google (14 jours, testeurs requis) planifié
6. Keystore sauvegardé à deux endroits

---

## §8. Jour J

1. Backup manuel juste avant (docs/02 §1)
2. Déploiement front (Vercel) + backend (Render) — vérifier les deux dashboards verts
3. Dérouler §2 parcours A en entier sur la prod fraîche
4. Surveiller les logs Render pendant les premières heures
5. 🎉
