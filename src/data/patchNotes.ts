export interface PatchNoteEntry {
  id: string;
  date: string;
  title: string;
  excerpt: string;
  content: string;
}

export const PATCH_NOTES: PatchNoteEntry[] = [
  {
    id: 'v2.0.0',
    date: '21/06/2026',
    title: 'Migration TypeScript & correction de bugs',
    excerpt: 'Refonte en profondeur de l\'application, avec une première vague importante de corrections de bugs et d\'améliorations de l\'interface.',
    content: `Cette mise à jour marque la migration complète de l'application vers une architecture plus moderne et plus fiable. En voici les principales corrections :

**Général**
• Correction d'un bug où surligner un texte hors d'une modale la fermait intempestivement.
• Le bouton retour à l'accueil est désormais bien cliquable sur toute sa zone.
• Les mini-boards s'affichent désormais dans le sens de la couleur sélectionnée.
• Les menus clic-droit ne débordent plus des bords de l'écran et restent correctement positionnés même après un scroll. Un nouveau clic droit les referme.
• Suppression de la double barre de défilement sur l'application.
• Les menus au survol s'affichent désormais sans flash intempestif.

**Comptes**
• La modale de création de compte est maintenant stable et fonctionnelle.
• Correction de la disparition de la modale des paramètres de compte.

**Échiquier**
• La navigation dans l'échiquier (flèches directionnelles et boutons) déclenche désormais l'animation de déplacement des pièces.
• Impossible d'annoter la position de départ (coup 0) — l'annotation n'a plus d'effet.

**Répertoires**
• La fonctionnalité "Ajouter à un dossier" propose désormais les dossiers au bon niveau dans l'arborescence.
• En mode "Jeu libre", les actions de nommage de variante proposent désormais de créer un répertoire plutôt que d'aboutir à une impasse.

**Moniteur & Entraînement**
• L'affichage des variantes dans le moniteur est maintenant fonctionnel (mode libre et mode entraînement).

**Accueil**
• Le bouton "Entraînement" depuis la page d'accueil déclenche désormais bien la modale de sélection d'entraînement.`,
  },
  {
    id: 'v1.2.0',
    date: '21/06/2026',
    title: 'Notes de mise à jour & interface repensée',
    excerpt: 'Ajout du système de patch notes interne, refonte de la top bar, et nouvelles fonctionnalités de navigation.',
    content: `Cette mise à jour introduit plusieurs améliorations notables :

• **Notes de mise à jour** : un accès direct depuis la top bar permet désormais de consulter l'historique des évolutions de l'application.
• **Top bar nettoyée** : suppression des boutons fictifs (Paramètres, Aide, Contact, Abonnement) pour une interface plus épurée.
• **Modale de notes** : nouvelle interface de consultation avec vue liste et vue détail pour chaque mise à jour.

Cette version pose les bases d'une meilleure communication autour des évolutions de la plateforme.`,
  },
  {
    id: 'v1.1.0',
    date: '10/05/2026',
    title: 'Moteur d\'analyse & rapports détaillés',
    excerpt: 'Intégration du moteur Stockfish en WASM, rapports de performance, et badges de progression.',
    content: `Améliorations majeures de l'analyse :

• **Stockfish WASM** : le moteur d'échecs tourne désormais directement dans le navigateur via WebAssembly, sans latence serveur.
• **Rapports de performance** : nouvel onglet "Rapport" avec analyse détaillée, graphiques de confiance et éditeur FEN.
• **Système de médailles** : débloquez des médailles (Bronze → Chromée) en progressant dans vos répertoires.
• **Entraînement** : mode survival avec indicateur visuel de progression.`,
  },
  {
    id: 'v1.0.0',
    date: '01/03/2026',
    title: 'Lancement officiel d\'Alpha Chess',
    excerpt: 'Première version publique avec répertoire d\'ouvertures, éditeur de coups et tableau de bord.',
    content: `Première version publique de la plateforme Alpha Chess :

• **Répertoire d'ouvertures** : créez et gérez votre répertoire personnel d'ouvertures avec une interface arborescente.
• **Tableau de bord** : vue d'ensemble de votre progression, statistiques et accès rapide aux dernières parties.
• **Éditeur de coups** : navigation interactive dans l'arbre des variantes avec support des annotations.
• **Authentification** : création de compte et connexion pour sauvegarder vos répertoires dans le cloud.
• **Thèmes de plateau** : personnalisation visuelle du plateau de jeu.

Merci à tous les premiers utilisateurs pour leurs retours précieux !`,
  },
  {
    id: 'v0.9.0',
    date: '15/01/2026',
    title: 'Version bêta interne',
    excerpt: 'Première version de test avec les fonctionnalités de base du répertoire et de l\'analyse.',
    content: `Version bêta à usage interne :

• Première implémentation du répertoire d'ouvertures
• Interface de base avec plateau interactif
• Système de navigation par arbre
• Export et import de répertoires`,
  },
];
