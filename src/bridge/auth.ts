/* eslint-disable @typescript-eslint/no-explicit-any */
import { apiRequest } from './api';
import { loadState } from './storage';
import { useAuthStore } from '@/stores/authStore';
import { useRepertoireStore } from '@/stores/repertoireStore';
import type { RepertoireNode } from '@/types/repertoire';

// ─── Helpers ──────────────────────────────────────────────────────────────

export function isReadOnlyMode(): boolean {
  return typeof window !== 'undefined' &&
    window.location?.hostname === '127.0.0.1';
}

// ─── Deserialize server format ({ rootId, nodes[] }) → RepertoireNode ─────

function deserializeFromServer(raw: any): RepertoireNode | null {
  if (!raw || typeof raw !== 'object') return null;

  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const rootId = raw.rootId != null ? String(raw.rootId) : '';

  if (!rootId || rawNodes.length === 0) return null;

  const nodeMap = new Map<string, RepertoireNode>();

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
    nodeMap.set(node.id, node);
  }

  for (const n of rawNodes) {
    if (!n || n.id == null) continue;
    const node = nodeMap.get(String(n.id));
    if (!node) continue;
    const childIds = Array.isArray(n.children) ? n.children : [];
    node.children = childIds
      .map((id: any) => nodeMap.get(String(id)) || null)
      .filter((c: any): c is RepertoireNode => c !== null);
    node.children.forEach((child) => { child.parentId = node!.id; });
  }

  return nodeMap.get(rootId) || null;
}

// ─── Bootstrap (appelé au démarrage) ─────────────────────────────────────

export async function bootstrapSession(): Promise<void> {
  const auth = useAuthStore.getState();
  let token = auth.token;

  // Migration depuis les clés localStorage vanilla (si existent)
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
    auth.setStatus('guest');
    return;
  }

  try {
    const session = await apiRequest('/auth/me', { token });
    auth.setUser(session.user);
    auth.setStatus('logged');

    const repResponse = await apiRequest('/repertoires', { token });
    const remoteReps = repResponse?.repertoires || [];

    const loaded: RepertoireNode[] = [];
    for (const entry of remoteReps) {
      const data = entry?.data;
      if (!data) continue;
      const rep = deserializeFromServer(data);
      if (rep) loaded.push(rep);
    }

    if (loaded.length > 0) {
      useRepertoireStore.getState().setRepertoires(loaded);
    }
  } catch (error: any) {
    if (error?.status === 401) {
      auth.setToken('');
      auth.setUser(null);
      auth.setStatus('guest');
    }
  }
}

// ─── Login ────────────────────────────────────────────────────────────────

export async function loginWithCredentials({ email, password }: { email: string; password: string }): Promise<void> {
  const auth = useAuthStore.getState();
  auth.setSubmitting(true);
  auth.setError('');

  try {
    const response = await apiRequest('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    await finalizeAuthenticatedSession(response);
  } catch (error: any) {
    const msg = error?.message || '';
    if (msg.toLowerCase().includes('invalid credentials')) {
      auth.setError('Identifiants incorrects.');
    } else {
      auth.setError(msg || 'Connexion impossible.');
    }
  } finally {
    auth.setSubmitting(false);
  }
}

// ─── Signup ───────────────────────────────────────────────────────────────

export async function signupWithCredentials({ username, password }: { username: string; password: string }): Promise<void> {
  const auth = useAuthStore.getState();
  auth.setSubmitting(true);
  auth.setError('');

  try {
    const response = await apiRequest('/auth/signup', {
      method: 'POST',
      body: { username, password },
    });
    await finalizeAuthenticatedSession(response);
  } catch (error: any) {
    const msg = error?.message || '';
    if (msg.toLowerCase().includes('username already')) {
      auth.setError('Ce nom d\'utilisateur est déjà pris.');
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

async function finalizeAuthenticatedSession(response: any): Promise<void> {
  const token = response?.token || '';
  const user = response?.user || null;

  if (!token || !user) {
    throw new Error('Réponse de connexion invalide');
  }

  const auth = useAuthStore.getState();
  auth.setToken(token);
  auth.setUser(user);
  auth.setStatus('logged');

  try {
    const repResponse = await apiRequest('/repertoires', { token });
    const remoteReps = repResponse?.repertoires || [];

    const loaded: RepertoireNode[] = [];
    for (const entry of remoteReps) {
      const data = entry?.data;
      if (!data) continue;
      const rep = deserializeFromServer(data);
      if (rep) loaded.push(rep);
    }

    if (loaded.length > 0) {
      useRepertoireStore.getState().setRepertoires(loaded);
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
    useAuthStore.getState().logout();
  }
}

// ─── Exportations existantes (stubs P1) ──────────────────────────────────
// Ces fonctions seront implémentées dans la phase P1 (sync serveur).

export function scheduleRepertoireSync(): void {
  // TODO P1 — dirty tracking + flush serveur
}

export function registerCreatedRepertoire(rep: any): void {
  if (!useAuthStore.getState().token) return;
  apiRequest('/repertoires', {
    method: 'POST',
    token: useAuthStore.getState().token,
    body: rep,
  }).catch(() => {});
}

export function deleteRepertoireFromBackend(rep: any): void {
  if (!useAuthStore.getState().token || !rep?.id) return;
  apiRequest(`/repertoires/${rep.id}`, {
    method: 'DELETE',
    token: useAuthStore.getState().token,
  }).catch(() => {});
}

export function syncUserSettings(): void {
  const folders = useRepertoireStore.getState().repFolders;
  if (!useAuthStore.getState().token) return;
  apiRequest('/user-settings', {
    method: 'PUT',
    token: useAuthStore.getState().token,
    body: { repFolders: folders },
  }).catch(() => {});
}
