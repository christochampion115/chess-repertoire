# Plan Responsive — Blundertale

> ⚠️ **DOCUMENT HISTORIQUE — PLAN DÉJÀ APPLIQUÉ** (vérifié dans le code le 31/08/2026 : `min-width:900px` supprimé, hamburger TopBar implémenté, Pointer Events, breakpoints 480/768 en place). Ne pas re-dérouler ce plan. État à jour et points restants : [docs/04-mobile-capacitor.md](docs/04-mobile-capacitor.md) §2.

Adaptation pour interfaces mobiles et tablettes.

---

## Breakpoints

```
--bp-sm: 480px   →  Smartphones portrait
--bp-md: 768px   →  Tablettes portrait / petits desktop
--bp-lg: 1024px  →  Tablettes paysage (déjà existant)
```

Toute nouvelle media query `max-width` est ajoutée à la fin des blocs CSS existants
(dans `index.css` pour le global, dans `report.css` pour la page rapport).
Les `min-width` desktop actuelles (1200px → 3840px) restent inchangées.

---

## 1. Éléments communs à toutes les pages

### 1.1 Body — Supprimer le verrou desktop

| Fichier | Action |
|---------|--------|
| `index.css:67` | Supprimer `min-width: 900px` |
| `index.css:69` | Remplacer `padding: 24px 5vw` par `padding: clamp(12px, 4vw, 24px)` |

Sans cette suppression, aucun affichage sous 900px n'est possible.

### 1.2 Top-bar — Navigation compacte

#### ≤ 768px
- `.top-nav` : `overflow-x: auto` (déjà fait), padding des `.top-tab` → `8px`
- `.top-actions` : masquer les boutons "Médailles" et "Notes de mise à jour" (`.top-action`), ne garder que l'avatar compte
- `.brand-subtitle` : `display: none`

#### ≤ 480px
- `.top-bar` : `padding: 8px 10px`
- `.brand-title` : `font-size: 0.7rem`
- `.top-nav` remplacé par un **hamburger menu** (modification JSX dans `TopBar.tsx`)
  - Le hamburger ouvre un overlay plein écran avec les onglets en liste verticale
  - Les dropdowns s'ouvrent en accordéon dans ce menu
- `.top-actions` : seul le compte reste, sans le nom (juste l'avatar)

#### Dropdowns sur mobile
- `.top-dropdown` : `position: static; width: 100%` dans le menu hamburger
- Items : `min-height: 44px` pour le touch

### 1.3 Modales — Fullscreen sur mobile

#### ≤ 480px
- `.modal-box` : `width: 100%; max-width: 100%; border-radius: 0;`
- Padding : `26px` → `16px`
- `.modal-box h3` : `font-size: 1rem`
- `.modal-body` : `font-size: 0.85rem`
- `#modal-overlay` : `padding: 0`

#### 480px → 768px
- `.modal-box` : `width: min(100%, 480px)` (au lieu de 420px)

### 1.4 Panneaux latéraux (`.left-panel`, `.right-panel`)

Voir section 4 pour le comportement dans la page App. Dans les autres pages, pas de panneaux latéraux.

**Règle générale ≤ 768px :**
- Retirer les `min-height` fixes (`.left-panel: 620px`, `.right-panel: 650px`) → `min-height: auto`
- Les panels s'empilent verticalement quand le layout est en mono-colonne

### 1.5 Boutons — Touch targets

≤ 768px : `min-height: 44px` sur tous les boutons interactifs :
`.ctrl-btn`, `.top-action`, `.top-tab`, `.home-cta-btn`,
`.rbtn-primary`, `.rbtn-secondary`, `.cands-toggle-btn`,
`.analysis-switch`, `.accordion-header`, etc.

### 1.6 Typographie

≤ 480px : tailles de police réduites de ~10 % sur les textes courants.

---

## 2. Page d'accueil

```
#view-home
├── .home-hero
│   ├── .home-hero-bg
│   ├── .hero-particles
│   └── .home-hero-inner
│       ├── .home-hero-title
│       ├── .home-hero-subtitle
│       └── .home-hero-cta (.home-cta-btn)
├── .home-features
│   ├── .home-features-title
│   └── .home-features-grid (.feature-card ×6)
│       ├── .feature-card-icon
│       ├── .feature-card-title
│       ├── .feature-card-desc
│       └── .feature-card-link
└── .home-footer
```

### ≤ 768px

| Classe | Règle |
|--------|-------|
| `.home-hero` | `padding: 80px 20px 200px; min-height: auto` |
| `.home-hero-inner` | `max-width: 100%` |
| `.home-hero-title` | `font-size: clamp(2rem, 7vw, 3rem)` |
| `.home-hero-subtitle` | `font-size: 0.92rem` |
| `.home-hero-cta` | `flex-direction: column` |
| `.home-cta-btn` | `width: 100%; justify-content: center; min-height: 48px` |
| `.home-features` | `padding: 0 16px` |
| `.home-features-grid` | `grid-template-columns: repeat(2, 1fr)` |
| `.feature-card` | `padding: 22px 18px` |
| `.home-footer` | `font-size: 0.78rem` |

### ≤ 480px

| Classe | Règle |
|--------|-------|
| `.home-hero` | `padding: 60px 16px 140px` |
| `.home-hero-title` | `font-size: clamp(1.6rem, 9vw, 2.2rem)` |
| `.home-hero-subtitle` | `font-size: 0.85rem` |
| `.home-features` | `padding: 0 12px; margin-top: -80px` |
| `.home-features-grid` | `grid-template-columns: 1fr` |
| `.feature-card` | `padding: 18px 14px` |
| `.feature-card-icon` | `width: 40px; height: 40px; font-size: 1.4rem` |
| `.feature-card-title` | `font-size: 0.95rem` |
| `.feature-card-desc` | `font-size: 0.82rem` |
| `.feature-card-link` | `font-size: 0.78rem` |

### Notes

- `.hero-particles` masquées à ≤ 480px (décoratif, économise du calcul)
- `.feature-card--soon` masquées à ≤ 480px (ne garder que les 3 cartes actives)

---

## 3. Page Rapport

```
.report-page-root
├── .report-page-header
├── .report-tabs / .report-tab
├── Vue FORM
│   └── .report-form-outer
│       ├── .report-form-fields → .report-2col-grid
│       └── .rcard (FEN editor)
├── Vue LOADING (barre de progression)
└── Vue RESULTS
    ├── Barre filtres + bouton ← Nouvelle analyse
    ├── Grille stats (3 cartes)
    ├── Onglets Priorités / Forces
    └── .report-group-content-grid
```

### ≤ 768px

| Classe | Règle |
|--------|-------|
| `.report-page-root` | `padding: 16px !important` |
| `.report-form-outer` | `flex-direction: column; gap: 20px` |
| `.rcard` (FEN) | `width: 100% !important` |
| `.report-group-content-grid` | `grid-template-columns: 1fr` |
| `.report-page-header` | `padding: 0 14px; height: 44px` |
| `.report-tab` | `padding: 6px 14px; font-size: 0.78rem` |

**Grille stats (3 cartes)** → `grid-template-columns: repeat(2, 1fr)`

**Barre filtres + bouton** → `flex-direction: column`
Le bouton "← Nouvelle analyse" passe en `width: 100%`

### ≤ 480px

| Classe | Règle |
|--------|-------|
| `.report-2col-grid` | `grid-template-columns: 1fr` (tout en colonne) |
| `.report-page-root` | `padding: 8px !important` |
| `.report-form-outer` | `gap: 16px` |
| `.rbtn-primary`, `.rbtn-secondary` | `width: 100%; min-height: 48px` |
| `.report-page-header-label` | `font-size: 0.9rem` |
| `input`, `select` dans `.report-2col-grid` | `width: 100% !important` |

**Grille stats** → `grid-template-columns: 1fr`

**Loading view** : cavaliers animés (`♞`) → `font-size: 3rem` (au lieu de 4.5rem)

### Modifications fichier

Dans `report.css`, ajouter après les blocs `@media (min-width: ...)` existants (ligne 288) :

```css
@media (max-width: 768px) { /* règles ≤ 768px */ }
@media (max-width: 480px) { /* règles ≤ 480px */ }
```

---

## 4. Page App (Échiquier)

```
#view-app → .main-layout
├── aside.left-panel
│   └── .accordion (.accordion-item ×2)
├── section.board-area
│   ├── .board-panel
│   │   ├── .board-shell (#board + .eval-bar)
│   │   └── .board-controls (.ctrl-btn ×5)
│   └── #training-banner
└── aside.right-panel
    ├── .game-monitor
    │   ├── .monitor-header / .monitor-title
    │   ├── .monitor-pgn
    │   ├── .monitor-analysis-section
    │   └── btn-switch-freeplay / btn-open-new-rep
    └── .cands-section
        ├── .cands-toggle-btn
        ├── .stats-filter-shell
        └── .cands-body
```

### ≤ 1024px (déjà existant)

- `.main-layout` → `grid-template-columns: 1fr`
- `.left-panel` → `min-height: auto`

### ≤ 768px

| Classe | Règle |
|--------|-------|
| `.main-layout` | `gap: 14px` |
| `.board-shell` | `width: min(100%, calc(100vw - 32px))` |
| `.board-panel` | `gap: 12px` |
| `.board-controls` | `grid-template-columns: repeat(3, 1fr); padding-right: 0; gap: 8px` |
| `.ctrl-btn` | `min-height: 48px; padding: 12px` |
| `.game-monitor` | `padding: 14px 14px 10px` |
| `.monitor-title` | `font-size: 1rem; padding-right: 0` |
| `.monitor-pgn` | `height / min / max: calc(3 × 1.32em + 14px); font-size: 0.72rem` |
| `.btn-switch-freeplay` | `position: relative; top: auto; right: auto` |
| `.btn-open-new-rep` | `position: relative; top: auto; right: auto` |
| `.accordion-header` | `min-height: 44px; padding: 12px` |
| `.accordion-content` | `padding: 8px` |
| `.eval-bar` | `width: 24px; min-height: 150px` |
| `.cands-toggle-btn` | `min-height: 44px` |

### ≤ 480px

| Classe | Règle |
|--------|-------|
| `.board-shell` | `grid-template-columns: 1fr` (eval-bar en overlay ou masqué) |
| `.eval-bar` | `display: none` ou `position: absolute; right: 4px; top: 4px; width: 20px; min-height: 100px; border-radius: 4px; z-index: 10` |
| `.board-controls` | `grid-template-columns: repeat(2, 1fr)` |
| `.ctrl-btn` | `padding: 10px; font-size: 0.7rem` |
| `.game-monitor` | `padding: 10px` |
| `.monitor-title` | `font-size: 0.92rem` |
| `.monitor-pgn` | `font-size: 0.68rem` |
| `.accordion` | paddings réduits |
| `.stats-filter-btn` | `min-height: 36px; font-size: 0.7rem` |

### Gestion des panneaux latéraux — à définir

Le comportement exact des panneaux gauche (`.left-panel`) et droit (`.right-panel`)
sur mobile n'est pas encore tranché.

| Option | Description |
|--------|-------------|
| **A – Drawers** | Hamburger ouvre le left-panel en slide-in depuis la gauche. Bouton "Analyse" en bas ouvre le right-panel en slide-in depuis la droite |
| **B – Accordéon vertical** | Tout le contenu des panneaux est empilé sous l'échiquier en accordéons |
| **C – Bottom tabs** | Barre d'onglets en bas : Échiquier / Répertoires / Analyse / Monitor |

**Impact** : `AppLayout.tsx` (affichage conditionnel des `<aside>`),
`uiStore.ts` (état panel ouvert/fermé).

### Eval-bar alternatives sur mobile

1. Masquée complètement
2. Overlay semi-transparent sur le bord droit de l'échiquier
3. Remplacée par un score texte (ex: `+1.2`) dans les contrôles

---

## Ordre d'implémentation suggéré

```
Phase 1 — Infrastructure
  ├── Supprimer min-width: 900px sur body
  ├── Rendre le padding body fluide
  └── Ajouter les breakpoints ≤768px et ≤480px

Phase 2 — Éléments communs
  ├── Top-bar compacte (≤768px)
  ├── Top-bar hamburger (≤480px) — JSX
  ├── Modales fullscreen (≤480px)
  └── Touch targets (min-height: 44px)

Phase 3 — Page Accueil
  ├── Breakpoint ≤768px
  └── Breakpoint ≤480px

Phase 4 — Page Rapport
  ├── Breakpoint ≤768px
  └── Breakpoint ≤480px

Phase 5 — Page App
  ├── Breakpoint ≤1024px (déjà fait)
  ├── Breakpoint ≤768px (board, controls, monitor, accordéons)
  ├── Breakpoint ≤480px (board compact, eval-bar)
  └── Panneaux latéraux (selon décision A/B/C)
```

---

## Modifications JSX nécessaires

| Fichier | Modification |
|---------|-------------|
| `src/components/layout/TopBar.tsx` | Ajouter état `isMobileMenuOpen` + hamburger button + menu overlay pour ≤480px |
| `src/components/layout/AppLayout.tsx` | Conditionner `aside.left-panel` et `aside.right-panel` selon viewport et état panel |
| `src/stores/uiStore.ts` | (optionnel) Ajouter `leftPanelOpen`, `rightPanelOpen`, `setLeftPanelOpen`, `setRightPanelOpen` |
| Optionnel | Hook `useMediaQuery` pour détection viewport depuis React |

---

## Éléments NON modifiés

- Les `min-width` media queries desktop (1200px → 3840px) restent identiques
- Aucun framework CSS ajouté (pas de Tailwind, Bootstrap, etc.)
- Aucun nouveau fichier CSS (tout reste dans `index.css` et `report.css`)
- Le comportement desktop existant est préservé
