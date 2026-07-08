# Plan de correction — Blundertale

> Plan de sécurisation et mise à niveau du système de comptes
> Dernière mise à jour : 08/07/2026

---

**Note :** Les correctifs de régression (B1-B8 suite à la migration TS) ont été appliqués. Ce document ne contient que les chantiers restants.

---

## Phase 0 — Réglages immédiats (1 fichier, 4 nombres)

### 1. Rate limiting renforcé

**Fichier :** `backend/src/middleware/rateLimiters.js`

| Endpoint | Actuel | Cible |
|---|---|---|
| Login | 10/15min | 5/15min |
| Signup | 10/15min | 3/15min |
| Password reset | — | 3/h |
| Change password | — | 5/h |

30 secondes de dev, 2 minutes de test.

---

## Phase 1 — Nouveaux endpoints backend (ne cassent rien, testables seuls)

### 2. CRUD profil

**Backend à créer :**
- `PUT /auth/profile` — modifier pseudo et/ou email (avec confirmation mot de passe)
- `PUT /auth/password` — modifier mot de passe (avec ancien mot de passe)

**Frontend :** `ProfileModal.tsx` a déjà l'UI complète (pseudo, email, password avec champs et boutons). Il suffit de remplacer les stubs `saveUsername()`, `saveEmail()`, `savePassword()` par de vrais appels API.

**Test :** curl PUT /auth/profile → `SELECT * FROM users WHERE id = ?` → valeurs modifiées.

### 3. Export des données

**Backend à créer :**
- `GET /auth/export` — agrège user + repertoires + training_stats + saved_reports → JSON

**Frontend :** Un bouton "Télécharger mes données" dans `ProfileModal.tsx`.

**Test :** curl GET /auth/export → vérifier que le JSON contient toutes les sections. Aucun effet de bord.

### 4. Suppression de compte

**Backend à créer :**
- `DELETE /auth/account` — supprime user + cascade (repertoires, training_stats, saved_reports, user_settings)

**Frontend :** Un bouton "Supprimer mon compte" avec confirmation en deux étapes dans `ProfileModal.tsx`.

**Test :** curl DELETE /auth/account → `SELECT * FROM users WHERE id = ?` → 0 lignes. Vérifier les tables filles vides pour cet userId.

---

## Phase 2 — Modification d'un flux existant

### 5. Email obligatoire à l'inscription

**5 fichiers à modifier :**

| Fichier | Changement |
|---|---|
| `AuthModal.tsx` | + champ email dans le formulaire signup |
| `authService.ts` | + email dans `signupWithCredentials()` et le body |
| `authValidator.js` | `email: .optional()` → required |
| `authService.js` (backend) | Supprimer `buildInternalEmail()`, email requis |
| `db.js` | Optionnel : colonne `account_type` pour comptes legacy |

**Test :**
- signup sans email → 400 ZodError
- signup avec email → 201
- login avec compte legacy inchangé

---

## Phase 3 — Refonte du système d'authentification

### 6. Refresh token (access 15min + refresh 7-30j)

**Backend :**
- Nouvelle table `refresh_tokens` (token hash + userId + expiresAt)
- `POST /auth/refresh` — reçoit refresh token, révoque l'ancien, émet nouveau access + nouveau refresh (rotation)
- `POST /auth/login` modifié pour émettre access + refresh
- `authMiddleware.js` adapté pour vérifier l'access token

**Frontend :**
- `authService.ts` : intercepter les 401 → tenter un refresh silencieux → retenter la requête originale
- Stocker l'access token en mémoire (plus localStorage)
- Stocker le refresh token (localStorage ou cookie)

**Test :** login → attendre 15min (ou réduire TTL en dev) → 401 → refresh silencieux → requête suivante OK. Ou test manuel avec un TTL court.

### 7. Cookies HttpOnly

**Backend :**
- Access token et refresh token → cookies `HttpOnly`, `Secure`, `SameSite=Strict`
- Supprimer le header `Authorization: Bearer` du frontend

**Frontend :**
- Plus de gestion de token : tout est dans les cookies
- `credentials: 'include'` sur tous les fetch
- Supprimer `revoked_tokens` (rotation rend obsolète)

**Attention CORS :** Frontend Vercel + Backend Render ≠ même origine → nécessite `SameSite=None; Secure` ou un proxy Vercel.

**Test :** login → vérifier cookie présent (HttpOnly, non accessible en JS) → navigation → cookie envoyé automatiquement → logout → cookie supprimé.

---

## Phase 4 — Services email

Nécessite un service SMTP (SendGrid, Mailgun).

### 8. Vérification d'email

**Backend :**
- Table `email_verification_tokens` (userId + token + expiresAt)
- `POST /auth/send-verification` → génère token + envoie email
- `POST /auth/verify-email?token=...` → marque `email_verified_at` sur users

**Frontend :** notification "Vérifiez votre email" post-signup + bouton "Renvoyer".

### 9. Password reset

**Backend :**
- Table `password_reset_tokens` (userId + token + expiresAt 15min)
- `POST /auth/forgot-password` → email avec lien contenant token
- `POST /auth/reset-password` → nouveau hash

**Frontend :**
- `AuthModal.tsx` : lien "Mot de passe oublié ?" qui bascule vers un formulaire email
- Page dédiée pour le reset (lien reçu par email)

---

## Phase 5 — Observabilité

### 10. Audit trail

**Backend :**
- Table `audit_logs` (userId, action, ip, userAgent, timestamp, metadata)
- Ajouter `INSERT INTO audit_logs` dans login (success/fail), signup, profile change, password change, account delete

**Test :** login → `SELECT * FROM audit_logs WHERE action = 'login_success'` → 1 ligne.

---

## Phase 6 — Scale & Monitoring

### 11. Abuse detection
- Rate limiting edge (Cloudflare)
- Détection création massive (IP → comptes créés)
- Détection scraping (FENs analysées / heure)

### 12. Session management
- Table `sessions` ou `refresh_tokens` enrichie (userAgent, IP, dernière activité)
- UI : liste des sessions actives dans ProfileModal + bouton "Déconnecter cet appareil"

### 13. MFA / TOTP
- Package `otplib` ou `speakeasy`
- Table `user_mfa` (secret, enabled)
- QR code + app authenticator

---

## Plan d'exécution recommandé

```
Semaine 1 :  Rate limiting (30 min) → CRUD profil (2h) → Export (1h) → Suppression (2h)
Semaine 2 :  Email obligatoire (2h)
Semaine 3-4 : Refresh token (8-12h)
Semaine 5 :  Cookies HttpOnly (4-6h) + test cross-origin
Semaine 6 :  Vérification email + Password reset (6-8h)
Semaine 7 :  Audit trail (2h)
```

Les phases 5-6 (abuse, sessions, MFA) sont déclenchables selon la croissance du nombre d'utilisateurs.

---

## Fichiers concernés (tous chantiers confondus)

### Frontend
- `src/services/authService.ts`
- `src/stores/authStore.ts`
- `src/components/modals/AuthModal.tsx`
- `src/components/modals/ProfileModal.tsx`
- `src/components/layout/SplashScreen.tsx`

### Backend
- `backend/src/routes/authRoutes.js`
- `backend/src/controllers/authController.js`
- `backend/src/services/authService.js`
- `backend/src/models/userModel.js`
- `backend/src/validators/authValidator.js`
- `backend/src/middleware/authMiddleware.js`
- `backend/src/middleware/rateLimiters.js`
- `backend/src/db.js`
