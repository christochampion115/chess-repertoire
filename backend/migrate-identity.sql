-- ═══════════════════════════════════════════════════════════════
-- OBSOLÈTE — ne pas exécuter. Remplacé par migrate-v2-email-only.sql
-- (retour à un système email-only, le téléphone a été abandonné)
-- ═══════════════════════════════════════════════════════════════
-- Migration : système d'identité étendu (email OU téléphone)
-- À exécuter UNE SEULE FOIS sur la base PostgreSQL Render
-- AVANT de déployer la nouvelle version du backend
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- 1. Nettoyer les faux emails internes générés par buildInternalEmail()
--    Ils ont tous la forme user_HEXCHAINE@blundertale.local
UPDATE users
SET email = NULL
WHERE email LIKE '%@blundertale.local';

-- 2. Rendre la colonne email nullable (elle était NOT NULL)
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- 3. Ajouter la colonne téléphone (format E.164 recommandé : +32475123456)
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT UNIQUE;

-- 4. Colonnes de vérification — prêtes pour plus tard, sans impact immédiat
ALTER TABLE users ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "phoneVerified" BOOLEAN DEFAULT FALSE;

-- 5. Contrainte : au moins un moyen de contact obligatoire
--    (protège la cohérence même si le code tombe en défaut)
ALTER TABLE users ADD CONSTRAINT check_contact_required
  CHECK (email IS NOT NULL OR phone IS NOT NULL);

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- Vérification post-migration (à exécuter séparément pour contrôle)
-- ═══════════════════════════════════════════════════════════════
-- SELECT id, username, email, phone, "emailVerified", "phoneVerified"
-- FROM users ORDER BY id;
