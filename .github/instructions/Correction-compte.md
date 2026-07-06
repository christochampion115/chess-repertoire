# Plan de correction — Blundertale

> Audit de régression : session guest, synchronisation des données, étanchéité des sessions
> Dernière mise à jour : 06/07/2026

---

## Résumé

7 bugs identifiés (dont 3 bloquants) suite à la migration TypeScript. **Aucune refonte backend nécessaire.** Toutes les corrections sont dans le frontend : `authService.ts`, `SplashScreen.tsx`, et les stores Zustand.

---

## Contexte : ce qui s'est passé

L'ancien code vanilla (`js/auth.js`) fonctionnait correctement :
- `syncUserSettings()` envoyait `{ settings: { repFolders, repOrder, boardTheme, analysisSettings, statsFilters } }`
- `fetchAndApplyRemoteSettings()` récupérait les settings au login
- `applyRemoteRepertoires()` mergeait données locales et serveur
- `clearSessionState()` nettoyait complètement le passage en guest

La migration TypeScript (commit `5f1d72d`) a simplifié/réécrit ces fonctions en perdant :
1. Le bon payload format pour `syncUserSettings`
2. Le `GET /user-settings` au login
3. La logique de merge local↔serveur
4. Le nettoyage lors du passage en mode invité
5. L'attente de sync avant logout

---

## 🔴 Bloquants (corriger immédiatement)

### B1 — Payload `syncUserSettings()` mal formé

**Fichier :** `src/services/authService.ts:482`

**Problème :** La fonction envoie `body: { repFolders: folders }` mais le backend attend `req.body.settings`.

**Correction :**
```ts
// Avant :
body: { repFolders: folders },

// Après :
body: {
  settings: {
    repFolders: folders,
    repOrder:    useRepertoireStore.getState().repertoires
                 .filter((r) => !r.isExample).map((r) => r.id),
    boardTheme:  useSettingsStore.getState().boardTheme ?? null,
    analysisSettings: {
      multiPV:    useAnalysisStore.getState().settings.multiPV,
      showArrows: useAnalysisStore.getState().settings.showArrows,
      arrowCount: useAnalysisStore.getState().settings.arrowCount,
    },
    statsFilters: { /* … valeurs actuelles … */ },
  },
},
```

---

### B2 — `fetchAndApplyRemoteSettings()` supprimé

**Fichier :** `src/services/authService.ts`

**Problème :** Après login et bootstrap, les settings utilisateur (dossiers, thème, analyse, filtres) ne sont jamais récupérés depuis le serveur.

**Correction — Ajouter dans `bootstrapSession()` (après `_applyServerRepertoires`) :**
```ts
const settingsResp = await apiRequest('/user-settings', { token });
if (settingsResp?.settings) {
  applyRemoteSettings(settingsResp.settings);
}
```

**Correction — Ajouter dans `finalizeAuthenticatedSession()` (même endroit) :**
```ts
const settingsResp = await apiRequest('/user-settings', { token });
if (settingsResp?.settings) {
  applyRemoteSettings(settingsResp.settings);
}
```

**Nouvelle fonction `applyRemoteSettings()` :**
```ts
function applyRemoteSettings(settings: Record<string, unknown>): void {
  if (!settings || typeof settings !== 'object') return;

  // 1. Dossiers
  if (settings.repFolders && typeof settings.repFolders === 'object') {
    useRepertoireStore.getState().setRepFolders(settings.repFolders as RepFolders);
  }

  // 2. Ordre des répertoires
  if (Array.isArray(settings.repOrder) && settings.repOrder.length > 0) {
    saveState('rep-display-order', settings.repOrder);
    // Réordonner state.repertoires selon settings.repOrder
    const store = useRepertoireStore.getState();
    const orderMap = new Map(
      (settings.repOrder as string[]).map((id, i) => [id, i])
    );
    const sorted = [...store.repertoires].sort((a, b) => {
      const ia = orderMap.get(a.id) ?? Infinity;
      const ib = orderMap.get(b.id) ?? Infinity;
      return ia - ib;
    });
    store.setRepertoires(sorted);
  }

  // 3. Thème du plateau
  if (settings.boardTheme && typeof settings.boardTheme === 'object') {
    const { useSettingsStore } = await import('@/stores/settingsStore');
    useSettingsStore.getState().setBoardTheme(settings.boardTheme as { light: string; dark: string });
  }

  // 4. Paramètres d'analyse
  if (settings.analysisSettings && typeof settings.analysisSettings === 'object') {
    const as = settings.analysisSettings as Record<string, unknown>;
    if (typeof as.multiPV === 'number') {
      useAnalysisStore.getState().updateSettings({ multiPV: Math.min(5, Math.max(1, as.multiPV)) });
    }
    if (typeof as.showArrows === 'boolean') {
      useAnalysisStore.getState().updateSettings({ showArrows: as.showArrows });
    }
    if (typeof as.arrowCount === 'number') {
      useAnalysisStore.getState().updateSettings({ arrowCount: Math.min(5, Math.max(1, as.arrowCount)) });
    }
  }

  // 5. Filtres stats
  if (settings.statsFilters && typeof settings.statsFilters === 'object') {
    const sf = settings.statsFilters as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (typeof sf.eloMin === 'number') patch.eloMin = sf.eloMin;
    if (typeof sf.eloMax === 'number') patch.eloMax = sf.eloMax;
    if (typeof sf.currentDatabase === 'string') patch.currentDatabase = sf.currentDatabase;
    if (typeof sf.sortBy === 'string') patch.sortBy = sf.sortBy;
    useStatsStore.getState().updateFilters(patch as any);
  }
}
```

---

### B3 — Mode invité : données compte visibles

**Fichier :** `src/components/layout/SplashScreen.tsx:19`

**Problème :** `handleGuest()` appelle seulement `setGuestMode(true)` sans vider les répertoires du compte.

**Correction :**
```ts
const handleGuest = useCallback(() => {
  resetAllUserStores();              // vide répertoires, stats, training
  useAuthStore.getState().logout();  // vide auth + status='guest'
  setGuestMode(true);                // flag invité
  setStatus('guest');
}, [setGuestMode, setStatus]);
```

---

## 🟡 Moyens (corriger cette itération)

### B4 — Debounce `syncUserSettings()` supprimé

**Fichier :** `src/services/authService.ts:476`

**Problème :** L'ancien code avait un debounce de 600ms, le nouveau envoie le PUT à chaque clic.

**Correction — Ajouter une variable module-level :**
```ts
let _settingsSyncTimer: ReturnType<typeof setTimeout> | null = null;
```

**Correction — Wrapper dans la fonction :**
```ts
export function syncUserSettings(): void {
  const folders = useRepertoireStore.getState().repFolders;
  if (!useAuthStore.getState().token) return;
  if (!folders) return;

  if (_settingsSyncTimer) clearTimeout(_settingsSyncTimer);
  _settingsSyncTimer = setTimeout(() => {
    _settingsSyncTimer = null;
    apiRequest('/user-settings', {
      method: 'PUT',
      token: useAuthStore.getState().token,
      body: {
        settings: {
          repFolders: folders,
          /* … autres champs … */
        },
      },
    }).catch((err) => {
      console.warn('[sync] syncUserSettings failed:', err?.message);
    });
  }, 600);
}
```

---

### B5 — Aucune attente de sync avant logout

**Fichier :** `src/services/authService.ts:292-307`

**Problème :** `logoutSession()` appelle `resetAllUserStores()` immédiatement, les PUT en cours sont perdus.

**Correction :**
```ts
export async function logoutSession(): Promise<void> {
  const token = useAuthStore.getState().token;
  const store = useRepertoireStore.getState();

  // Attendre la sync si des changements sont en attente
  if (store.dirtyIds.size > 0) {
    try {
      await Promise.race([
        _flushDirtyRepertoires(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ]);
    } catch {
      console.warn('[logout] sync timeout ou échec, déconnexion forcée');
    }
  }

  try {
    if (token) {
      await apiRequest('/auth/logout', { method: 'POST', token });
    }
  } catch {
    // Silencieux
  } finally {
    resetAllUserStores();
    useAuthStore.getState().logout();
  }
}
```

---

### B6 — Pas de fallback local si serveur injoignable

**Fichier :** `src/services/authService.ts:146-151`

**Problème :** Si `GET /auth/me` réussit mais `GET /repertoires` échoue (réseau), le catch non-401 ne charge aucun fallback. L'utilisateur voit un écran vide.

**Correction :**
```ts
} catch (error: any) {
  if (error?.status === 401) {
    auth.setToken('');
    auth.setUser(null);
    auth.setStatus('guest');
    resetAllUserStores();
  } else {
    auth.setSyncStatus('error', 'Connexion perdue, veuillez vous reconnecter');
    // Garder les données locales (Zustand persist) plutôt que vider
    // Ne pas appeler resetAllUserStores() ici
  }
}
```

---

## 🟢 Faibles (amélioration continue)

### B7 — Overwrite merge local↔serveur

**Fichier :** `src/services/authService.ts:159-179`

**Problème :** `_applyServerRepertoires()` remplace les répertoires sans comparer avec les données locales. Si le serveur a des données obsolètes, les coups joués hors-ligne sont perdus.

**Priorité :** Faible si B1-B6 sont corrigés, car le serveur devient alors la source de vérité fiable.

**Correction si nécessaire :**
```ts
async function _applyServerRepertoires(remoteReps: any[]): Promise<void> {
  const store = useRepertoireStore.getState();
  const localReps = store.repertoires; // données Zustand persist

  const loaded: RepertoireNode[] = [];
  const serverIdMap: Record<string, number> = {};
  const serverUpdatedAtMap: Record<string, string> = {};

  for (const entry of remoteReps) {
    const data = entry?.data;
    if (!data) continue;
    const rep = deserializeFromServer(data);
    if (!rep) continue;

    // Comparer avec la version locale, garder la plus récente
    const local = localReps.find((r) => r.id === rep.id);
    if (local && shouldPreferLocal(local, rep)) {
      loaded.push(local);
      // Marquer dirty pour re-sync
      store.markDirty(local.id);
    } else {
      loaded.push(rep);
    }

    if (entry.serverId) serverIdMap[rep.id] = entry.serverId;
    if (entry.updatedAt) serverUpdatedAtMap[rep.id] = entry.updatedAt;
  }

  // Ajouter les répertoires locaux qui n'existent pas sur le serveur
  for (const local of localReps) {
    if (!loaded.find((r) => r.id === local.id)) {
      loaded.push(local);
    }
  }

  store.setRepertoires(loaded);
  store.setServerIdMap(serverIdMap);
  for (const [localId, updatedAt] of Object.entries(serverUpdatedAtMap)) {
    store.setServerUpdatedAt(localId, updatedAt);
  }
}

function shouldPreferLocal(local: RepertoireNode, remote: RepertoireNode): boolean {
  // Comparer sur updatedAt (timestamp + nombre de nœuds)
  const localNodes = countNodes(local);
  const remoteNodes = countNodes(remote);
  if (localNodes !== remoteNodes) return localNodes > remoteNodes;
  return (local.updatedAt ?? 0) > (remote.updatedAt ?? 0);
}

function countNodes(node: RepertoireNode): number {
  let count = 1;
  for (const child of node.children) count += countNodes(child);
  return count;
}
```

---

## B8 — Gestion erreur involontaire (401 / expiration)

**Fichier :** `src/services/authService.ts`

**Problème :** Sur 401, `resetAllUserStores()` est appelé directement sans message utilisateur. L'utilisateur perd ses données sans comprendre pourquoi.

**Correction dans `bootstrapSession()` :**
```ts
if (error?.status === 401) {
  // Tenter une dernière sync avant de virer
  if (store.dirtyIds.size > 0) {
    _flushDirtyRepertoires().catch(() => {});
  }
  auth.setToken('');
  auth.setUser(null);
  auth.setStatus('guest');
  resetAllUserStores();
  auth.setError('Session expirée. Veuillez vous reconnecter.');
}
```

**Correction dans les callbacks sync (`_flushDirtyRepertoires`) :**
```ts
if (err?.status === 401) {
  useAuthStore.getState().setError('Connexion perdue, veuillez vous reconnecter');
  // Ne pas remettre en dirty, la session est morte
  store.clearDirty(localId);
  continue;
}
```

---

## Récapitulatif des modifications

| # | Fichier | Changement | Priorité | Effort |
|---|---|---|---|---|
| B1 | `authService.ts:482` | Payload `{ settings: { … } }` | 🔴 | 5 min |
| B2 | `authService.ts:116-155` + nouveau | `fetchAndApplyRemoteSettings()` | 🔴 | 15 min |
| B3 | `SplashScreen.tsx:19` | `resetAllUserStores()` + `logout()` | 🔴 | 10 min |
| B4 | `authService.ts:476` | Debounce 600ms | 🟡 | 5 min |
| B5 | `authService.ts:292-307` | Attendre `_flushDirtyRepertoires` | 🟡 | 15 min |
| B6 | `authService.ts:146-151` | Fallback local + message | 🟡 | 10 min |
| B7 | `authService.ts:159-179` | Merge local↔serveur | 🟢 | 30 min |
| B8 | `authService.ts` (multi) | Message 401 utilisateur | 🟢 | 10 min |

**Total :** ~1h30 de code, aucun changement backend.

---

## Dépendances entre les correctifs

```
B1 ──── indépendant
B2 ──── indépendant mais dépend du format B1 pour l'écriture
B3 ──── indépendant
B4 ──── indépendant
B5 ──── dépend de B4 (le debounce évite les conflits de timer)
B6 ──── indépendant
B7 ──── dépend de B5 + B6 (sécurité : ne merge que si le serveur est fiable)
B8 ──── indépendant
```

**Ordre recommandé :** B1 → B2 → B3 → B4 → B5 → B6 → B8 → B7
