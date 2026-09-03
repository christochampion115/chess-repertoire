# 03 — Emails transactionnels (Resend)

> Décisions actées : **Resend** plan gratuit (3 000 emails/mois, 100/jour — largement suffisant), domaine perso (~10 €/an, seule dépense du chantier). Flux conformes au **OWASP Forgot Password Cheat Sheet**.
> Prérequis : docs/01 §2 exécuté (table `auth_tokens` créée, email-only en place).

---

## §1. Mise en place hors-code — [HORS-CODE]

1. **Acheter un domaine** (OVH, Namecheap, Porkbun…). Ex. : `blundertale.com` / `.app` / `.be`.
2. **Configurer Vercel** : ajouter le domaine au projet (Settings → Domains), suivre les instructions DNS (A/CNAME).
3. **Compte Resend** (resend.com) → Add Domain → ajouter les enregistrements DNS fournis chez le registrar :
   - TXT DKIM (`resend._domainkey`)
   - TXT SPF (souvent inclus via le record Return-Path MX/TXT que Resend fournit)
   - Attendre la vérification (minutes à quelques heures)
4. Créer une **API key** Resend (permission "Sending access" uniquement).
5. **Render** → service backend → Environment :
   - `RESEND_API_KEY` = la clé
   - `EMAIL_FROM` = `Blundertale <no-reply@tondomaine.com>`
   - `APP_BASE_URL` = `https://tondomaine.com` — ⚠️ règle OWASP : ne JAMAIS construire les liens d'email depuis le header `Host` de la requête (attaque Host header injection) ; toujours depuis cette variable
6. Mettre à jour `CORS_ORIGIN` sur Render si le domaine du front change.

---

## §2. Service email backend — [CODE]

### `backend/src/services/emailService.js` (nouveau)

Pas besoin du SDK : l'API REST Resend suffit (aucune dépendance nouvelle, Node 18+ a `fetch`).

```js
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';
const EMAIL_FROM = process.env.EMAIL_FROM || 'Blundertale <no-reply@localhost>';
const RESEND_API_KEY = process.env.RESEND_API_KEY;

async function sendEmail({ to, subject, html, text }) {
  if (!RESEND_API_KEY) {
    // Mode dev : pas de clé → afficher le contenu en console au lieu d'envoyer
    console.log(`[emailService DEV] To: ${to}\nSubject: ${subject}\n${text}`);
    return { dev: true };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${body}`);
  }
  return res.json();
}

module.exports = { sendEmail, APP_BASE_URL };
```

### `backend/src/services/tokenService.js` (nouveau) — gestion `auth_tokens`

```js
const crypto = require('crypto');

// Génère un token, stocke SON HASH (jamais le clair — OWASP), renvoie le clair pour l'email
async function createToken(db, { userId, purpose, newEmail = null, ttlMinutes }) {
  const token = crypto.randomBytes(32).toString('base64url'); // 256 bits d'entropie (CSPRNG)
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
  // Invalider les tokens précédents de même purpose pour ce user (un seul actif à la fois)
  await db.run(
    `UPDATE auth_tokens SET "usedAt" = NOW() WHERE "userId" = $1 AND purpose = $2 AND "usedAt" IS NULL`,
    [userId, purpose]
  );
  await db.run(
    `INSERT INTO auth_tokens ("userId", "tokenHash", purpose, "newEmail", "expiresAt")
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, tokenHash, purpose, newEmail, expiresAt]
  );
  return token;
}

// Consomme un token : valide + non expiré + non utilisé → le marque utilisé, renvoie la ligne
async function consumeToken(db, { token, purpose }) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const row = await db.get(
    `SELECT * FROM auth_tokens
     WHERE "tokenHash" = $1 AND purpose = $2 AND "usedAt" IS NULL AND "expiresAt" > NOW()`,
    [tokenHash, purpose]
  );
  if (!row) return null;
  await db.run(`UPDATE auth_tokens SET "usedAt" = NOW() WHERE id = $1`, [row.id]);
  return row;
}

module.exports = { createToken, consumeToken };
```
> ⚠️ Adapter la syntaxe aux helpers réels de `backend/src/db.js` (l'abstraction PG/SQLite existante — vérifier les noms `run`/`get`/`all` et le placeholder `$1` vs `?`). En SQLite, remplacer `NOW()` par `datetime('now')`.

### TTL des tokens (recommandations OWASP)
| Purpose | TTL |
|---|---|
| `reset-password` | **15 min** |
| `verify-email` | **24 h** |
| `change-email` | **1 h** |

### Nettoyage périodique
Dans `backend/src/index.js`, il existe déjà un `setInterval` 6h pour purger `revoked_tokens` → ajouter au même endroit :
```sql
DELETE FROM auth_tokens WHERE "expiresAt" < NOW() - INTERVAL '7 days';
```

---

## §3. Flux 1 : mot de passe oublié — [CODE]

### Routes (dans `authRoutes.js`)
```js
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/reset-password', authLimiter, authController.resetPassword);
```

### `POST /api/auth/forgot-password` — body `{ email }`
1. Chercher le user par email (LOWER)
2. **Réponse UNIFORME dans tous les cas** (OWASP — anti-énumération) : `200 { message: "Si un compte existe avec cet email, un lien a été envoyé." }` — même si l'email est inconnu, même si le user n'a pas d'email
3. Si le user existe : `createToken(purpose:'reset-password', ttl:15)` → email avec lien `${APP_BASE_URL}/reset-password?token=...`
4. Le temps de réponse doit être similaire dans les deux branches (l'envoi Resend est le point lent → fire-and-forget avec `.catch(console.error)`, ne pas `await` avant de répondre)

### `POST /api/auth/reset-password` — body `{ token, newPassword }`
1. `consumeToken({ token, purpose: 'reset-password' })` → 400 générique si null (« Lien invalide ou expiré »)
2. Valider `newPassword` (zod, min 8 max 128 — mêmes règles que signup)
3. Hash bcrypt → `UPDATE users SET password = ...`
4. **Révoquer toutes les sessions** du user (`revoked_tokens`)
5. **NE PAS connecter automatiquement** (OWASP) → le front redirige vers le login
6. Envoyer un email de notification « Votre mot de passe a été modifié » (OWASP)

### Frontend
- Lien « Mot de passe oublié ? » dans le formulaire login de l'AuthModal → petit formulaire email → message uniforme
- Nouvelle route `/reset-password` dans `src/App.tsx` → composant `ResetPasswordPage.tsx` (lit `?token=` via `useSearchParams`, formulaire nouveau mot de passe ×2, appelle l'endpoint, redirige vers `/` avec toast succès)
- ✅ **Vérifié** : l'accès direct à `/reset-password?token=…` depuis un email fonctionnera sur Vercel sans config supplémentaire — `vercel.json` contient déjà le fallback SPA `{ "source": "/(.*)", "destination": "/index.html" }`

---

## §4. Flux 2 : vérification d'email — [CODE]

### Au signup (modifier `authService.signup`)
Après l'INSERT : `createToken(purpose:'verify-email', ttl: 24*60)` → email de bienvenue avec lien `${APP_BASE_URL}/verify-email?token=...`. L'envoi ne doit **pas** faire échouer le signup s'il plante (try/catch + log).

### `POST /api/auth/verify-email` — body `{ token }`
`consumeToken` → `UPDATE users SET "emailVerified" = TRUE WHERE id = row."userId"`.

### `POST /api/auth/resend-verification` — authentifié, rate-limité
Regénère un token si `emailVerified = FALSE`.

### Politique de blocage — deux options (décision à prendre)
- **Option A (recommandée)** : email non vérifié = simple bandeau informatif dans l'app (« Vérifie ton email pour pouvoir récupérer ton compte ») — **aucune fonctionnalité bloquée**. Le forgot-password exige de toute façon un email qui reçoit le lien, donc le risque d'un email non vérifié est faible.
- **Option B** : bloquer le forgot-password vers des emails non vérifiés. Plus strict, mais peut enfermer dehors un utilisateur légitime qui a perdu son mot de passe avant de vérifier. Non recommandé.

### Frontend
Route `/verify-email` → `VerifyEmailPage.tsx` (auto-submit du token au mount, affiche succès/échec). Bandeau conditionnel si `user.emailVerified === false` avec bouton « Renvoyer l'email ».

> Les comptes existants ont `emailVerified = TRUE` d'office (migration docs/01 §2a étape 4) → aucun bandeau pour eux.

---

## §5. Flux 3 : changement d'email (utilisé par ProfileModal, docs/01 §3)

1. `PUT /api/user/email { email, password }` → re-vérifier mdp → `createToken(purpose:'change-email', newEmail, ttl:60)` → email envoyé à la **NOUVELLE** adresse → réponse « Un lien de confirmation a été envoyé à … »
2. `POST /api/auth/confirm-email-change { token }` → `consumeToken` → `UPDATE users SET email = row."newEmail", "emailVerified" = TRUE` (vérifier l'unicité de l'email juste avant l'UPDATE, il peut avoir été pris entre-temps → 409)
3. Optionnel mais recommandé (OWASP) : notifier l'**ancienne** adresse du changement.

---

## §6. Templates d'email

Sobre, texte d'abord (meilleure délivrabilité). Un helper par template dans `emailService.js` :
- `sendVerificationEmail(to, link)` — « Bienvenue sur Blundertale ! Confirme ton adresse : {link} (valide 24 h) »
- `sendPasswordResetEmail(to, link)` — « Réinitialise ton mot de passe : {link} (valide 15 min). Si tu n'es pas à l'origine de cette demande, ignore cet email. »
- `sendPasswordChangedEmail(to)` — « Ton mot de passe vient d'être modifié. Si ce n'est pas toi, réinitialise-le immédiatement et contacte-nous. »
- `sendEmailChangeConfirmation(to, link)`

HTML minimal : logo texte, un paragraphe, un bouton/lien, footer avec mention légale + lien politique de confidentialité (cohérence RGPD, docs/05).

---

## §7. Tests — [TEST]

1. **Dev sans clé** : les liens s'affichent en console → tester les 3 flux en local
2. **Prod** : forgot-password sur ton propre compte → email reçu < 1 min, lien fonctionne, ancien mdp KO
3. Anti-énumération : forgot-password avec un email bidon → même message, pas d'erreur
4. Token réutilisé → « Lien invalide ou expiré »
5. Token expiré (mettre TTL 1 min temporairement en local) → idem
6. Vérifier le spam-score : mail-tester.com (envoyer un email de test à l'adresse fournie) → viser ≥ 9/10 (DKIM/SPF corrects)
