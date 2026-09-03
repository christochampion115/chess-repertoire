-- ═══════════════════════════════════════════════════════════════
-- Migration v2 : retour à un système d'identité email-only
-- Remplace et invalide migrate-identity.sql (ne plus utiliser)
-- Idempotent — gère les 3 scénarios (jamais migré / partiel / complet)
-- À exécuter UNE SEULE FOIS sur la base PostgreSQL Render
-- ═══════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════
-- Vérification post-migration (à exécuter séparément pour contrôle)
-- ═══════════════════════════════════════════════════════════════
-- SELECT id, username, email, "emailVerified" FROM users ORDER BY id;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'users';
