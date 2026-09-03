# 01 — Accès aux comptes : diagnostic, migration email-only, ProfileModal

> Décisions actées : **email uniquement** (suppression du téléphone), comptes existants exemptés de vérification, budget minimal.
> Prérequis : ROADMAP A1 (backup de secours) fait.

---

## §1. Diagnostic de la panne d'accès en production

### Symptôme
Connexion/inscription cassées en prod ("accès comptes e-mail pseudo" dans ta liste).

### Cause la plus probable (à confirmer)
`backend/migrate-identity.sql` a été écrit mais **jamais exécuté sur Render**. Or le code (`authService.js`, `db.js`, `authValidator.js`) suppose le nouveau schéma :
- `backend/src/db.js` déclare `phone TEXT UNIQUE`, `emailVerified`, `phoneVerified`, contrainte `check_contact_required` — mais `CREATE TABLE IF NOT EXISTS` **ne modifie jamais** une table existante
- `backend/src/services/authService.js` fait `INSERT INTO users (username, email, phone, ...)` → si la colonne `phone` n'existe pas en prod → **erreur 500 sur chaque signup**
- Le login peut échouer aussi : `SELECT ... WHERE phone = $1` sur colonne inexistante

### Procédure de diagnostic — [HORS-CODE]
1. **Logs Render** : dashboard → service backend → Logs. Chercher :
   - `column "phone" does not exist` → migration jamais passée (scénario 1)
   - `null value in column "email" violates not-null constraint` → migration partielle (scénario 2)
   - `violates check constraint "check_contact_required"` → migration passée mais comptes anciens sans email (scénario 3)
2. **Inspecter le schéma réel** :
   ```bash
   psql "<EXTERNAL_DATABASE_URL>"
   \d users
   SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_name = 'users';
   SELECT conname FROM pg_constraint WHERE conrelid = 'users'::regclass;
   ```
3. **Compter les comptes concernés** :
   ```sql
   SELECT COUNT(*) FILTER (WHERE email LIKE '%@blundertale.local') AS faux_emails,
          COUNT(*) FILTER (WHERE email IS NULL) AS sans_email,
          COUNT(*) AS total
   FROM users;
   ```

### Si le scénario diffère
- **Scénario 2/3** : adapter `migrate-v2` ci-dessous (les `IF NOT EXISTS` / `IF EXISTS` le rendent idempotent, il gère les 3 scénarios).
- **Autre cause** (ex. `JWT_SECRET` changé sur Render → tous les tokens invalides, ou CORS) : les logs le diront. Si `CORS_ORIGIN` sur Render ne correspond plus au domaine Vercel, les préflights échouent — vérifier la variable d'env `CORS_ORIGIN` vs l'URL réelle du front.

---

## §2. Migration email-only

### 2a. Script SQL — [HORS-CODE] à exécuter via psql sur Render

Créer `backend/migrate-v2-email-only.sql` (remplace et **invalide** `migrate-identity.sql`, à ne plus utiliser) :

```sql
-- migrate-v2-email-only.sql — idempotent, remplace migrate-identity.sql
BEGIN;

-- 1. email nullable (les anciens comptes n'en ont pas de vrai)
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- 2. Neutraliser les faux emails historiques @blundertale.local
UPDATE users SET email = NULL WHERE email LIKE '%@blundertale.local';

-- 3. Colonne de vérification
ALTER TABLE users ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE;

-- 4. Comptes existants exemptés de vérification (décision actée)
UPDATE users SET "emailVerified" = TRUE WHERE email IS NOT NULL;

-- 5. Supprimer les artefacts téléphone si la migration v1 était passée partiellement
ALTER TABLE users DROP COLUMN IF EXISTS phone;
ALTER TABLE users DROP COLUMN IF EXISTS "phoneVerified";
ALTER TABLE users DROP CONSTRAINT IF EXISTS check_contact_required;
-- NE PAS recréer check_contact_required : elle casserait les comptes sans email.

-- 6. Table des tokens à usage unique (vérif email, reset password, changement email)
CREATE TABLE IF NOT EXISTS auth_tokens (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL UNIQUE,          -- SHA-256 du token, jamais le token en clair (OWASP)
  purpose TEXT NOT NULL CHECK (purpose IN ('verify-email','reset-password','change-email')),
  "newEmail" TEXT,                            -- utilisé seulement pour change-email
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "usedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens("userId");

COMMIT;
```

Exécution : `psql "<EXTERNAL_DATABASE_URL>" -f backend/migrate-v2-email-only.sql`

### 2b. Modifications code — [CODE]

**backend/src/validators/authValidator.js** — supprimer le téléphone :
```js
const signupSchema = z.object({
  username: z.string().min(3).max(30).trim(),
  email: z.string().email().max(254).trim().toLowerCase().optional(),
  password: z.string().min(8).max(128),
});
// Supprimer le .refine((data) => data.email || data.phone, ...) actuel.
// email reste OPTIONNEL au signup (un compte peut exister sans email,
// mais alors pas de récupération de mot de passe — l'UI doit l'avertir).
```
> **Alternative** si tu préfères imposer l'email aux NOUVEAUX comptes : `email: z.string().email().max(254)` sans `.optional()`. Les anciens comptes restent valides car la contrainte DB est absente. Recommandé : email obligatoire au signup (simplifie tout), optionnel seulement pour l'existant.

**backend/src/services/authService.js** :
- Supprimer toute référence à `phone` : le paramètre de `signup` (ligne 52), le bloc d'unicité phone (lignes 68-75), le `createUser({..., phone})` (ligne 78), la détection regex `/^\+?\d{7,15}$/` dans `login` (ligne 88), et le commentaire d'import ligne 4
- `login(identifier)` devient : `identifier.includes('@')` → recherche par email (en `LOWER()`), sinon → username
- Normaliser l'email en minuscules au signup ET au login (sinon doublons `Foo@x.com` / `foo@x.com` — vérifié : `userModel.findByEmail` fait `WHERE email = ?` sans LOWER)

**backend/src/middleware/authMiddleware.js** : retirer `phone: user.phone ?? null` de `req.user` (présent aux lignes 24 ET 45 — les deux middlewares, standard et optionnel)

**backend/src/db.js** :
- Retirer `phone TEXT UNIQUE`, `phoneVerified`, `check_contact_required` du DDL PG et SQLite
- Ajouter le DDL `auth_tokens` (versions PG et SQLite ; en SQLite : `INTEGER PRIMARY KEY AUTOINCREMENT`, `TEXT` pour timestamps)

**backend/src/controllers/authController.js** : retirer `phone` du body pris en compte.

**Frontend** — chercher toutes les références : `grep -ri "phone" src/` — attendu : `AuthModal` (ou équivalent), `types/auth.ts`, `services/authService.ts`. Retirer le champ téléphone du formulaire signup et du type `User`.

**backend/migrate-identity.sql** : le supprimer ou le renommer en `migrate-identity.sql.OBSOLETE` avec un commentaire d'en-tête pointant vers v2.

### 2c. Tests de validation — [TEST]
1. Local : `npm run dev` backend + front → signup avec email, login par email, login par pseudo, logout
2. Local : signup sans email (si autorisé) → OK, avec avertissement UI
3. Prod après migration : mêmes tests + login d'un **ancien** compte (pseudo)

---

## §3. ProfileModal fonctionnel

### État actuel
`src/components/modals/ProfileModal.tsx` lignes 34-36 : `saveUsername`, `saveEmail`, `savePassword` affichent tous « disponible prochainement ». Seul le logout marche. Aucune suppression de compte (obligation RGPD → docs/05).

### 3a. Nouveaux endpoints backend — [CODE]

Créer `backend/src/routes/userRoutes.js` + `backend/src/controllers/userController.js` + étendre `userModel.js`. Monter dans `index.js` : `app.use('/api/user', userRoutes)`.

| Méthode | Route | Body | Règles |
|---|---|---|---|
| `PUT` | `/api/user/username` | `{ username, password }` | re-vérifier le mot de passe (bcrypt.compare) ; unicité pseudo ; renvoyer un **nouveau JWT** si le username figure dans le payload du token |
| `PUT` | `/api/user/email` | `{ email, password }` | re-vérifier mdp ; ne PAS changer l'email immédiatement → créer un token `change-email` avec `newEmail`, envoyer le lien à la **nouvelle** adresse (docs/03 §4) ; sans email service opérationnel, fallback : changement direct + `emailVerified = FALSE` |
| `PUT` | `/api/user/password` | `{ currentPassword, newPassword }` | vérifier `currentPassword` ; hash bcrypt (12 rounds, même coût que signup) ; **révoquer tous les tokens** de l'utilisateur (insérer dans `revoked_tokens` — la table existe déjà) ; email de notification si dispo (OWASP) |
| `DELETE` | `/api/user` | `{ password }` | re-vérifier mdp ; `DELETE FROM users WHERE id = $1` — les FK `ON DELETE CASCADE` existent déjà sur `repertoires`, `training_stats`, `user_settings` (vérifié dans db.js) → suppression complète en une requête |

Toutes ces routes : `authMiddleware` + un rate limiter. Ajouter dans `rateLimiters.js` :
```js
const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 5, skip: skipLocal,
  message: { error: 'Trop de modifications, réessayez dans 15 minutes.' },
  standardHeaders: true, legacyHeaders: false,
});
```

Validation zod (`backend/src/validators/userValidator.js`, nouveau) :
```js
const updateUsernameSchema = z.object({
  username: z.string().min(3).max(30).trim(),
  password: z.string().min(1),
});
const updateEmailSchema = z.object({
  email: z.string().email().max(254).trim().toLowerCase(),
  password: z.string().min(1),
});
const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});
const deleteAccountSchema = z.object({ password: z.string().min(1) });
```

### 3b. Frontend — [CODE]
- `src/services/authService.ts` : ajouter `updateUsername`, `updateEmail`, `updatePassword`, `deleteAccount` via le `apiRequest` existant (`src/services/api.ts`)
- `ProfileModal.tsx` : remplacer les 3 stubs ; chaque formulaire demande le mot de passe actuel ; après changement de mot de passe → déconnexion forcée (tokens révoqués) ; bouton « Supprimer mon compte » avec confirmation par saisie du pseudo (pattern GitHub) + mot de passe
- `authStore.ts` : action `updateUser(partial)` pour rafraîchir username/email affichés ; sur suppression → même chemin que logout + purge du localStorage des données locales du compte

### 3c. Tests — [TEST]
Changer pseudo → visible dans TopBar sans reload. Changer mdp → déconnecté, ancien mdp KO, nouveau OK. Supprimer compte → login impossible, vérifier en DB que `repertoires` du user est vide.

---

## §4. Durcissement JWT minimal (SECURITE.md #9, chemin minimal §26.2)

Décision : PAS de refresh tokens pour la v1 (reporté). À la place :

**backend/src/config.js ligne 17** : `tokenTTL: '24h'` → `tokenTTL: '1h'`
> ⚠️ SECURITE.md dit "8h" mais le code réel dit **24h** — corriger SECURITE.md au passage (les DEUX copies : racine ET `.github/instructions/`).

**backend/src/services/authService.js** — ajout d'un `jti` au sign. ⚠️ **Le payload réel est `{ sub, email }` (`buildAuthResponse`, ligne 33) et `authMiddleware.js:20` fait `findById(payload.sub)` — il faut IMPÉRATIVEMENT conserver la claim `sub`**, sinon toutes les sessions cassent :
```js
const crypto = require('crypto');
// buildAuthResponse — remplacer le sign existant par :
const token = jwt.sign(
  { sub: user.id, jti: crypto.randomUUID() },   // email retiré (audit docs/08 M9), sub conservé
  jwtSecret,
  { expiresIn: tokenTTL }
);
```
Le `jti` permet une révocation unitaire précise dans `revoked_tokens` — aujourd'hui c'est **le token entier en clair** qui y est stocké comme clé (`revokeToken`, authService.js:9-20 ; cf. docs/08 L8) : stocker le `jti` à la place est plus court, indexable, et un dump de la table ne donne plus de sessions valides.

**Conséquence UX** : avec TTL 1h, l'utilisateur devra se reconnecter chaque heure. Deux options :
- **Option A (recommandée v1)** : TTL **12h** — compromis sécurité/UX honnête sans refresh token, sachant que le vol de token via XSS est déjà mitigé par la CSP stricte de helmet
- **Option B** : TTL 1h strict + intercepteur 401 dans `api.ts` qui rouvre l'AuthModal proprement (ne pas laisser l'app dans un état à moitié connecté)

Si Option B : dans `src/services/api.ts`, `apiRequest` doit, sur 401 avec token présent, appeler `authStore.getState().logout()` avant de rejeter.

---

## §5. Ordre d'exécution de ce document

1. §1 diagnostic (hors-code) → confirmer le scénario
2. §2b code email-only en local + tests SQLite
3. §2a migration SQL sur Render → §2c tests prod
4. §4 JWT (petit, indépendant)
5. §3 ProfileModal — après docs/03 si tu veux le flux change-email complet, sinon avec le fallback direct
