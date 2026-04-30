import { state, initState } from './state.js';
import { eventBus } from './events.js';
import { saveState, loadState, clearState } from './storage.js';
import { apiRequest } from './api.js';
import { serializeRepertoire, deserializeRepertoire, hydrateRepertoires } from './repertoirePersistence.js';

const AUTH_TOKEN_KEY = 'alphaChess.authToken';
const AUTH_USER_KEY = 'alphaChess.authUser';
const LOCAL_REPERTOIRES_KEY = 'alphaChess.localRepertoires';
const SELECTION_KEY = 'alphaChess.workspaceSelection';
const SYNC_DEBOUNCE_MS = 1000;

let syncTimer = null;
let syncInFlight = false;
let syncQueued = false;
let guestModeLoader = null;
const dirtyRepertoireIds = new Set();
const remoteRepertoireIds = new Map();
const pendingCreateIds = new Set();

function persistSession(token, user) {
  saveState(AUTH_TOKEN_KEY, token);
  saveState(AUTH_USER_KEY, user);
}

function clearPersistedSession() {
  clearState(AUTH_TOKEN_KEY);
  clearState(AUTH_USER_KEY);
}

function setSyncSavedState() {
  state.auth.syncStatus = 'saved';
  state.auth.syncMessage = state.repertoires.length > 0 ? 'Synchronise' : 'Aucun repertoire';
}

function setSyncSavingState() {
  state.auth.syncStatus = 'saving';
  state.auth.syncMessage = 'Sauvegarde en cours...';
}

function setSyncErrorState(error) {
  state.auth.syncStatus = 'error';
  state.auth.syncMessage = error?.message || 'Sauvegarde impossible';
}

function clearRemoteTracking() {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }

  syncQueued = false;
  syncInFlight = false;
  dirtyRepertoireIds.clear();
  remoteRepertoireIds.clear();
  pendingCreateIds.clear();
}

function deserializeStoredRepertoire(rawRepertoire) {
  if (!rawRepertoire || typeof rawRepertoire !== 'object') {
    return null;
  }

  if (rawRepertoire.rootId && Array.isArray(rawRepertoire.nodes)) {
    return deserializeRepertoire(rawRepertoire);
  }

  return hydrateRepertoires([rawRepertoire])[0] || null;
}

function findNodeById(rootNode, nodeId) {
  if (!rootNode || nodeId == null) {
    return null;
  }

  if (String(rootNode.id) === String(nodeId)) {
    return rootNode;
  }

  for (const child of rootNode.children || []) {
    const found = findNodeById(child, nodeId);
    if (found) {
      return found;
    }
  }

  return null;
}

function collectRepertoireMetrics(rootNode) {
  if (!rootNode) {
    return { nodeCount: 0, latestCreatedAt: 0 };
  }

  let nodeCount = 0;
  let latestCreatedAt = 0;

  function walk(node) {
    if (!node) {
      return;
    }

    nodeCount += 1;
    const createdAt = Number(node.createdAt) || 0;
    if (createdAt > latestCreatedAt) {
      latestCreatedAt = createdAt;
    }

    for (const child of node.children || []) {
      walk(child);
    }
  }

  walk(rootNode);
  return { nodeCount, latestCreatedAt };
}

function shouldPreferLocalRepertoire(localRepertoire, remoteRepertoire) {
  if (!localRepertoire || !remoteRepertoire) {
    return false;
  }

  const localMetrics = collectRepertoireMetrics(localRepertoire);
  const remoteMetrics = collectRepertoireMetrics(remoteRepertoire);

  if (localMetrics.nodeCount !== remoteMetrics.nodeCount) {
    return localMetrics.nodeCount > remoteMetrics.nodeCount;
  }

  return localMetrics.latestCreatedAt > remoteMetrics.latestCreatedAt;
}

function getStoredLocalRuntimeRepertoires() {
  const storedRepertoires = loadState(LOCAL_REPERTOIRES_KEY);
  if (!Array.isArray(storedRepertoires) || storedRepertoires.length === 0) {
    return [];
  }

  return storedRepertoires
    .map((rawRepertoire) => deserializeStoredRepertoire(rawRepertoire))
    .filter(Boolean);
}

function captureWorkspaceSelection() {
  return {
    activeRepId: state.activeRepIndex >= 0 ? String(state.repertoires[state.activeRepIndex]?.id || '') : '',
    currentNodeId: state.currentNode?.id ? String(state.currentNode.id) : '',
    treeExpandedIds: Array.from(state.treeExpanded || []),
    repExpandedIds: Array.from(state.repExpanded || [])
  };
}

function restoreWorkspaceSelection(snapshot) {
  if (!snapshot) {
    return;
  }

  const treeExpandedIds = Array.isArray(snapshot.treeExpandedIds) ? snapshot.treeExpandedIds : [];
  const repExpandedIds = Array.isArray(snapshot.repExpandedIds) ? snapshot.repExpandedIds : [];
  state.treeExpanded = new Set(treeExpandedIds.map((id) => String(id)));
  state.repExpanded = new Set(repExpandedIds.map((id) => String(id)));

  let restoredRepIndex = -1;
  let restoredNode = null;

  if (snapshot.activeRepId) {
    restoredRepIndex = state.repertoires.findIndex((repertoire) => String(repertoire.id) === snapshot.activeRepId);
  }

  if (snapshot.currentNodeId) {
    for (let index = 0; index < state.repertoires.length; index += 1) {
      const foundNode = findNodeById(state.repertoires[index], snapshot.currentNodeId);
      if (foundNode) {
        restoredNode = foundNode;
        restoredRepIndex = index;
        break;
      }
    }
  }

  if (!restoredNode && restoredRepIndex >= 0) {
    restoredNode = state.repertoires[restoredRepIndex] || null;
  }

  if (!restoredNode) {
    return;
  }

  state.activeRepIndex = restoredRepIndex;
  state.currentNode = restoredNode;
  state.chess.load(restoredNode.fen);

  const activeRepertoire = restoredRepIndex >= 0 ? state.repertoires[restoredRepIndex] : null;
  if (activeRepertoire?.color) {
    state.boardFlipped = activeRepertoire.color === 'b';
  }
  // Re-populate treeExpanded so all ancestors of the restored node are visible in the tree.
  let expandTemp = restoredNode;
  if (expandTemp) state.treeExpanded.add(expandTemp.id);
  while (expandTemp && expandTemp.parent) {
    state.treeExpanded.add(expandTemp.parent.id);
    expandTemp = expandTemp.parent;
  }
}

function persistLocalRepertoires() {
  // Ne rien sauvegarder en mode invité : la persistence est liée au compte.
  if (!state.auth.user) {
    return;
  }

  const serialized = state.repertoires
    .filter(rep => !rep.isExample)  // Ne jamais persister les données d'exemple
    .map((repertoire) => serializeRepertoire(repertoire))
    .filter(Boolean);

  saveState(LOCAL_REPERTOIRES_KEY, serialized);
}

function loadLocalRepertoiresIntoState(selectionSnapshot = null) {
  const storedRepertoires = loadState(LOCAL_REPERTOIRES_KEY);
  if (!Array.isArray(storedRepertoires) || storedRepertoires.length === 0) {
    return false;
  }

  const selection = selectionSnapshot || captureWorkspaceSelection();
  resetWorkspaceState();
  let deserializedReps = storedRepertoires
    .map((rawRepertoire) => deserializeStoredRepertoire(rawRepertoire))
    .filter(Boolean);
  
  // Exclure les répertoires d'exemple si l'utilisateur est authentifié
  // (Les exemples ne doivent rester que pour les vrais invités)
  if (state.auth.user && state.auth.user.username) {
    deserializedReps = deserializedReps.filter(rep => !rep.isExample);
  }
  
  state.repertoires = deserializedReps;
  restoreWorkspaceSelection(selection);

  return state.repertoires.length > 0;
}

function findRepertoireById(repertoireId) {
  const id = String(repertoireId);
  return state.repertoires.find((repertoire) => String(repertoire.id) === id) || null;
}

function getActiveRepertoire() {
  return state.activeRepIndex >= 0 ? state.repertoires[state.activeRepIndex] || null : null;
}

function scheduleDirtyFlush() {
  if (!state.auth.token || !state.auth.user || dirtyRepertoireIds.size === 0) {
    return;
  }

  syncQueued = true;
  if (syncTimer) {
    clearTimeout(syncTimer);
  }

  syncTimer = setTimeout(() => {
    syncTimer = null;
    flushRepertoireSync();
  }, SYNC_DEBOUNCE_MS);
}

async function saveRepertoireToBackend(repertoire, { forceCreate = false } = {}) {
  if (!repertoire || !state.auth.token || !state.auth.user) {
    return;
  }

  const runtimeId = String(repertoire.id);
  const serializedRepertoire = serializeRepertoire(repertoire);
  if (!serializedRepertoire) {
    return;
  }

  const knownServerId = remoteRepertoireIds.get(runtimeId);

  if (!forceCreate && knownServerId != null) {
    await apiRequest(`/repertoires/${knownServerId}`, {
      method: 'PUT',
      token: state.auth.token,
      body: {
        data: serializedRepertoire
      }
    });
    return;
  }

  if (pendingCreateIds.has(runtimeId)) {
    return;
  }

  pendingCreateIds.add(runtimeId);

  try {
    const response = await apiRequest('/repertoires', {
      method: 'POST',
      token: state.auth.token,
      body: {
        data: serializedRepertoire
      }
    });

    const serverId = response?.repertoire?.serverId;
    if (serverId != null) {
      remoteRepertoireIds.set(runtimeId, Number(serverId));
    }
  } finally {
    pendingCreateIds.delete(runtimeId);
  }
}

function syncLocalFallbackOrGuest(loadGuestData, selectionSnapshot = null) {
  const restoredLocal = loadLocalRepertoiresIntoState(selectionSnapshot);
  if (!restoredLocal && loadGuestData && typeof guestModeLoader === 'function') {
    guestModeLoader();
  }
  return restoredLocal;
}

function queueAllLocalRepertoiresForRemoteCreate() {
  if (!state.auth.token || !state.auth.user) {
    return;
  }

  for (const repertoire of state.repertoires) {
    if (!remoteRepertoireIds.has(String(repertoire.id))) {
      registerCreatedRepertoire(repertoire);
    }
  }
}

function resetWorkspaceState() {
  console.log('[DEBUG]', { step: 'resetWorkspaceState', repertoiresBefore: state.repertoires.length, activeRepIndexBefore: state.activeRepIndex, currentNodeId: state.currentNode?.id });
  clearRemoteTracking();
  state.repertoires = [];
  state.activeRepIndex = -1;
  state.selectedSq = null;
  state.menuTarget = null;
  state.redoStack = [];
  state.treeExpanded = new Set();
  state.repExpanded = new Set();
  state.deleteTargetIdx = -1;
  state.pendingDeleteType = '';
  state.trainingActive = false;
  initState();
  state.chess.reset();
}

function applyRemoteRepertoires(repertoires) {
  console.log('[DEBUG]', { step: 'applyRemoteRepertoires:start', remoteCount: Array.isArray(repertoires) ? repertoires.length : 0, currentRepCount: state.repertoires.length, activeRepIndex: state.activeRepIndex, currentNodeId: state.currentNode?.id });
  // Au démarrage (bootstrap), le state est vide (activeRepIndex=-1, currentNode='free').
  // Lire la sélection persistée en localStorage pour restaurer le dernier répertoire/nœud actif.
  let selection = captureWorkspaceSelection();
  if (!selection.activeRepId && (!selection.currentNodeId || selection.currentNodeId === 'free')) {
    const savedSelection = loadState(SELECTION_KEY);
    if (savedSelection) selection = savedSelection;
  }
  // Préserver les dirty IDs et le timer existants : ils peuvent avoir été ajoutés
  // par un coup joué PENDANT la requête réseau du bootstrap / finalizeAuthenticatedSession.
  // resetWorkspaceState() appelle clearRemoteTracking() qui les efface — on les restaure après.
  const savedDirtyIds = new Set(dirtyRepertoireIds);
  const savedRemoteIds = new Map(remoteRepertoireIds);
  // Inclure aussi les répertoires actuellement en mémoire : un coup peut avoir été joué
  // pendant la requête réseau, ajoutant un nœud qui n'est ni dans localStorage ni sur le serveur.
  // Exclure les données d'exemple qui ne doivent pas être fusionnées avec le serveur
  let inMemoryRepertoires = state.repertoires.slice().filter(rep => !rep.isExample);
  const storedLocalRepertoires = getStoredLocalRuntimeRepertoires().filter(rep => !rep.isExample);
  // Fusionner : pour chaque ID, préférer la version en mémoire si plus récente que le localStorage.
  const mergedLocalById = new Map(
    storedLocalRepertoires.map((repertoire) => [String(repertoire.id), repertoire])
  );
  for (const memRep of inMemoryRepertoires) {
    const id = String(memRep.id);
    const local = mergedLocalById.get(id);
    if (!local || shouldPreferLocalRepertoire(memRep, local)) {
      mergedLocalById.set(id, memRep);
    }
  }
  const localById = mergedLocalById;
  const loadedIds = new Set();
  const repertoiresNeedingSync = new Set();
  resetWorkspaceState();
  // Restaurer les dirty IDs sauvegardés pour ne pas perdre un coup joué pendant l'attente réseau.
  for (const id of savedDirtyIds) dirtyRepertoireIds.add(id);
  // Restaurer les remoteRepertoireIds connus (ils seront ensuite surchargés par les nouvelles valeurs).
  for (const [k, v] of savedRemoteIds) remoteRepertoireIds.set(k, v);
  const loadedRepertoires = [];

  for (const entry of Array.isArray(repertoires) ? repertoires : []) {
    const rawRepertoire = entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'data')
      ? entry.data
      : entry;

    let runtimeRepertoire = deserializeStoredRepertoire(rawRepertoire);
    if (!runtimeRepertoire) {
      continue;
    }

    // Exclure les données d'exemple du serveur - elles ne doivent pas être restaurées
    if (runtimeRepertoire.isExample) {
      console.log('[DEBUG]', { step: 'applyRemoteRepertoires:skip_example', repName: runtimeRepertoire.name });
      continue;
    }

    const runtimeId = String(runtimeRepertoire.id);
    const localRepertoire = localById.get(runtimeId);
    if (localRepertoire && shouldPreferLocalRepertoire(localRepertoire, runtimeRepertoire)) {
      runtimeRepertoire = localRepertoire;
      repertoiresNeedingSync.add(runtimeId);
    }

    loadedRepertoires.push(runtimeRepertoire);
    loadedIds.add(runtimeId);

    if (entry && typeof entry === 'object' && entry.serverId != null) {
      remoteRepertoireIds.set(runtimeId, Number(entry.serverId));
    }
  }

  for (const localRepertoire of localById.values()) {
    const runtimeId = String(localRepertoire.id);
    if (loadedIds.has(runtimeId)) {
      continue;
    }

    loadedRepertoires.push(localRepertoire);
    repertoiresNeedingSync.add(runtimeId);
  }

  state.repertoires = loadedRepertoires;
  // Double-check : s'assurer qu'aucune donnée d'exemple n'a glissé à travers
  state.repertoires = state.repertoires.filter(rep => !rep.isExample);
  restoreWorkspaceSelection(selection);
  persistLocalRepertoires();
  console.log('[DEBUG]', { step: 'applyRemoteRepertoires:done', loadedCount: state.repertoires.length, needingSyncCount: repertoiresNeedingSync.size, activeRepIndex: state.activeRepIndex, currentNodeId: state.currentNode?.id });

  for (const repertoireId of repertoiresNeedingSync) {
    dirtyRepertoireIds.add(repertoireId);
  }

  // Si des dirty IDs existaient avant (coups joués pendant l'attente réseau), ils ont
  // été restaurés dans dirtyRepertoireIds plus haut — s'assurer que le flush est planifié.
  if (dirtyRepertoireIds.size > 0) {
    scheduleDirtyFlush();
  }

  return loadedRepertoires.length > 0;
}

function clearSessionState({ message = '', loadGuestData = false } = {}) {
  console.log('[DEBUG]', { step: 'clearSessionState', message, loadGuestData, userBefore: state.auth.user?.username, repsBefore: state.repertoires.length, caller: new Error().stack?.split('\n')[2]?.trim() });
  clearPersistedSession();
  // Effacer le cache localStorage du compte pour ne pas contaminer le mode invité
  // ni un autre compte qui se connecterait sur le même navigateur.
  clearState(LOCAL_REPERTOIRES_KEY);
  clearState(SELECTION_KEY);
  resetWorkspaceState();

  state.auth.user = null;
  state.auth.token = '';
  state.auth.status = 'guest';
  state.auth.error = message;
  state.auth.isSubmitting = false;
  state.auth.syncStatus = 'idle';
  state.auth.syncMessage = '';
  console.log('[DEBUG]', { step: 'clearSessionState:user_set_null', message });

  if (loadGuestData && typeof guestModeLoader === 'function') {
    guestModeLoader();
  }
}

// Appelée lors d'une expiration de session détectée EN ARRIÈRE-PLAN (sync, delete).
// Efface uniquement le token pour stopper les boucles de sync,
// mais CONSERVE state.auth.user pour ne pas afficher "invité" à l'utilisateur
// et ne pas réinitialiser l'espace de travail.
function markTokenExpired() {
  console.log('[DEBUG]', { step: 'markTokenExpired', userKept: state.auth.user?.username, repsKept: state.repertoires.length });
  clearPersistedSession();
  state.auth.token = '';
  state.auth.syncStatus = 'expired';
  state.auth.syncMessage = 'Session expirée – reconnectez-vous pour synchroniser.';
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  syncQueued = false;
  syncInFlight = false;
}

function handleBackgroundSessionExpired(message = 'Session expiree.') {
  console.log('[DEBUG]', { step: 'handleBackgroundSessionExpired', message, userBefore: state.auth.user?.username, caller: new Error().stack?.split('\n')[2]?.trim() });
  clearPersistedSession();

  state.auth.user = null;
  state.auth.token = '';
  state.auth.status = 'guest';
  state.auth.error = message;
  state.auth.isSubmitting = false;
  state.auth.syncStatus = 'error';
  state.auth.syncMessage = 'Session expiree. Reconnectez-vous pour synchroniser.';
  console.log('[DEBUG]', { step: 'handleBackgroundSessionExpired:user_set_null', message });

  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }

  syncQueued = false;
  syncInFlight = false;
}

function setAuthenticatedState({ token, user }) {
  console.log('[DEBUG]', { step: 'setAuthenticatedState', username: user?.username, repCount: state.repertoires.length, activeRepIndex: state.activeRepIndex });
  state.auth.user = user;
  state.auth.token = token;
  state.auth.status = 'authenticated';
  state.auth.error = '';
  setSyncSavedState();
  persistSession(token, user);
}

async function finalizeAuthenticatedSession(response) {
  const token = response?.token || '';
  const user = response?.user || null;
  console.log('[DEBUG]', { step: 'finalizeAuthenticatedSession:start', username: user?.username, hasToken: !!token });

  if (!token || !user) {
    throw new Error('Session invalide');
  }

  state.auth.token = token;
  state.auth.user = user;
  state.auth.status = 'authenticated';
  persistSession(token, user);

  setAuthenticatedState({ token, user });

  // Nettoyer les données d'exemple restées en RAM du mode invité précédent
  // avant d'appeler applyRemoteRepertoires() qui pourrait les fusionner avec les données du serveur
  state.repertoires = state.repertoires.filter(rep => !rep.isExample);

  try {
    const repertoireResponse = await apiRequest('/repertoires', { token });
    console.log('[DEBUG]', { step: 'finalizeAuthenticatedSession:GET_repertoires', count: repertoireResponse?.repertoires?.length ?? 0 });
    const remoteLoaded = applyRemoteRepertoires(repertoireResponse?.repertoires || []);
    setAuthenticatedState({ token, user });

    if (!remoteLoaded && loadLocalRepertoiresIntoState()) {
      setAuthenticatedState({ token, user });
      queueAllLocalRepertoiresForRemoteCreate();
    }
  } catch (error) {
    if (error?.status === 401) {
      console.log('[DEBUG]', { step: 'finalizeAuthenticatedSession:401', message: error.message });
      clearSessionState({ message: 'Session expiree.', loadGuestData: true });
      throw error;
    }

    loadLocalRepertoiresIntoState();

    state.auth.user = user;
    state.auth.token = token;
    state.auth.status = 'authenticated';
    state.auth.error = '';
    setSyncErrorState(error);
  }

  eventBus.emit('closeModals');
}

async function flushRepertoireSync() {
  console.log('[DEBUG]', { step: 'flushRepertoireSync:check', syncInFlight, dirtyCount: dirtyRepertoireIds.size, hasToken: !!state.auth.token, hasUser: !!state.auth.user });
  if (syncInFlight || dirtyRepertoireIds.size === 0 || !state.auth.token || !state.auth.user) {
    return;
  }

  syncInFlight = true;
  syncQueued = false;
  const tokenAtStart = state.auth.token;
  const repertoireIds = Array.from(dirtyRepertoireIds);
  dirtyRepertoireIds.clear();
  console.log('[DEBUG]', { step: 'flushRepertoireSync:start', repertoireIds });

  try {
    for (const repertoireId of repertoireIds) {
      if (tokenAtStart !== state.auth.token) {
        return;
      }

      const repertoire = findRepertoireById(repertoireId);
      if (!repertoire) {
        continue;
      }

      if (pendingCreateIds.has(String(repertoire.id))) {
        dirtyRepertoireIds.add(String(repertoire.id));
        continue;
      }

      console.log('[DEBUG]', { step: 'flushRepertoireSync:PUT', repertoireId, repName: repertoire.name, serverId: remoteRepertoireIds.get(String(repertoire.id)) });
      await saveRepertoireToBackend(repertoire);
    }

    if (tokenAtStart !== state.auth.token) {
      return;
    }

    setSyncSavedState();
    // Persister la sélection ICI : state.currentNode est déjà le nouveau nœud
    // (contrairement à persistLocalRepertoires qui est appelée depuis addMove avant
    // que handleSquareClick mette à jour state.currentNode).
    if (state.auth.user) {
      const sel = captureWorkspaceSelection();
      if (sel.activeRepId || (sel.currentNodeId && sel.currentNodeId !== 'free')) {
        saveState(SELECTION_KEY, sel);
      }
    }
    console.log('[DEBUG]', { step: 'flushRepertoireSync:success' });
  } catch (error) {
    console.log('[DEBUG]', { step: 'flushRepertoireSync:catch', status: error?.status, message: error?.message });
    if (error?.status === 401) {
      markTokenExpired();
      return;
    }

    if (tokenAtStart === state.auth.token) {
      setSyncErrorState(error);
    }
  } finally {
    syncInFlight = false;
    eventBus.emit('syncDone');

    if (dirtyRepertoireIds.size > 0) {
      scheduleDirtyFlush();
    }
  }
}

export function registerGuestModeLoader(loader) {
  guestModeLoader = loader;
}

export function setAuthMode(mode) {
  state.auth.mode = mode === 'signup' ? 'signup' : 'login';
  state.auth.error = '';
}

export async function bootstrapSession() {
  const token = loadState(AUTH_TOKEN_KEY);
  const user = loadState(AUTH_USER_KEY);
  console.log('[DEBUG]', { step: 'bootstrapSession:start', hasToken: !!token, username: user?.username });

  if (!token) {
    console.log('[DEBUG]', { step: 'bootstrapSession:no_token_guest' });
    state.auth.user = null;
    state.auth.token = '';
    state.auth.status = 'guest';
    state.auth.error = '';
    state.auth.isSubmitting = false;
    state.auth.syncStatus = 'idle';
    state.auth.syncMessage = '';
    // Mode invité : pas de chargement depuis localStorage, démarrage vierge.
    if (typeof guestModeLoader === 'function') {
      guestModeLoader();
    }
    return false;
  }

  state.auth.token = token;
  state.auth.user = user;
  state.auth.status = 'restoring';
  state.auth.error = '';
  eventBus.emit('render');

  try {
    const sessionResponse = await apiRequest('/auth/me', { token });
    console.log('[DEBUG]', { step: 'bootstrapSession:me_ok', username: sessionResponse?.user?.username });
    const repertoireResponse = await apiRequest('/repertoires', { token });
    console.log('[DEBUG]', { step: 'bootstrapSession:GET_repertoires', count: repertoireResponse?.repertoires?.length ?? 0 });
    const remoteLoaded = applyRemoteRepertoires(repertoireResponse?.repertoires || []);
    setAuthenticatedState({ token, user: sessionResponse.user });

    if (!remoteLoaded && loadLocalRepertoiresIntoState()) {
      setAuthenticatedState({ token, user: sessionResponse.user });
      queueAllLocalRepertoiresForRemoteCreate();
      return true;
    }

    return remoteLoaded;
  } catch (error) {
    if (error?.status === 401) {
      console.log('[DEBUG]', { step: 'bootstrapSession:401', message: error.message });
      clearSessionState({ message: 'Session expiree.', loadGuestData: true });
      return state.repertoires.length > 0;
    }
    console.log('[DEBUG]', { step: 'bootstrapSession:network_error', message: error?.message });
    const restoredLocal = loadLocalRepertoiresIntoState();
    state.auth.user = user || null;
    state.auth.token = token;
    state.auth.status = user ? 'authenticated' : 'guest';
    state.auth.error = '';
    setSyncErrorState(error);
    return restoredLocal || Boolean(user);
  } finally {
    eventBus.emit('render');
  }
}

export async function loginWithCredentials({ email, password }) {
  console.log('[DEBUG]', { step: 'loginWithCredentials:start', email });
  state.auth.mode = 'login';
  state.auth.isSubmitting = true;
  state.auth.error = '';
  eventBus.emit('render');

  try {
    const response = await apiRequest('/auth/login', {
      method: 'POST',
      body: { email, password }
    });
    console.log('[DEBUG]', { step: 'loginWithCredentials:response_ok', username: response?.user?.username });
    await finalizeAuthenticatedSession(response);
  } catch (error) {
    console.log('[DEBUG]', { step: 'loginWithCredentials:error', message: error?.message });
    state.auth.error = error?.message || 'Connexion impossible.';
  } finally {
    state.auth.isSubmitting = false;
    eventBus.emit('render');
  }
}

export async function signupWithCredentials({ username, password }) {
  state.auth.mode = 'signup';
  state.auth.isSubmitting = true;
  state.auth.error = '';
  eventBus.emit('render');

  try {
    const response = await apiRequest('/auth/signup', {
      method: 'POST',
      body: { username, password }
    });
    await finalizeAuthenticatedSession(response);
  } catch (error) {
    state.auth.error = error?.message || 'Creation du compte impossible.';
  } finally {
    state.auth.isSubmitting = false;
    eventBus.emit('render');
  }
}

export async function logoutSession() {
  const token = state.auth.token;

  // Vérifier si une sync est en cours ou des changements sont en attente
  if (syncInFlight || dirtyRepertoireIds.size > 0 || syncQueued) {
    console.log('[DEBUG]', { 
      step: 'logoutSession:blocked', 
      reason: 'sync_in_progress', 
      syncInFlight, 
      dirtyCount: dirtyRepertoireIds.size, 
      syncQueued 
    });
    
    // Afficher un message utilisateur
    state.auth.error = 'Synchronisation en cours... Patientez avant de vous déconnecter.';
    eventBus.emit('render');
    
    // Attendre que la sync se termine (max 5 secondes)
    let waitTime = 0;
    while ((syncInFlight || dirtyRepertoireIds.size > 0 || syncQueued) && waitTime < 5000) {
      await new Promise(resolve => setTimeout(resolve, 100));
      waitTime += 100;
    }
    
    // Vérifier si la sync s'est complétée
    if (syncInFlight || dirtyRepertoireIds.size > 0) {
      state.auth.error = 'Impossible de synchroniser. Veuillez réessayer la déconnexion.';
      eventBus.emit('render');
      return;
    }
    
    // Sync terminée, réinitialiser le message d'erreur
    state.auth.error = '';
  }

  try {
    if (token) {
      await apiRequest('/auth/logout', {
        method: 'POST',
        token
      });
    }
  } catch (error) {
    state.auth.error = error?.message || '';
  } finally {
    // loadGuestData:false — on laisse bootstrapSession() gérer le chargement
    // des données d'exemple via le guestModeLoader au prochain render,
    // pour éviter que les exemples soient en mémoire avec un token encore actif.
    clearSessionState({ loadGuestData: false });
    eventBus.emit('closeModals');
    eventBus.emit('render');
  }
}

function getRepertoireForCurrentNode() {
  let temp = state.currentNode;
  if (!temp) return null;
  while (temp.parent) temp = temp.parent;
  return state.repertoires.find(r => String(r.id) === String(temp.id)) || null;
}

export function scheduleRepertoireSync() {
  const repForNode = getRepertoireForCurrentNode();
  const activeRep = getActiveRepertoire();
  console.log('[DEBUG]', { step: 'scheduleRepertoireSync', activeRepIndex: state.activeRepIndex, repForNodeId: repForNode?.id, repForNodeName: repForNode?.name, activeRepId: activeRep?.id, hasToken: !!state.auth.token, hasUser: !!state.auth.user });
  persistLocalRepertoires();

  // Priorité au répertoire contenant currentNode ; fallback sur le répertoire actif
  const activeRepertoire = getRepertoireForCurrentNode() || getActiveRepertoire();
  if (activeRepertoire) {
    dirtyRepertoireIds.add(String(activeRepertoire.id));
  }

  if (!state.auth.token || !state.auth.user || !activeRepertoire) {
    return;
  }

  setSyncSavingState();
  scheduleDirtyFlush();
  // Pas de eventBus.emit('render') ici : cette fonction est appelée depuis addMove()
  // AVANT que l'appelant mette à jour state.currentNode et state.chess.
  // Un render ici montrerait la position précédente (chess.undo() déjà effectué).
  // Le render final est émis par l'appelant (handleSquareClick, confirmRenameRep, etc.).
}

export function registerCreatedRepertoire(repertoire) {
  persistLocalRepertoires();

  // Ne jamais synchroniser les données d'exemple
  if (!repertoire || repertoire.isExample || !state.auth.token || !state.auth.user) {
    return;
  }

  setSyncSavingState();
  eventBus.emit('render');

  saveRepertoireToBackend(repertoire, { forceCreate: true })
    .then(() => {
      setSyncSavedState();
      if (dirtyRepertoireIds.has(String(repertoire.id))) {
        scheduleDirtyFlush();
      }
    })
    .catch((error) => {
      if (error?.status === 401) {
        markTokenExpired();
        return;
      }

      setSyncErrorState(error);
    })
    .finally(() => {
      eventBus.emit('render');
    });
}

export function deleteRepertoireFromBackend(repertoire) {
  if (!repertoire || !state.auth.token || !state.auth.user) {
    return;
  }

  const runtimeId = String(repertoire.id);
  const serverId = remoteRepertoireIds.get(runtimeId);
  if (serverId == null) {
    return;
  }

  setSyncSavingState();
  eventBus.emit('render');

  apiRequest(`/repertoires/${serverId}`, {
    method: 'DELETE',
    token: state.auth.token
  })
    .then(() => {
      remoteRepertoireIds.delete(runtimeId);
      setSyncSavedState();
    })
    .catch((error) => {
      if (error?.status === 401) {
        markTokenExpired();
        return;
      }

      setSyncErrorState(error);
    })
    .finally(() => {
      eventBus.emit('render');
    });
}

export function getAccountInitials() {
  const username = state.auth.user?.username || '';
  const fallback = state.auth.user ? 'U' : '?';
  const parts = username.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return fallback;
  }
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join('');
}

export function getAccountStatusText() {
  if (state.auth.status === 'restoring') {
    return 'Restauration...';
  }

  if (!state.auth.user) {
    return 'Mode invite';
  }

  if (state.auth.syncStatus === 'saving') {
    return 'Sauvegarde...';
  }

  if (state.auth.syncStatus === 'error') {
    return 'Erreur de sauvegarde';
  }

  return 'Session active';
}

export function getSyncStatusText() {
  if (!state.auth.user) {
    return 'Connectez-vous pour sauvegarder vos repertoires.';
  }

  if (state.auth.syncStatus === 'saving') {
    return 'Sauvegarde en cours...';
  }

  if (state.auth.syncStatus === 'expired') {
    return state.auth.syncMessage || 'Session expirée – reconnectez-vous pour synchroniser.';
  }

  if (state.auth.syncStatus === 'error') {
    return state.auth.syncMessage || 'Sauvegarde impossible.';
  }

  return state.auth.syncMessage || 'Synchronise';
}
