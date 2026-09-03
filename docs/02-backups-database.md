# 02 — Backups de la base de données

> **Constat vérifié** (render.com/docs/postgresql-backups) : le plan PostgreSQL **Free** de Render n'offre **AUCUN backup** — ni snapshot, ni point-in-time recovery, ni export. Si la DB est corrompue ou supprimée (Render supprime les DB Free après 30 jours d'expiration si non-upgradées, et les suspend parfois), **tout est perdu** : comptes, répertoires, stats d'entraînement.
> C'est LE risque n°1 du projet. À traiter avant toute autre modification.

---

## §1. Backup manuel immédiat — [HORS-CODE] · à faire MAINTENANT

1. Dashboard Render → ta base PostgreSQL → onglet **Connect** → copier **External Database URL** (celle avec `.render.com`, pas l'interne)
2. Il faut `pg_dump` en local. Sous Windows :
   - Option A : installer PostgreSQL (installeur EDB, cocher uniquement "Command Line Tools")
   - Option B : `winget install PostgreSQL.PostgreSQL.17` puis ajouter `C:\Program Files\PostgreSQL\17\bin` au PATH
   - ⚠️ La version **majeure** de pg_dump doit être ≥ à celle du serveur Render (vérifier dans le dashboard ; Render Free est typiquement en PG 16/17)
3. Dump :
   ```powershell
   pg_dump --dbname="<EXTERNAL_DATABASE_URL>" --no-owner --no-privileges -Fc -f blundertale-2026-08-31.dump
   ```
   `-Fc` = format custom compressé, restaurable sélectivement avec `pg_restore`.
4. Vérifier que le fichier n'est pas vide : `pg_restore --list blundertale-2026-08-31.dump` doit lister `users`, `repertoires`, `training_stats`, `user_settings`, `revoked_tokens`.
5. Stocker le fichier **hors** du repo (il contient les hashes bcrypt et emails → donnée personnelle). Ex. : disque local + un cloud privé.

---

## §2. Backup automatisé quotidien via GitHub Actions — [HORS-CODE] + [CODE léger]

### Pourquoi cette solution
- Gratuite (minutes Actions gratuites largement suffisantes : ~1 min/jour)
- Chiffrée (gpg symétrique) → les artefacts GitHub ne contiennent jamais de données lisibles
- Testée/restaurable → artefacts téléchargeables 30 jours (rétention max gratuite)

### Alternatives considérées
| Solution | Verdict |
|---|---|
| Upgrade Render plan payant (7 $/mois, backups quotidiens + PITR) | La plus simple, mais budget minimal acté → non pour l'instant. **À reconsidérer dès que l'app a de vrais utilisateurs.** |
| Cron sur le backend Express lui-même | Non : Render Free suspend le service (sleep), et le service n'a pas pg_dump |
| Script local planifié (Tâches Windows) | Fragile : PC éteint = pas de backup |
| **GitHub Actions planifié** | **Retenu** |

### Étapes [HORS-CODE]
1. Le repo GitHub du projet doit être **privé** (les artefacts sont liés au repo). S'il est public, créer un repo privé dédié `blundertale-backups` contenant uniquement le workflow.
2. Repo → Settings → Secrets and variables → Actions → New repository secret :
   - `DATABASE_URL` = External Database URL Render
   - `BACKUP_PASSPHRASE` = passphrase longue générée (la stocker dans ton gestionnaire de mots de passe — **sans elle les backups sont irrécupérables**)

### Étape [CODE] — créer `.github/workflows/db-backup.yml`

```yaml
name: DB Backup

on:
  schedule:
    - cron: '17 3 * * *'   # 03:17 UTC chaque nuit (éviter les heures pile, congestion GH)
  workflow_dispatch: {}      # déclenchement manuel pour tester

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - name: Install PostgreSQL client 17
        run: |
          sudo sh -c 'echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
          curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/pgdg.gpg
          sudo apt-get update -qq
          sudo apt-get install -y postgresql-client-17

      - name: Dump database
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: |
          pg_dump --dbname="$DATABASE_URL" --no-owner --no-privileges -Fc \
            -f "backup-$(date -u +%Y%m%d).dump"

      - name: Encrypt (gpg symmetric AES256)
        env:
          PASSPHRASE: ${{ secrets.BACKUP_PASSPHRASE }}
        run: |
          gpg --batch --yes --symmetric --cipher-algo AES256 \
            --passphrase "$PASSPHRASE" "backup-$(date -u +%Y%m%d).dump"
          rm "backup-$(date -u +%Y%m%d).dump"   # ne jamais uploader le clair

      - name: Sanity check (taille non nulle)
        run: |
          f="backup-$(date -u +%Y%m%d).dump.gpg"
          [ -s "$f" ] || { echo "Backup vide !"; exit 1; }
          ls -lh "$f"

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: db-backup-${{ github.run_id }}
          path: '*.dump.gpg'
          retention-days: 30
```

> ⚠️ Note cron GitHub : les schedules peuvent être décalés de plusieurs minutes, et sont **désactivés après 60 jours sans activité** sur le repo. Un simple commit de temps en temps (ou le workflow_dispatch mensuel) les maintient actifs. Option : ajouter une notification d'échec (Settings → Notifications, ou une step `if: failure()` qui ping un webhook Discord).

### Restauration (à tester UNE fois dès la mise en place) — [TEST]
```powershell
# Déchiffrer
gpg --batch --passphrase "<BACKUP_PASSPHRASE>" -o backup.dump -d backup-YYYYMMDD.dump.gpg
# Restaurer dans une DB locale de test
createdb blundertale_restore_test
pg_restore --dbname=blundertale_restore_test --no-owner backup.dump
psql -d blundertale_restore_test -c "SELECT COUNT(*) FROM users;"
```
Si le count correspond → chaîne de backup validée.

---

## §3. Cas de restauration d'urgence en prod

1. Créer une **nouvelle** DB Render (l'ancienne peut être irrécupérable)
2. `pg_restore --dbname="<NEW_EXTERNAL_URL>" --no-owner backup.dump`
3. Mettre à jour `DATABASE_URL` dans les variables d'env du service backend Render → redeploy
4. Mettre à jour le secret GitHub `DATABASE_URL`

---

## §4. Améliorations futures (post-v1, ne pas faire maintenant)

- Passage plan Render payant → backups gérés + PITR (dès premiers utilisateurs réels)
- Double destination : upload aussi vers Cloudflare R2 (10 GB gratuits, API S3) pour rétention > 30 jours
- Test de restauration automatisé mensuel dans le workflow (restaurer dans un PG service container et compter les lignes)
