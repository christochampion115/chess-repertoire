# Pre-Beta Cleanup Changelog

Date: 2026-04-30

## Scope
Refactor and cleanup pass focused on maintainability, UI event wiring safety, and reducing unintended rerenders before closed beta.

## Tranche 1 - Stats refresh hardening
- Added local stats refresh helpers in `js/ui.js`:
  - `updateOpeningInfoLabel()`
  - `refreshStatsPanels()`
- Replaced full-app refresh paths with local stats refresh in sorting/filtering flow.
- Removed noisy debug logs in stats/training sections.

## Tranche 2 - First inline handler migration
- Removed inline handlers from:
  - `<body onclick=...>`
  - accordion headers
  - modal overlay close behavior
- Replaced with guarded listeners in `js/main.js`.

## Tranche 3 - Board/monitor/splash/account migration
- Migrated board controls, monitor trigger/create button, splash actions, and account modal auth actions from inline `onclick` to JS bindings.
- Added stable IDs for wiring where needed.

## Tranche 4 - Full static inline handler removal
- Removed remaining static inline `onclick`/`oncontextmenu` in HTML.
- Introduced delegated bindings for:
  - board/monitor context menu
  - context menu actions and symbols
  - repertoire modal actions
  - training modal actions

## Tranche 5 - Global window exposure removal
- Removed legacy `window.*` exposure block from bootstrap.
- Replaced remaining `ui -> window.confirm*` calls with direct module imports/calls.

## Tranche 6 - Bootstrap extraction
- Extracted DOM wiring from `js/main.js` into `js/domBindings.js`.
- Main bootstrap now calls a single `initDomBindings()` entrypoint.

## Tranche 7 - Polish
- Refactored repetitive button wiring to declarative map `BUTTON_BINDINGS` in `js/domBindings.js`.
- Reduced boilerplate in `initActionButtonBindings()`.

## Verification Snapshot
- No diagnostics in:
  - `js/main.js`
  - `js/domBindings.js`
  - `js/ui.js`
  - `Alpha chess v1.9.35.html`
- Static HTML check confirms no remaining `onclick=` or `oncontextmenu=` attributes.

## Residual Risk Notes
- Dynamic modals generated in JS still use direct `onclick` assignments in runtime-created nodes.
- No automated end-to-end tests are present; current validation is static + targeted structural checks.
