/* eslint-disable @typescript-eslint/no-explicit-any */
import { apiRequest } from '@/services/api';
import { loadState, clearState } from '@/services/storage';
import { useAuthStore } from '@/stores/authStore';
import { useChessStore } from '@/stores/chessStore';
import { useRepertoireStore } from '@/stores/repertoireStore';
import { useTrainingStore } from '@/stores/trainingStore';
import { useStatsStore } from '@/stores/statsStore';
import { useAnalysisStore } from '@/stores/analysisStore';
import { useUiStore } from '@/stores/uiStore';
import { initializeService } from '@/services/repertoire';
import { retryStats } from '@/services/stats';
import type { RepertoireNode, RepFolders } from '@/types/repertoire';

// ─── Helpers ──────────────────────────────────────────────────────────────

export function isReadOnlyMode(): boolean {
  return typeof window !== 'undefined' &&
    window.location?.hostname === '127.0.0.1';
}

// ─── Serialize RepertoireNode tree → { rootId, nodes[] } ─────────────────

function serializeRepertoire(root: RepertoireNode): { rootId: string; nodes: any[] } {
  const nodes: any[] = [];
  const walk = (node: RepertoireNode) => {
    const n: any = {
      id: node.id,
      san: node.san,
      fen: node.fen,
      children: node.children.map((c) => c.id),
      moveNum: node.moveNum,
      turn: node.turn,
    };
    if (node.name)              n.name = node.name;
    if (node.color)             n.color = node.color;
    if (node.comment)           n.comment = node.comment;
    if (node.varName)           n.varName = node.varName;
    if (node.varAnnotation)     n.varAnnotation = node.varAnnotation;
    if (node.annotation)        n.annotation = node.annotation;
    if (node.createdAt != null) n.createdAt = node.createdAt;
    if (node.updatedAt != null) n.updatedAt = node.updatedAt;
    if (node.isTransposition)   n.isTransposition = true;
    if (node.sourceNodeId != null) n.sourceNodeId = node.sourceNodeId;
    if (node.folderId)          n.folderId = node.folderId;
    if (node.isExample)         n.isExample = true;
    nodes.push(n);
    for (const child of node.children) walk(child);
  };
  walk(root);
  return { rootId: root.id, nodes };
}

// ─── Deserialize server format ({ rootId, nodes[] }) → RepertoireNode ─────

function deserializeFromServer(raw: any): RepertoireNode | null {
  if (!raw || typeof raw !== 'object') return null;

  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const rootId = raw.rootId != null ? String(raw.rootId) : '';

  if (!rootId || rawNodes.length === 0) return null;

  const map = new Map<string, RepertoireNode>();

  for (const n of rawNodes) {
    if (!n || n.id == null) continue;
    const node: RepertoireNode = {
      id: String(n.id),
      san: n.san || 'Initial',
      fen: n.fen,
      parentId: null,
      children: [],
      moveNum: Number.isFinite(n.moveNum) ? n.moveNum : 0,
      turn: n.turn || 'b',
      ...(n.name ? { name: n.name } : {}),
      ...(n.color ? { color: n.color } : {}),
      ...(n.folderId ? { folderId: n.folderId } : {}),
      ...(n.comment ? { comment: n.comment } : {}),
      ...(n.varName ? { varName: n.varName } : {}),
      ...(n.varAnnotation ? { varAnnotation: n.varAnnotation } : {}),
      ...(n.annotation ? { annotation: n.annotation } : {}),
      ...(n.createdAt != null ? { createdAt: n.createdAt } : {}),
      ...(Number.isFinite(n.updatedAt) ? { updatedAt: n.updatedAt } : {}),
      ...(n.isTransposition ? { isTransposition: true } : {}),
      ...(n.sourceNodeId ? { sourceNodeId: String(n.sourceNodeId) } : {}),
      ...(n.isExample ? { isExample: true } : {}),
    };
    map.set(node.id, node);
  }

  for (const n of rawNodes) {
    if (!n || n.id == null) continue;
    const node = map.get(String(n.id));
    if (!node) continue;
    const childIds = Array.isArray(n.children) ? n.children : [];
    node.children = childIds
      .map((id: any) => map.get(String(id)) || null)
      .filter((c: any): c is RepertoireNode => c !== null);
    node.children.forEach((child) => { child.parentId = node!.id; });
  }

  return map.get(rootId) || null;
}

// ─── Session boundary reset ─────────────────────────────────────────────

export function resetAllUserStores(): void {
  useChessStore.getState().reset();
  useRepertoireStore.persist.clearStorage();
  useRepertoireStore.getState().reset();
  useTrainingStore.getState().endTraining();
  useStatsStore.persist.clearStorage();
  useStatsStore.getState().reset();
}

// ─── Appliquer les settings distants ─────────────────────────────────────

function applyRemoteSettings(settings: Record<string, unknown>): void {
  if (!settings || typeof settings !== 'object') return;

  // 1. Dossiers
  if (settings.repFolders && typeof settings.repFolders === 'object') {
    useRepertoireStore.getState().setRepFolders(settings.repFolders as RepFolders);
  }

  // 2. Ordre des répertoires
  if (Array.isArray(settings.repOrder) && settings.repOrder.length > 0) {
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
    const theme = settings.boardTheme as { light?: string; dark?: string };
    if (typeof theme.light === 'string' && typeof theme.dark === 'string') {
      useChessStore.getState().setBoardTheme({ light: theme.light, dark: theme.dark });
    }
  }

  // 4. Paramètres d'analyse
  if (settings.analysisSettings && typeof settings.analysisSettings === 'object') {
    const as = settings.analysisSettings as Record<string, unknown>;
    const patch: { multiPV?: number; showArrows?: boolean; arrowCount?: number } = {};
    if (typeof as.multiPV === 'number') patch.multiPV = Math.min(5, Math.max(1, as.multiPV));
    if (typeof as.showArrows === 'boolean') patch.showArrows = as.showArrows;
    if (typeof as.arrowCount === 'number') patch.arrowCount = Math.min(5, Math.max(1, as.arrowCount));
    if (Object.keys(patch).length > 0) {
      useAnalysisStore.getState().updateSettings(patch);
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
    if (Object.keys(patch).length > 0) {
      useStatsStore.getState().setFilters(patch as any);
    }
  }
}

// ─── Bootstrap (appelé au démarrage) ─────────────────────────────────────

export async function bootstrapSession(): Promise<void> {
  const auth = useAuthStore.getState();
  auth.setStatus('loading');
  let token = auth.token;

  if (!token) {
    const oldToken = loadState('alphaChess.authToken') as string | null;
    const oldUser = loadState('alphaChess.authUser') as Record<string, unknown> | null;
    if (oldToken) {
      token = oldToken;
      auth.setToken(oldToken);
      if (oldUser) auth.setUser(oldUser as any);
      auth.setStatus('logged');
    }
  }

  if (!token) {
    resetAllUserStores();
    initializeService();
    auth.setStatus('guest');
    return;
  }

  try {
    const session = await apiRequest('/auth/me', { token });
    auth.setUser(session.user);
    auth.setStatus('logged');

    const repResponse = await apiRequest('/repertoires', { token });
    await _applyServerRepertoires(repResponse?.repertoires || []);
    const settingsResp = await apiRequest('/user-settings', { token });
    if (settingsResp?.settings) {
      applyRemoteSettings(settingsResp.settings);
    }
    initializeService();
  } catch (error: any) {
    if (error?.status === 401) {
      const store = useRepertoireStore.getState();
      if (store.dirtyIds.size > 0) {
        _flushDirtyRepertoires().catch(() => {});
      }
      auth.setToken('');
      auth.setUser(null);
      auth.setStatus('guest');
      clearState('alphaChess.authToken');
      clearState('alphaChess.authUser');
      resetAllUserStores();
      useUiStore.getState().openModal({ type: 'session-expired' });
    } else {
      auth.setSyncStatus('error', 'Connexion perdue, veuillez vous reconnecter');
      // Garder les données locales (Zustand persist) plutôt que vider
      auth.setStatus('logged');
      initializeService();
    }
  }
}

// ─── Helpers merge ──────────────────────────────────────────────────────────

function countNodes(node: RepertoireNode): number {
  let count = 1;
  for (const child of node.children) count += countNodes(child);
  return count;
}

function shouldPreferLocal(local: RepertoireNode, remote: RepertoireNode): boolean {
  const localNodes = countNodes(local);
  const remoteNodes = countNodes(remote);
  if (localNodes !== remoteNodes) return localNodes > remoteNodes;
  return (local.updatedAt ?? 0) > (remote.updatedAt ?? 0);
}

// ─── Helper : appliquer les répertoires serveur dans le store ───────────────────

async function _applyServerRepertoires(remoteReps: any[]): Promise<void> {
  const store = useRepertoireStore.getState();
  const localReps = store.repertoires;

  const loaded: RepertoireNode[] = [];
  const serverIdMap: Record<string, number> = {};
  const serverUpdatedAtMap: Record<string, string> = {};

  for (const entry of remoteReps) {
    const data = entry?.data;
    if (!data) continue;
    const rep = deserializeFromServer(data);
    if (!rep) continue;

    // B7 : garder la version locale si elle est plus récente / plus complète
    const local = localReps.find((r) => r.id === rep.id);
    if (local && shouldPreferLocal(local, rep)) {
      loaded.push(local);
      store.markDirty(local.id); // re-syncer vers le serveur
    } else {
      loaded.push(rep);
    }

    if (entry.serverId) serverIdMap[rep.id] = entry.serverId;
    if (entry.updatedAt) serverUpdatedAtMap[rep.id] = entry.updatedAt;
  }

  // Ajouter les répertoires locaux absents du serveur (créés hors-ligne)
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

// ─── Login ────────────────────────────────────────────────────────────────

export async function loginWithCredentials({ identifier, password }: { identifier: string; password: string }): Promise<void> {
  const auth = useAuthStore.getState();
  auth.setSubmitting(true);
  auth.setError('');

  try {
    const response = await apiRequest('/auth/login', {
      method: 'POST',
      body: { identifier, password },
    });
    await finalizeAuthenticatedSession(response, false);
  } catch (error: any) {
    const msg = error?.message || '';
    if (msg.toLowerCase().includes('invalid credentials')) {
      auth.setError('Identifiants incorrects.');
    } else if (error?.status === 429) {
      auth.setError('Trop de tentatives. Réessayez dans quelques minutes.');
    } else if (!error?.status) {
      auth.setError('Serveur inaccessible. Vérifiez votre connexion.');
    } else {
      auth.setError('Connexion impossible. Réessayez ultérieurement.');
    }
  } finally {
    auth.setSubmitting(false);
  }
}

// ─── Signup ───────────────────────────────────────────────────────────────

export async function signupWithCredentials({ username, email, phone, password }: { username: string; email?: string; phone?: string; password: string }): Promise<void> {
  const auth = useAuthStore.getState();
  auth.setSubmitting(true);
  auth.setError('');

  try {
    const response = await apiRequest('/auth/signup', {
      method: 'POST',
      body: { username, email: email || undefined, phone: phone || undefined, password },
    });
    await finalizeAuthenticatedSession(response, true);
  } catch (error: any) {
    const msg = error?.message || '';
    if (error?.status === 409 || msg.toLowerCase().includes('username already')) {
      auth.setError('Ce nom d\'utilisateur est déjà pris.');
    } else if (msg.toLowerCase().includes('email already')) {
      auth.setError('Cette adresse email est déjà utilisée.');
    } else if (msg.toLowerCase().includes('phone already')) {
      auth.setError('Ce numéro de téléphone est déjà utilisé.');
    } else if (msg.toLowerCase().includes('password') || msg.toLowerCase().includes('mot de passe')) {
      auth.setError('Le mot de passe doit contenir au moins 8 caractères.');
    } else {
      auth.setError(msg || 'Création du compte impossible.');
    }
  } finally {
    auth.setSubmitting(false);
  }
}

// ─── Finalize session (partagé login + signup) ────────────────────────────

async function finalizeAuthenticatedSession(response: any, isNewUser: boolean): Promise<void> {
  const token = response?.token || '';
  const user = response?.user || null;

  if (!token || !user) {
    throw new Error('Réponse de connexion invalide');
  }

  // Capturer les répertoires invités AVANT resetAllUserStores (P1-C)
  const guestReps = isNewUser
    ? useRepertoireStore.getState().repertoires.slice()
    : [];

  const auth = useAuthStore.getState();
  auth.setToken(token);
  auth.setUser(user);
  auth.setStatus('logged');
  auth.setGuestMode(false);

  resetAllUserStores();

  try {
    const repResponse = await apiRequest('/repertoires', { token });
    await _applyServerRepertoires(repResponse?.repertoires || []);
    const settingsResp = await apiRequest('/user-settings', { token });
    if (settingsResp?.settings) {
      applyRemoteSettings(settingsResp.settings);
    }
    initializeService();
    retryStats();

    // P1-C : migration des répertoires invités après signup
    if (isNewUser && guestReps.length > 0) {
      try {
        const serialized = guestReps.map(serializeRepertoire);
        const result = await apiRequest('/auth/convert-guest', {
          method: 'POST',
          token,
          body: { repertoires: serialized },
        });
        if (result?.count > 0) {
          const updated = await apiRequest('/repertoires', { token });
          await _applyServerRepertoires(updated?.repertoires || []);
        }
      } catch (err: any) {
        console.warn('[sync] convert-guest failed:', err?.message);
      }
    }
  } catch (error: any) {
    if (error?.status === 401) {
      auth.setToken('');
      auth.setUser(null);
      auth.setStatus('guest');
      throw error;
    }
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────

export async function logoutSession(): Promise<void> {
  const token = useAuthStore.getState().token;
  const store = useRepertoireStore.getState();

  // Attendre la sync si des changements sont en attente (B5)
  if (store.dirtyIds.size > 0) {
    try {
      await Promise.race([
        _flushDirtyRepertoires(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 5000),
        ),
      ]);
    } catch {
      console.warn('[logout] sync timeout ou échec, déconnexion forcée');
    }
  }

  try {
    if (token) {
      await apiRequest('/auth/logout', {
        method: 'POST',
        token,
      });
    }
  } catch {
    // Silencieux — la déconnexion se fait quoi qu'il arrive
    } finally {
      clearState('alphaChess.authToken');
      clearState('alphaChess.authUser');
      resetAllUserStores();
      useAuthStore.getState().logout();
      initializeService();
      retryStats();
    }
}

// ─── Sync répertoires (P1-A) — dirty tracking + debounce + retry ─────────

let _syncTimer: ReturnType<typeof setTimeout> | null = null;
let _settingsSyncTimer: ReturnType<typeof setTimeout> | null = null;

async function _putWithRetry(
  serverId: number,
  data: { rootId: string; nodes: any[] },
  clientUpdatedAt: string | undefined,
  token: string,
  maxRetries = 3,
): Promise<{ updatedAt?: string }> {
  let delay = 1000;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await apiRequest(`/repertoires/${serverId}`, {
        method: 'PUT',
        token,
        body: clientUpdatedAt ? { data, clientUpdatedAt } : { data },
      });
      return response?.repertoire ?? {};
    } catch (err: any) {
      if (attempt === maxRetries) throw err;
      // Ne pas réessayer sur les erreurs définitives
      if (err?.status === 401 || err?.status === 404 || err?.status === 409) throw err;
      await new Promise<void>((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
  return {};
}

async function _flushDirtyRepertoires(): Promise<void> {
  const store = useRepertoireStore.getState();
  const { token } = useAuthStore.getState();
  if (!token || store.dirtyIds.size === 0) return;

  useAuthStore.getState().setSyncStatus('syncing');
  let hadError = false;
  const ids = [...store.dirtyIds];
  for (const localId of ids) {
    const rep = store.repertoires.find((r) => r.id === localId);
    const serverId = store.serverIdMap[localId];
    if (!rep || !serverId) {
      store.clearDirty(localId);
      continue;
    }
    store.clearDirty(localId);

    const data = serializeRepertoire(rep);
    const clientUpdatedAt = store.serverUpdatedAtMap[localId];
    try {
      const result = await _putWithRetry(serverId, data, clientUpdatedAt, token);
      if (result.updatedAt) store.setServerUpdatedAt(localId, result.updatedAt);
      useAuthStore.getState().setSyncStatus('idle');
    } catch (err: any) {
      if (err?.status === 401) {
        // Session expirée en cours de sync — informer l'utilisateur, ne pas remettre en dirty
        useAuthStore.getState().setError('Connexion perdue, veuillez vous reconnecter');
        store.clearDirty(localId);
        continue;
      } else if (err?.status === 409) {
        // P1-B : conflit — déléguer à la modale
        const { openModal } = await import('@/stores/uiStore').then((m) => m.useUiStore.getState());
        openModal({ type: 'conflict', localRepId: localId, serverId, serverRep: err?.serverData ?? null });
      } else {
        // Remettre en dirty pour la prochaine tentative (sauf 401/404)
        if (err?.status !== 401 && err?.status !== 404) {
          store.markDirty(localId);
        }
        hadError = true;
        console.warn('[sync] PUT failed:', err?.message);
        useAuthStore.getState().setSyncStatus('error', 'Sauvegarde échouée — sera retentée');
      }
    }
  }

  useAuthStore.getState().setSyncStatus(hadError ? 'error' : 'idle');
}

export function scheduleRepertoireSync(): void {
  const store = useRepertoireStore.getState();
  if (store.suppressSync) return;
  const { token } = useAuthStore.getState();
  if (!token) return;

  const { repertoires, activeRepIndex } = store;
  const activeRep = repertoires[activeRepIndex];
  if (activeRep) store.markDirty(activeRep.id);

  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => {
    _flushDirtyRepertoires().catch((err) => {
      console.warn('[sync] flush error:', err?.message);
    });
  }, 2000);
}

export async function registerCreatedRepertoire(rep: RepertoireNode): Promise<void> {
  if (useRepertoireStore.getState().suppressSync) return;
  const token = useAuthStore.getState().token;
  if (!token) return;
  const data = serializeRepertoire(rep);
  try {
    const response = await apiRequest('/repertoires', {
      method: 'POST',
      token,
      body: { data },
    });
    const serverId = response?.repertoire?.serverId;
    const updatedAt = response?.repertoire?.updatedAt;
    if (serverId) {
      useRepertoireStore.getState().setServerId(rep.id, serverId);
      if (updatedAt) useRepertoireStore.getState().setServerUpdatedAt(rep.id, updatedAt);
    }
  } catch (err: any) {
    console.warn('[sync] registerCreatedRepertoire failed:', err?.message);
    useAuthStore.getState().setSyncStatus('error', 'Sauvegarde du répertoire échouée');
  }
}

export function deleteRepertoireFromBackend(rep: RepertoireNode): void {
  const token = useAuthStore.getState().token;
  if (!token || !rep) return;
  const store = useRepertoireStore.getState();
  const serverId = store.serverIdMap[rep.id];
  if (!serverId) return;
  store.removeServerMapping(rep.id);
  apiRequest(`/repertoires/${serverId}`, {
    method: 'DELETE',
    token,
  }).catch((err: any) => {
    console.warn('[sync] deleteRepertoireFromBackend failed:', err?.message);
    useAuthStore.getState().setSyncStatus('error', 'Suppression du répertoire échouée');
  });
}

// ─── Résolution de conflit (P1-B) ─────────────────────────────────────────

export async function resolveConflict(
  localRepId: string,
  serverId: number,
  action: 'overwrite' | 'keep-server',
  serverRep: any,
): Promise<void> {
  const { token } = useAuthStore.getState();
  const store = useRepertoireStore.getState();

  if (action === 'keep-server') {
    const node = serverRep ? deserializeFromServer(serverRep) : null;
    if (node) {
      const reps = store.repertoires.map((r) => (r.id === localRepId ? node : r));
      store.setRepertoires(reps);
    }
    store.clearDirty(localRepId);
    return;
  }

  // 'overwrite' : force PUT sans clientUpdatedAt
  const rep = store.repertoires.find((r) => r.id === localRepId);
  if (rep && token) {
    const data = serializeRepertoire(rep);
    try {
      const result = await apiRequest(`/repertoires/${serverId}`, {
        method: 'PUT',
        token,
        body: { data },
      });
      const updatedAt = result?.repertoire?.updatedAt;
      if (updatedAt) store.setServerUpdatedAt(localRepId, updatedAt);
      store.clearDirty(localRepId);
    } catch (err: any) {
      console.warn('[sync] conflict overwrite failed:', err?.message);
      useAuthStore.getState().setSyncStatus('error', 'Écrasement impossible');
    }
  }
}

export function syncUserSettings(): void {
  if (useRepertoireStore.getState().suppressSync) return;
  const { token } = useAuthStore.getState();
  if (!token) return;

  if (_settingsSyncTimer) clearTimeout(_settingsSyncTimer);
  _settingsSyncTimer = setTimeout(() => {
    _settingsSyncTimer = null;
    const repStore = useRepertoireStore.getState();
    const analysisSettings = useAnalysisStore.getState().settings;
    apiRequest('/user-settings', {
      method: 'PUT',
      token: useAuthStore.getState().token,
      body: {
        settings: {
          repFolders:       repStore.repFolders,
          repOrder:         repStore.repertoires.filter((r) => !r.isExample).map((r) => r.id),
          boardTheme:       useChessStore.getState().boardTheme ?? null,
          analysisSettings: {
            multiPV:    analysisSettings.multiPV,
            showArrows: analysisSettings.showArrows,
            arrowCount: analysisSettings.arrowCount,
          },
          statsFilters: useStatsStore.getState().filters,
        },
      },
    }).catch((err) => {
      console.warn('[sync] syncUserSettings failed:', err?.message);
    });
  }, 600);
}
