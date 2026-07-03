# Plan de sécurisation — Alpha Chess

> Dernière mise à jour : 28/06/2026
> Statut : Audit initial — code non sécurisé

---

## Légende

| Symbole | Signification |
|---------|---------------|
| 🔴 | **Critique** — Corriger immédiatement |
| 🟠 | **Élevé** — Corriger rapidement |
| 🟡 | **Moyen** — Planifier avant déploiement |
| 🟢 | **Faible** — Sécurité au cas où, traiter plus tard |
| ✅ | Terminé |
| 🔄 | En cours |
| ❌ | Non commencé |

---

## 🔴 CRITIQUE

### 1. JWT_SECRET faible
- **Fichier :** `backend/.env:6`, `backend/src/config.js:4`
- **Valeur actuelle :** `alpha-chess-secret-change-me`
- **Risque :** Un attaquant peut forger des JWT et usurper n'importe quel compte.
- **Correctif :** Générer une clé forte (`openssl rand -base64 64`) et la définir dans l'environnement de production.
- **Statut :** ❌

### 2. Credentials de production en clair
- **Fichier :** `backend/.env`
- **Exposé :** Mot de passe PostgreSQL + token API Lichess (`lip_...`)
- **Risque :** Accès direct à la base de données distante.
- **Correctif :** Restreindre l'accès au fichier `.env`. Ne jamais le partager. Utiliser les secrets Render/Vercel en production.
- **Statut :** ❌

### 3. SSL PostgreSQL désactivé
- **Fichier :** `backend/src/db.js:14`
- **Code :** `ssl: { rejectUnauthorized: false }`
- **Risque :** Attaque MITM sur réseau Render — interception de tout le trafic DB.
- **Correctif :** Remplacer par `ssl: { rejectUnauthorized: true }` (ou supprimer la config `ssl`).
- **Statut :** ❌

### 4. Rate limiting inexistant sur les endpoints publics
- **Fichiers :** `backend/src/routes/lichessStatsRoutes.js`, `chesscomStatsRoutes.js`
- **Risque :** DoS possible, épuisement des quotas API externes.
- **Correctif :** Ajouter `express-rate-limit` sur `/api/lichess/*` et `/api/chesscom/*`.
- **Statut :** ❌

---

## 🟠 ÉLEVÉ

### 5. XSS via `dangerouslySetInnerHTML`
- **Fichiers :**
  - `src/components/report/ReportGroupCard.tsx:152`
  - `src/components/report/ReportChildCard.tsx:43`
  - `src/services/openings.ts:112-123` (`pathToPgn()`)
- **Risque :** `pathToPgn()` construit du HTML par concaténation de chaînes sans échappement. Les SANs proviennent du répertoire (données utilisateur).
- **Correctif :** Utiliser `escapeHtml()` (déjà présent dans `openings.ts:125`) dans `pathToPgn()` avant d'insérer les valeurs dans le HTML.
- **Statut :** ❌

### 6. CORS `*` par défaut
- **Fichier :** `backend/src/config.js:19`
- **Code :** `corsOrigin: process.env.CORS_ORIGIN || '*'`
- **Risque :** Tout site peut appeler l'API. Atténué par l'absence de cookies d'auth, mais les endpoints publics restent exposés.
- **Correctif :** Définir `CORS_ORIGIN` en production vers le domaine frontend. Ne jamais utiliser `*` en prod.
- **Statut :** ❌

### 7. Information leak dans les erreurs
- **Fichiers :**
  - `backend/src/index.js:40`
  - `backend/src/routes/lichessStatsRoutes.js:24`
  - `backend/src/routes/chesscomStatsRoutes.js` (plusieurs occurrences)
- **Risque :** Les messages d'erreur internes (stack traces, erreurs DB) sont renvoyés au client.
- **Correctif :** En production, renvoyer une erreur générique et logger les détails en interne.
- **Statut :** ❌

### 8. Debug logs exposant des informations
- **Fichiers :**
  - `backend/src/db.js:100` (chemin SQLite)
  - `backend/src/services/lichessStatsService.js:10` (User-Agent avec nom du dev)
  - `src/components/report/ReportGroupCard.tsx:29` (console.log debug)
- **Risque :** Fuite d'information système et de données utilisateur.
- **Correctif :** Nettoyer les `console.log` de debug, masquer les chemins sensibles dans les logs.
- **Statut :** ❌

---

## 🟡 MOYEN

### 9. JWT stocké en localStorage
- **Fichiers :** `src/stores/authStore.ts`, `src/services/storage.ts`
- **Risque :** Volable par n'importe quelle XSS → prise de contrôle du compte. Pas de refresh token, TTL 8h.
- **Correctif :** Migrer vers HttpOnly cookie + SameSite=Strict. Alternative minimale : ajouter `jti` aux JWT + réduire TTL à 1h.
- **Statut :** ❌

### 10. Password policy trop faible
- **Fichier :** `backend/src/validators/authValidator.js:6`
- **Code :** `password: z.string().min(8)`
- **Risque :** Mots de passe faibles acceptés.
- **Correctif :** Ajouter `min(12)` + exigence de majuscule, minuscule, chiffre, caractère spécial.
- **Statut :** ❌

### 11. Pas de CSP configuré
- **Fichier :** `backend/src/index.js:14`
- **Risque :** Aucune protection CSP contre les XSS.
- **Correctif :** Configurer helmet avec `contentSecurityPolicy` explicite.
- **Statut :** ❌

### 12. SSE sans authentification ni limite
- **Fichier :** `backend/src/routes/chesscomStatsRoutes.js`
- **Endpoints :** `/report/stream`, `/stats/stream`, `/stats`
- **Risque :** Connexions persistantes illimitées → DoS. Données potentiellement personnelles en clair.
- **Correctif :** Auth requise + limite de connexions par IP + validation de l'en-tête Origin.
- **Statut :** ❌

### 13. Zod `.passthrough()` — mass assignment théorique
- **Fichier :** `backend/src/validators/repertoireValidator.js:19`
- **Risque :** Clés arbitraires autorisées dans les nœuds de répertoire. Faible car les colonnes DB sont fixes.
- **Correctif :** Remplacer `.passthrough()` par `.strict()` ou un filtrage whitelist.
- **Statut :** ❌

### 14. Emails stockés en clair — RGPD
- **Fichier :** `backend/src/services/authService.js`
- **Risque :** Données personnelles sans chiffrement. Pas de mécanisme d'export/suppression pour l'utilisateur.
- **Correctif :** Chiffrer les emails en base + implémenter le droit à l'oubli (suppression de compte).
- **Statut :** ❌

### 15. Pas de refresh token
- **Fichier :** `backend/src/config.js:18` (TTL: 8h)
- **Risque :** Un JWT volé est valide 8h sans possibilité de révocation efficace.
- **Correctif :** Schéma access token (15 min) + refresh token (7 jours) avec rotation.
- **Statut :** ❌

---

## 🟢 BAS / INFO

| # | Point | Statut | Justification |
|---|-------|--------|---------------|
| 16 | Injection SQL | ✅ **OK** | Toutes les requêtes sont paramétrées (`$1`, `?`) |
| 17 | CSRF | ✅ **OK** | Auth en header Bearer → navigateur ne l'envoie jamais automatiquement |
| 18 | Import PGN serveur | ✅ **OK** | PGN parsé côté client uniquement |
| 19 | Stockfish WASM | ✅ **OK** | Worker isolé, pas de fetch distant |
| 20 | Prototype pollution | ✅ **OK** | Pas de `Object.assign` / spread sur données utilisateur |
| 21 | `pathToPgn()` XSS réel | 🟢 **Théorique** | Les SANs d'échecs n'acceptent que `[a-zA-Z0-9=+#O-]` |
| 22 | `backend/.env` dans le repo | ✅ **OK** | Correctement gitignoré par `backend/.gitignore` |
| 23 | Fichiers `.sqlite` / `.db` | ✅ **OK** | Gitignorés |

---

## Avancement global

| Priorité | Total | ✅ Fait | ❌ Restant |
|----------|-------|---------|------------|
| 🔴 Critique | 4 | 0 | 4 |
| 🟠 Élevé | 4 | 0 | 4 |
| 🟡 Moyen | 7 | 0 | 7 |
| 🟢 Bas | 8 | 6 | 2 |
| **Total** | **23** | **6** | **17** |

---

## Procédure de vérification

Avant chaque déploiement, lancer :

```bash
npm audit
# Vérifier les dépendances frontend

cd backend && npm audit
# Vérifier les dépendances backend

# Vérifier qu'aucun secret n'est commité
git ls-files | Select-String ".env"
```

---
