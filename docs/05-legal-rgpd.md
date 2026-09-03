# 05 — Mentions légales & RGPD

> Décisions actées : éditeur = **personne physique (particulier), Belgique/UE**. Sources : gdpr.eu, CNIL (transposable), autorité belge APD.
> État actuel : `src/components/layout/LegalPage.tsx` affiche « Page en cours de rédaction » pour `/mentions-legales` et `/confidentialite` (routes déjà câblées dans `App.tsx` ✅).
> ⚠️ Je ne suis pas juriste — ceci est une base solide et proportionnée pour un projet personnel, pas un avis juridique.

---

## §1. Inventaire des données personnelles traitées (audit du code)

| Donnée | Où | Base légale RGPD | Durée |
|---|---|---|---|
| Nom d'utilisateur | `users.username` (PG Render) | Exécution du contrat (art. 6.1.b) | Vie du compte |
| Email | `users.email` | Exécution du contrat | Vie du compte |
| Mot de passe | `users.password` (hash bcrypt, jamais en clair) | Exécution du contrat | Vie du compte |
| Répertoires d'ouvertures | `repertoires` | Exécution du contrat | Vie du compte |
| Stats d'entraînement | `training_stats` | Exécution du contrat | Vie du compte |
| Préférences | `user_settings` + localStorage | Exécution du contrat | Vie du compte / navigateur |
| JWT | localStorage navigateur | Exécution du contrat | TTL token |
| Pseudos Lichess/Chess.com saisis | Relayés aux API tierces (lichess.org, api.chess.com), non stockés côté serveur (vérifier `lichessStatsService.js` / `chesscomPlayerStatsService.js` : pas de persistance trouvée) | Exécution du contrat | Non conservés |
| Logs serveur (IP dans les logs Render) | Render (hébergeur) | Intérêt légitime (sécurité, art. 6.1.f) | Rétention Render |

**Points forts existants** : pas de cookies tiers, pas d'analytics, pas de pub, CSP stricte, hashing bcrypt, rate limiting. → **Pas de bandeau cookies nécessaire** : le localStorage utilisé est strictement nécessaire au service (exemption consentement ePrivacy).

**Manques à combler (dépendances)** :
1. Droit à l'effacement → `DELETE /api/user` (docs/01 §3) — **bloquant** pour publier la politique
2. Droit d'accès/portabilité → voir §4 options
3. Sous-traitants à lister : Render (US/EU — choisir la région EU Frankfurt si possible pour la DB, vérifier dans le dashboard), Vercel, Resend (US, clauses contractuelles types)

---

## §2. Contenu — Mentions légales (`/mentions-legales`) — [CODE rédactionnel]

Remplacer le placeholder dans `LegalPage.tsx` par (adapter les `{...}`) :

```markdown
# Mentions légales

## Éditeur
Blundertale est un projet personnel édité par un particulier.
Contact : {email de contact — créer contact@tondomaine.com, alias gratuit chez la plupart des registrars}
{Belgique : pour un particulier non commerçant, nom complet non obligatoire si un moyen
de contact direct existe — mais l'anonymat complet est fragile juridiquement.
Option prudente : indiquer nom + email. Option minimale : email seul.}

## Hébergement
- Application web : Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, USA — vercel.com
- Serveur applicatif et base de données : Render Services, Inc., 525 Brannan St #300,
  San Francisco, CA 94107, USA — render.com
- Envoi d'emails : Resend (Plus Five Five, Inc.), USA — resend.com

## Propriété intellectuelle
L'interface, les textes et le code de Blundertale sont la propriété de leur auteur.
Le moteur d'analyse Stockfish est un logiciel libre sous licence GPLv3 (stockfishchess.org).
Les données d'ouvertures proviennent de sources publiques.

## Services tiers
Les statistiques de parties peuvent être récupérées via les API publiques de
Lichess (lichess.org) et Chess.com. Les pseudos saisis à cette fin sont transmis
à ces services et ne sont pas conservés par Blundertale.

## Responsabilité
Blundertale est fourni « en l'état », sans garantie de disponibilité ni d'exactitude
des analyses. L'éditeur ne peut être tenu responsable des dommages indirects
résultant de l'utilisation du service.
```

---

## §3. Contenu — Politique de confidentialité (`/confidentialite`) — [CODE rédactionnel]

```markdown
# Politique de confidentialité

Dernière mise à jour : {date}

## Qui sommes-nous ?
Blundertale ({tondomaine.com}) est un outil d'entraînement aux ouvertures d'échecs.
Responsable du traitement : l'éditeur (voir mentions légales). Contact : {email}.

## Quelles données collectons-nous ?
| Donnée | Pourquoi | Combien de temps |
|---|---|---|
| Nom d'utilisateur | Identifier votre compte | Jusqu'à suppression du compte |
| Adresse email | Connexion, récupération de compte, notifications de sécurité | Jusqu'à suppression du compte |
| Mot de passe | Sécuriser votre compte (stocké uniquement sous forme hachée bcrypt, jamais lisible) | Jusqu'à suppression du compte |
| Répertoires et statistiques d'entraînement | Fournir le service | Jusqu'à suppression du compte |
| Préférences d'affichage | Confort d'utilisation | Navigateur (localStorage) |

Nous ne collectons AUCUNE donnée de navigation, AUCUN cookie publicitaire ou
statistique, et nous ne vendons ni ne partageons vos données à des fins commerciales.

## Base légale
Le traitement est nécessaire à l'exécution du service que vous demandez en créant
un compte (article 6.1.b du RGPD). Les journaux techniques de sécurité relèvent de
notre intérêt légitime (article 6.1.f).

## Où sont stockées vos données ?
Sur les serveurs de notre hébergeur Render {préciser la région après vérification :
Frankfurt (UE) ou Oregon (US)}. Les emails transactionnels sont envoyés via Resend (USA),
encadré par les clauses contractuelles types de la Commission européenne.

## Vos droits (RGPD)
Vous pouvez à tout moment :
- **Accéder** à vos données et les **rectifier** : directement depuis votre profil
- **Supprimer** votre compte et toutes les données associées : profil → « Supprimer mon compte »
  (suppression immédiate et définitive de la base de données)
- **Exporter** vos répertoires : {selon l'option retenue en §4}
- Pour toute autre demande : {email}. Réponse sous 30 jours.
- Introduire une réclamation auprès de l'Autorité de protection des données belge
  (autoriteprotectiondonnees.be)

## Sécurité
Mots de passe hachés (bcrypt), connexions chiffrées (HTTPS/TLS), limitation des
tentatives de connexion, en-têtes de sécurité stricts (CSP), sauvegardes chiffrées.

## Services tiers
Si vous utilisez l'import de statistiques, votre pseudo Lichess ou Chess.com est
transmis à leurs API publiques respectives, soumises à leurs propres politiques.

## Modifications
Toute modification substantielle de cette politique sera signalée dans l'application.
```

---

## §4. Implémentation dans le code — [CODE]

### 4a. LegalPage.tsx
Deux options :
- **Option A (simple, recommandée)** : deux composants de contenu statique JSX (`MentionsLegalesContent`, `ConfidentialiteContent`) rendus par `LegalPage` selon la route. Pas de dépendance markdown.
- **Option B** : stocker les textes en `.md` dans `src/content/` + `react-markdown`. Plus maintenable si les textes évoluent souvent — mais dépendance en plus. Non nécessaire ici.

Styling : réutiliser la classe/style existant de LegalPage, largeur max ~720 px, liens internes vers `/confidentialite` ↔ `/mentions-legales`.

### 4b. Liens obligatoires à ajouter
- ✅ **Déjà fait** : menu mobile TopBar (`TopBar.tsx:264-267`) ET footer landing (`ViewHome.tsx:143-147`) pointent déjà vers `/mentions-legales` et `/confidentialite` — seul le **contenu** des pages manque (LegalPage = placeholder)
- ❌ AuthModal, formulaire signup : « En créant un compte, vous acceptez la [politique de confidentialité] » (case à cocher NON requise quand la base légale est le contrat — un lien visible suffit)
- ❌ Templates d'emails (docs/03 §6) : lien confidentialité en footer

### 4c. Droit d'accès / portabilité — options
- **Option A (recommandée v1)** : export des répertoires en PGN — la logique PGN existe déjà (`src/services/pgn.ts`) ; si un bouton d'export existe déjà dans l'UI, le mentionner dans la politique et c'est réglé
- **Option B** : endpoint `GET /api/user/export` renvoyant un JSON complet (profil + répertoires + stats). Propre mais du travail en plus — post-v1
- **Option C** : traitement manuel sur demande email (légal, 30 jours de délai) — filet de sécurité en attendant B

### 4d. Vérifications hors-code — [HORS-CODE]
1. Dashboard Render → région de la DB (Frankfurt EU ou US ?) → adapter le §3 « Où sont stockées vos données »
2. Créer l'alias email `contact@tondomaine.com`
3. Décider nom complet vs email seul dans les mentions légales

---

## §5. Ordre d'exécution
1. [CODE] `DELETE /api/user` (docs/01 §3) — prérequis du texte « Supprimer votre compte »
2. [HORS-CODE] §4d vérifications
3. [CODE] §2 + §3 dans LegalPage.tsx + §4b liens
4. [TEST] Les deux pages accessibles sans compte, lisibles sur mobile, liens fonctionnels
