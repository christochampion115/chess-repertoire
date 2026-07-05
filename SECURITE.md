# Plan de sécurisation — Blundertale

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
- **Valeur actuelle :** Clé de 64 octets aléatoire (générée via `crypto.randomBytes`)
- **Risque :** Un attaquant peut forger des JWT et usurper n'importe quel compte.
- **Correctif :** Générer une clé forte (`crypto.randomBytes(64).toString('base64')`). Supprimer la valeur par défaut — `config.js` plante si `JWT_SECRET` est absent.
- **Statut :** ✅

### 2. Credentials de production en clair
- **Fichier :** `backend/.env`
- **Exposé :** Mot de passe PostgreSQL + token API Lichess (`lip_...`)
- **Risque :** Accès direct à la base de données distante.
- **Correctif :** Remplacer les valeurs réelles par des placeholders. Les vrais secrets sont uniquement dans le Dashboard Render. `DATABASE_URL` supprimée (SQLite en local).
- **Statut :** ✅

### 3. SSL PostgreSQL désactivé
- **Fichier :** `backend/src/db.js:14`
- **Code :** `ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false`
- **Risque :** Attaque MITM sur réseau Render — interception de tout le trafic DB.
- **Correctif :** Activer la vérification du certificat en production. Désactivé en local (SQLite).
- **Statut :** ✅

### 4. Rate limiting inexistant sur les endpoints publics
- **Fichiers :** `backend/src/middleware/rateLimiters.js`, `backend/src/routes/lichessStatsRoutes.js`, `chesscomStatsRoutes.js`
- **Risque :** DoS possible, épuisement des quotas API externes.
- **Correctif :** Ajout de limiteurs centralisés : stats 60 req/min, report 5 req/min, batch 10 req/min, SSE 5 req/min. Auth déplacé dans le même fichier.
- **Statut :** ✅

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
- **Code :** `corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173'`
- **Risque :** Tout site peut appeler l'API. Atténué par l'absence de cookies d'auth, mais les endpoints publics restent exposés.
- **Correctif :** Remplacer `'*'` par l'origine locale. En production, `CORS_ORIGIN` est défini dans Render Dashboard.
- **Statut :** ✅

### 7. Information leak dans les erreurs
- **Fichiers :**
  - `backend/src/utils/errorHandler.js` (nouveau)
  - `backend/src/index.js`
  - `backend/src/routes/lichessStatsRoutes.js`
  - `backend/src/routes/chesscomStatsRoutes.js`
- **Risque :** Les messages d'erreur internes (stack traces, erreurs DB) sont renvoyés au client.
- **Correctif :** Fonction utilitaire `handleError()` qui renvoie un message générique en production. En dev, le message réel est conservé.
- **Statut :** ✅

### 8. Debug logs exposant des informations
- **Fichiers :**
  - `backend/src/db.js` (chemin SQLite)
  - `backend/src/services/chesscomPlayerStatsService.js` (pseudo Chess.com)
- **Risque :** Fuite d'information système et de données utilisateur.
- **Correctif :** Nettoyer les logs : retirer le chemin SQLite et le pseudo Chess.com des messages.
- **Statut :** ✅

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

---

## 🧠 24. Modélisation des menaces (Threat Modeling)

### 24.1 Scénarios d'attaque prioritaires

| # | Scénario | Vecteur | Impact | Probabilité |
|---|----------|---------|--------|-------------|
| A | **Brute force auth** | POST `/api/auth/login` sans limite serrée | Prise de comptes | Élevée |
| B | **Scraping des stats** | Requêtes abusives sur `/api/lichess/stats`, `/api/chesscom/report` | Épuisement quota API externe + coût serveur | Élevée |
| C | **DoS via SSE** | Connexions SSE illimitées sur `/api/chesscom/report/stream` | Épuisement mémoire/threads Render | Moyenne |
| D | **Vol JWT** | XSS → localStorage → usurpation 8h | Prise de contrôle totale du compte | Moyenne |
| E | **MITM base de données** | SSL désactivé (`rejectUnauthorized: false`) sur Render → PostgreSQL | Exfiltration de toute la base | Faible (réseau interne Render) |
| F | **Attaque dépendance** | `npm audit` non intégré au CI | Exécution de code malveillant | Variable |
| G | **Abus API gratuite** | Création massive de comptes → consommation ressources | Dégradation de service | Faible |

### 24.2 Périmètre de confiance

```
[Internet]
    │
    ▼
[Vercel CDN] ──► [Vercel Serverless] ──proxy──► [Render Node.js] ──► [Render PostgreSQL]
    │                                                │
    │                                                ▼
    │                                         [Lichess API]
    │                                         [Chess.com API]
    │
    ▼ (WASM isolé)
[Stockfish Worker (client)]
```

- **Frontend → Backend :** aucun secret partagé (JWT en-tête, pas de cookie)
- **Vercel → Render :** pas de secret d'API, l'origine Render est publique
- **Render → PostgreSQL :** pas de TLS vérifié

---

## ☁️ 25. Infrastructure & Réseau

### 25.1 Cloudflare (recommandé)

Ajouter Cloudflare devant le domaine Vercel (ou un domaine dédié pour l'API) :

| Fonction | Bénéfice |
|----------|----------|
| **Proxy inverse** | Masque l'IP d'origine Render |
| **WAF** | Bloque les patterns d'attaque connus (SQLi, XSS, etc.) |
| **Rate Limiting** | Limite par IP au edge avant même d'atteindre Render |
| **DDoS Protection** | Mitigation au niveau du réseau Cloudflare |
| **Bot Fight Mode** | Bloque les bots de scraping |
| **SSL/TLS** | Terminaison TLS au edge + Full (strict) vers l'origine |

**Configuration minimale :**
```
1. Ajouter le domaine à Cloudflare (DNS proxied)
2. Définir SSL/TLS → Full (strict)
3. Activer WAF avec règles OWASP core
4. Rate limiting : 100 req/min par IP sur /api/*, 10 req/min sur /api/auth/*
5. Bot Fight Mode → On
6. Origin : autoriser uniquement les IPs Cloudflare dans Render firewall
```

### 25.2 Protection de l'origine Render

Actuellement, l'API Render est directement accessible :
- via Vercel (rewrites dans `vercel.json`)
- **et directement** via `https://chess-repertoire.onrender.com` (aucune restriction)

**Correctifs :**
1. **Render Firewall :** n'autoriser que les IPs Cloudflare (cf. [liste publique](https://www.cloudflare.com/ips/)) + IP de dev
2. **Variable d'environnement :** `TRUSTED_PROXY` pour que Render connaisse l'IP réelle du client derrière le proxy
3. **Supprimer l'accès direct :** si possible, désactiver l'accès public à l'URL Render et passer exclusivement par le domaine Cloudflare

### 25.3 TLS & HTTPS

| Point | Statut | Action |
|-------|--------|--------|
| Frontend (Vercel) | ✅ OK | TLS automatique |
| Backend (Render) | ⚠️ Partiel | Forcer TLS 1.3 uniquement |
| Base de données | ❌ `rejectUnauthorized: false` | Voir item 🔴 #3 |
| HSTS | ❌ Absent | Ajouter `Strict-Transport-Security: max-age=31536000; includeSubDomains` |
| HTTP→HTTPS redirect | ❌ À vérifier | S'assurer que Render force HTTPS |

### 25.4 Headers de sécurité (helmet)

**Actuel :** `app.use(helmet())` — configuration par défaut, CSP non spécifié.

**Cible (backend/src/index.js) :**

```js
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://images.chesscomfiles.com"],
      connectSrc: ["'self'", "https://explorer.lichess.org", "https://api.chess.com"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  noSniff: true,
  xFrameOptions: { action: "deny" },
  xPermittedCrossDomainPolicies: { permittedPolicies: "none" },
}));
```

**Headers additionnels à configurer via Render/Vercel :**

| Header | Valeur |
|--------|--------|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |

---

## 🔐 26. Stratégie Auth complète

### 26.1 Architecture cible (token-based avec refresh)

```
[Client]                          [Serveur]
   │                                  │
   │  POST /auth/login (credentials)  │
   │─────────────────────────────────►│
   │                                  │ Vérification bcrypt
   │◄─────────────────────────────────│
   │  Set-Cookie: refreshToken (HttpOnly, Secure, SameSite=Strict, Path=/api/auth)
   │  Response: { accessToken (15min), user }
   │                                  │
   │  Toutes les requêtes :           │
   │  Authorization: Bearer <access>  │
   │─────────────────────────────────►│ Vérification JWT + signature
   │                                  │
   │  POST /auth/refresh              │
   │  (cookie refreshToken auto)      │
   │─────────────────────────────────►│ Rotation : ancien révoqué, nouveau refresh + access
   │◄─────────────────────────────────│
   │  New Set-Cookie + New accessToken│
```

### 26.2 Migration localStorage → HttpOnly cookie

**Pourquoi :** un JWT en localStorage est volable par la moindre XSS. Un cookie `HttpOnly` est inaccessible au JS.

**Plan de migration (par étapes) :**

| Étape | Description | Risque |
|-------|-------------|--------|
| 1 | Ajouter endpoint `POST /auth/refresh` avec rotation (access 15min + refresh 7j) | Faible - ajout sans rupture |
| 2 | Côté client : stocker l'access token en mémoire (Zustand, pas localStorage) | Moyen - perte au refresh → UX dégradée |
| 3 | Ajouter `POST /auth/refresh` avec cookie HttpOnly pour le refresh token | Moyen - nécessite `credentials: 'include'` |
| 4 | Supprimer le persiste localStorage de l'auth | Faible - une fois le cookie établi |
| 5 | Supprimer `revoked_tokens` (rendu obsolète par la rotation) | Faible |

**Si la migration complète est trop lourde (MVP) :**
- Réduire TTL à 1h
- Ajouter `jti` (JWT ID) pour révocabilité individuelle
- Nettoyer les tokens révoqués expirés périodiquement

### 26.3 Password policy

```js
// backend/src/validators/authValidator.js
password: z
  .string()
  .min(12, "Minimum 12 caractères")
  .regex(/[A-Z]/, "Doit contenir une majuscule")
  .regex(/[a-z]/, "Doit contenir une minuscule")
  .regex(/[0-9]/, "Doit contenir un chiffre")
  .regex(/[^A-Za-z0-9]/, "Doit contenir un caractère spécial"),
```

### 26.4 Rate limiting auth renforcé

```js
// Limiteur strict pour /api/auth/login
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 tentatives par fenêtre
  message: { error: "Trop de tentatives, réessayez dans 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.ip === "127.0.0.1" || req.ip === "::1",
});

// Bloquer après N échecs consécutifs (track par email + IP)
// Stockage temporaire en mémoire ou Redis :
const loginAttempts = new Map(); // key: email|ip, value: { count, lastAttempt }

// Si count >= 5 en 15min → block 30min
```

### 26.5 Fonctionnalités auth manquantes

| Fonctionnalité | Priorité | Complexité |
|----------------|----------|------------|
| **Email verification** | 🟡 Moyen | Envoyer un email avec token de vérification, marquer `email_verified` en DB |
| **Password reset** | 🟡 Moyen | Token temporaire (15min), email avec lien, nouveau hash |
| **MFA / TOTP** | 🟢 Bas | Optionnel, après déploiement initial |
| **Session visible (liste des appareils connectés)** | 🟢 Bas | Table `sessions` avec user-agent + IP + date |

---

## 🛡️ 27. Hardening Serveur & Logging

### 27.1 Configuration Node.js / Express

```js
// backend/src/index.js
app.disable("x-powered-by"); // Déjà fait ? À vérifier
app.set("trust proxy", process.env.TRUSTED_PROXY || 1); // Requis derrière Cloudflare/Vercel
```

### 27.2 Rate limiting global

```js
// Limiteur global (toutes les routes /api/*)
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100, // 100 req/min par IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de requêtes" },
  skip: (req) => req.ip === "127.0.0.1" || req.ip === "::1",
});
app.use("/api", globalLimiter);
```

**Limite par endpoint :**

| Route | Limite | Justification |
|-------|--------|---------------|
| `/api/auth/login` | 5 req/15min | Anti brute force |
| `/api/auth/signup` | 3 req/15min | Anti création massive |
| `/api/lichess/*` | 30 req/min | Quota API Lichess limité |
| `/api/chesscom/report` | 5 req/min par IP | Endpoint lourd (scraping) |
| `/api/chesscom/batchstats` | 10 req/min | Endpoint coûteux |
| `/api/*/stream` (SSE) | 3 connexions simultanées par IP | Anti DoS SSE |
| Routes auth (me, repertoires) | 60 req/min | Usage normal |

### 27.3 Logging sécurisé

```js
// Ne JAMAIS logger le contenu des JWT, les mots de passe, ou les tokens d'API
// Exemple avec un logger structuré (pino ou winston) :

const logger = pino({
  redact: {
    paths: ["req.headers.authorization", "req.body.password", "req.body.token"],
    censor: "[REDACTED]",
  },
});

// Niveaux : debug → dev only, info → prod, warn → anomalies, error → plantages
```

### 27.4 Audit trail (actions sensibles)

Logger en base (table `audit_log`) :

| Action | Données |
|--------|---------|
| Connexion réussie/échouée | userId, IP, User-Agent, timestamp |
| Création de compte | userId, IP, timestamp |
| Suppression de compte | userId, IP, timestamp, raiton |
| Changement de mot de passe | userId, IP, timestamp |
| Appel API abusif (> seuil) | IP, endpoint, count, timestamp |

---

## 📀 28. Protection des données & Abuse Logic

### 28.1 Chiffrement des données personnelles

**Emails en base :** actuellement en clair → chiffrer avec AES-256-GCM.

```js
const crypto = require("crypto");
const ALGORITHM = "aes-256-gcm";
const KEY = Buffer.from(process.env.ENCRYPTION_KEY, "hex"); // 32 bytes hex

function encryptEmail(email) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(email, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString("hex") + ":" + tag.toString("hex") + ":" + encrypted.toString("hex");
}

function decryptEmail(ciphertext) {
  const [iv, tag, encrypted] = ciphertext.split(":").map(s => Buffer.from(s, "hex"));
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf8");
}
```

**Considérations :**
- `ENCRYPTION_KEY` : 32 bytes hex, stocké dans les secrets Render, jamais dans `.env` du repo
- Ne pas chiffrer les `id`, `username`, `createdAt` (nécessaires aux requêtes)
- Si l'email est utilisé dans des requêtes lookup (`WHERE email = ?`), ajouter une colonne `email_hash` (SHA-256) pour les recherches

### 28.2 Droit à l'oubli (RGPD)

```js
// DELETE /api/account
// 1. Valider le mot de passe actuel
// 2. Supprimer en cascade :
//    - sessions / refresh tokens
//    - repertoires
//    - training_stats
//    - saved_reports
//    - user_settings
// 3. Anonymiser l'utilisateur (supprimer email, username → "utilisateur-supprimé-{id}")
//    OU supprimer la ligne (selon contraintes FK)
// 4. Logger l'action dans audit_log
// 5. Retourner 204 No Content
```

### 28.3 Export des données (RGPD)

```js
// GET /api/account/export
// Retourne un JSON structuré :
{
  "user": { "username": "...", "email": "...", "createdAt": "..." },
  "repertoires": [ /* ... */ ],
  "training_stats": [ /* ... */ ],
  "saved_reports": [ /* ... */ ],
  "exportedAt": "2026-07-05T12:00:00Z"
}
```

### 28.4 Abuse Detection

Système de détection basé sur des seuils, pas d'IA complexe :

| Seuil | Action |
|-------|--------|
| > 1000 FENs analysées en 1h par IP | Limiter + logger |
| > 50 requêtes `/api/chesscom/report` en 1h par IP | Bloquer 1h |
| > 10 comptes créés depuis la même IP en 24h | CAPTCHA ou blocage |
| Connexions à > 3 comptes différents depuis la même IP en 5min | Bloquer 30min |

**Implémentation simple (mémoire ou Redis) :**

```js
const abuseTracker = new Map(); // IP → { counters, timestamps }

function checkAbuse(ip, action, threshold, windowMs) {
  const now = Date.now();
  const key = `${ip}:${action}`;
  const entry = abuseTracker.get(key) || { count: 0, windowStart: now };
  if (now - entry.windowStart > windowMs) { entry.count = 0; entry.windowStart = now; }
  entry.count++;
  abuseTracker.set(key, entry);
  if (entry.count > threshold) return true; // abuser
  return false;
}
```

**Limites de cette approche :**
- Perte des données au redémarrage → utiliser Redis si le scale le justifie
- Pas de persistance → un attaquant peut re-attaquer après redémarrage

### 28.5 Nettoyage périodique

Tâche CRON (ou `setInterval` côté serveur) :

```js
// Tous les jours à 3h du matin
async function maintenanceTasks() {
  // 1. Supprimer les revoked_tokens expirés (> 24h)
  await db.run("DELETE FROM revoked_tokens WHERE expiresAt < datetime('now')");
  // 2. Supprimer les sessions expirées (si refresh tokens stockés)
  // 3. Purger les abuseTracker (entrées > 24h)
  // 4. Nettoyer player_stats_cache trop vieux (> 7 jours)
  await db.run("DELETE FROM player_stats_cache WHERE createdAt < datetime('now', '-7 days')");
  // 5. Nettoyer les saved_reports non associés à un utilisateur
  // 6. Vider les utilisateurs non vérifiés (> 30 jours)
}
```

---

## Avancement global

| Priorité | Total | ✅ Fait | ❌ Restant |
|----------|-------|---------|------------|
| 🔴 Critique | 4 | 4 | 0 |
| 🟠 Élevé | 4 | 4 | 0 |
| 🟡 Moyen | 7 | 0 | 7 |
| 🟢 Bas | 8 | 6 | 2 |
| 🧠 Menaces | 7 | 0 | 7 |
| ☁️ Infrastructure | 8 | 0 | 8 |
| 🔐 Stratégie Auth | 8 | 0 | 8 |
| 🛡️ Hardening | 7 | 0 | 7 |
| 📀 Données & Abuse | 7 | 0 | 7 |
| **Total** | **60** | **14** | **46** |

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
