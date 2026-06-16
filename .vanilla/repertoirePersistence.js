function serializeNode(node) {
  return {
    id: String(node.id),
    ...(node.name ? { name: node.name } : {}),
    ...(node.color ? { color: node.color } : {}),
    ...(node.folderId ? { folderId: node.folderId } : {}),
    ...(Number.isFinite(node.updatedAt) ? { updatedAt: node.updatedAt } : {}),
    ...(node.trainingMedalTier ? { trainingMedalTier: node.trainingMedalTier } : {}),
    ...(Number.isFinite(node.trainingMedalShineLevel) ? { trainingMedalShineLevel: node.trainingMedalShineLevel } : {}),
    ...(Number.isFinite(node.trainingMedalUpdatedAt) ? { trainingMedalUpdatedAt: node.trainingMedalUpdatedAt } : {}),
    san: node.san,
    fen: node.fen,
    comment: node.comment || '',
    varName: node.varName || '',
    varAnnotation: node.varAnnotation || '',
    annotation: node.annotation || '',
    moveNum: Number.isFinite(node.moveNum) ? node.moveNum : 0,
    turn: node.turn || 'b',
    createdAt: node.createdAt ?? Date.now(),
    isTransposition: Boolean(node.isTransposition),
    sourceNodeId: node.sourceNode ? String(node.sourceNode.id) : null,
    children: Array.isArray(node.children) ? node.children.map(serializeNode) : []
  };
}

export function serializeRepertoires(repertoires) {
  return Array.isArray(repertoires) ? repertoires.map(serializeNode) : [];
}

export function serializeRepertoire(repertoire) {
  if (!repertoire || typeof repertoire !== 'object') {
    return null;
  }

  const nodes = [];
  const visited = new Set();

  function visit(node) {
    if (!node || typeof node !== 'object') {
      return;
    }

    const nodeId = String(node.id);
    if (visited.has(nodeId)) {
      return;
    }

    visited.add(nodeId);
    nodes.push({
      id: nodeId,
      ...(node.name ? { name: node.name } : {}),
      ...(node.color ? { color: node.color } : {}),
      ...(node.folderId ? { folderId: node.folderId } : {}),
      ...(Number.isFinite(node.updatedAt) ? { updatedAt: node.updatedAt } : {}),
      ...(node.trainingMedalTier ? { trainingMedalTier: node.trainingMedalTier } : {}),
      ...(Number.isFinite(node.trainingMedalShineLevel) ? { trainingMedalShineLevel: node.trainingMedalShineLevel } : {}),
      ...(Number.isFinite(node.trainingMedalUpdatedAt) ? { trainingMedalUpdatedAt: node.trainingMedalUpdatedAt } : {}),
      san: node.san,
      fen: node.fen,
      comment: node.comment || '',
      varName: node.varName || '',
      varAnnotation: node.varAnnotation || '',
      annotation: node.annotation || '',
      moveNum: Number.isFinite(node.moveNum) ? node.moveNum : 0,
      turn: node.turn || 'b',
      createdAt: node.createdAt ?? Date.now(),
      isTransposition: Boolean(node.isTransposition),
      sourceNodeId: node.sourceNode ? String(node.sourceNode.id) : null,
      children: Array.isArray(node.children) ? node.children.map((child) => String(child.id)) : []
    });

    if (Array.isArray(node.children)) {
      node.children.forEach(visit);
    }

    if (node.sourceNode) {
      visit(node.sourceNode);
    }
  }

  visit(repertoire);

  return {
    rootId: String(repertoire.id),
    nodes
  };
}

export function deserializeRepertoire(serializedRepertoire) {
  if (!serializedRepertoire || typeof serializedRepertoire !== 'object') {
    return null;
  }

  const rawNodes = Array.isArray(serializedRepertoire.nodes) ? serializedRepertoire.nodes : [];
  const rootId = serializedRepertoire.rootId != null ? String(serializedRepertoire.rootId) : '';

  if (!rootId || rawNodes.length === 0) {
    return null;
  }

  const nodesById = new Map();

  for (const rawNode of rawNodes) {
    if (!rawNode || typeof rawNode !== 'object' || rawNode.id == null) {
      continue;
    }

    const node = {
      id: String(rawNode.id),
      ...(rawNode.name ? { name: rawNode.name } : {}),
      ...(rawNode.color ? { color: rawNode.color } : {}),
      ...(rawNode.folderId ? { folderId: rawNode.folderId } : {}),
      ...(Number.isFinite(rawNode.updatedAt) ? { updatedAt: rawNode.updatedAt } : {}),
      ...(rawNode.trainingMedalTier ? { trainingMedalTier: rawNode.trainingMedalTier } : {}),
      ...(Number.isFinite(rawNode.trainingMedalShineLevel) ? { trainingMedalShineLevel: rawNode.trainingMedalShineLevel } : {}),
      ...(Number.isFinite(rawNode.trainingMedalUpdatedAt) ? { trainingMedalUpdatedAt: rawNode.trainingMedalUpdatedAt } : {}),
      san: rawNode.san || 'Initial',
      fen: rawNode.fen,
      parent: null,
      children: [],
      moveNum: Number.isFinite(rawNode.moveNum) ? rawNode.moveNum : 0,
      turn: rawNode.turn || 'b',
      createdAt: rawNode.createdAt ?? Date.now(),
      annotation: rawNode.annotation || '',
      comment: rawNode.comment || '',
      isTransposition: Boolean(rawNode.isTransposition),
      sourceNode: null,
      varName: rawNode.varName || '',
      varAnnotation: rawNode.varAnnotation || ''
    };

    nodesById.set(node.id, node);
  }

  for (const rawNode of rawNodes) {
    if (!rawNode || rawNode.id == null) {
      continue;
    }

    const node = nodesById.get(String(rawNode.id));
    if (!node) {
      continue;
    }

    const childIds = Array.isArray(rawNode.children) ? rawNode.children : [];
    node.children = childIds
      .map((childId) => nodesById.get(String(childId)) || null)
      .filter(Boolean);

    node.children.forEach((childNode) => {
      childNode.parent = node;
    });

    node.sourceNode = rawNode.sourceNodeId
      ? (nodesById.get(String(rawNode.sourceNodeId)) || null)
      : null;
    node.isTransposition = Boolean(node.isTransposition && node.sourceNode);
  }

  return nodesById.get(rootId) || null;
}

export function runRepertoirePersistenceSelfTest() {
  const root = {
    id: 'root',
    name: 'Test repertoire',
    color: 'w',
    san: 'Initial',
    fen: 'start',
    parent: null,
    children: [],
    moveNum: 0,
    turn: 'b',
    createdAt: 1,
    annotation: '',
    comment: '',
    isTransposition: false,
    sourceNode: null,
    varName: '',
    varAnnotation: ''
  };

  const e4 = {
    id: 'e4',
    san: 'e4',
    fen: 'fen-e4',
    parent: root,
    children: [],
    moveNum: 1,
    turn: 'w',
    createdAt: 2,
    annotation: '',
    comment: '',
    isTransposition: false,
    sourceNode: null,
    varName: '',
    varAnnotation: ''
  };

  const d4 = {
    id: 'd4',
    san: 'd4',
    fen: 'fen-d4',
    parent: root,
    children: [],
    moveNum: 1,
    turn: 'w',
    createdAt: 3,
    annotation: '',
    comment: '',
    isTransposition: false,
    sourceNode: null,
    varName: '',
    varAnnotation: ''
  };

  const c5 = {
    id: 'c5',
    san: 'c5',
    fen: 'fen-c5',
    parent: e4,
    children: [],
    moveNum: 1,
    turn: 'b',
    createdAt: 4,
    annotation: '',
    comment: 'sicilian',
    isTransposition: false,
    sourceNode: null,
    varName: '',
    varAnnotation: ''
  };

  const c5Transposition = {
    id: 'c5-transpo',
    san: 'c5',
    fen: 'fen-c5',
    parent: d4,
    children: [],
    moveNum: 1,
    turn: 'b',
    createdAt: 5,
    annotation: '',
    comment: 'sicilian transposition',
    isTransposition: true,
    sourceNode: c5,
    varName: '',
    varAnnotation: ''
  };

  root.children = [e4, d4];
  e4.children = [c5];
  d4.children = [c5Transposition];

  const serialized = serializeRepertoire(root);
  const restored = deserializeRepertoire(serialized);

  const checks = [
    {
      label: 'root restored',
      ok: Boolean(restored && restored.id === 'root')
    },
    {
      label: 'moves preserved',
      ok: Boolean(restored && restored.children[0]?.san === 'e4' && restored.children[1]?.san === 'd4')
    },
    {
      label: 'variation preserved',
      ok: Boolean(restored && restored.children[0]?.children[0]?.san === 'c5')
    },
    {
      label: 'parent links restored',
      ok: Boolean(restored && restored.children[0]?.parent === restored && restored.children[1]?.children[0]?.parent === restored.children[1])
    },
    {
      label: 'sourceNode links restored',
      ok: Boolean(
        restored
        && restored.children[1]?.children[0]?.sourceNode
        && restored.children[1].children[0].sourceNode === restored.children[0].children[0]
        && restored.children[1].children[0].isTransposition === true
      )
    }
  ];

  const result = {
    ok: checks.every((check) => check.ok),
    checks
  };

  if (!result.ok) {
    console.error('Repertoire persistence self-test failed', result);
  } else {
    console.info('Repertoire persistence self-test passed', result);
  }

  return result;
}

function hydrateRepertoire(rawRepertoire) {
  const nodesById = new Map();

  function buildNode(rawNode, parent = null) {
    const node = {
      id: String(rawNode.id),
      ...(rawNode.name ? { name: rawNode.name } : {}),
      ...(rawNode.color ? { color: rawNode.color } : {}),
      san: rawNode.san || 'Initial',
      fen: rawNode.fen,
      parent,
      children: [],
      moveNum: Number.isFinite(rawNode.moveNum) ? rawNode.moveNum : 0,
      turn: rawNode.turn || 'b',
      createdAt: rawNode.createdAt ?? Date.now(),
      annotation: rawNode.annotation || '',
      comment: rawNode.comment || '',
      isTransposition: Boolean(rawNode.isTransposition),
      sourceNode: null,
      sourceNodeId: rawNode.sourceNodeId || null,
      varName: rawNode.varName || '',
      varAnnotation: rawNode.varAnnotation || ''
    };

    nodesById.set(node.id, node);
    node.children = Array.isArray(rawNode.children)
      ? rawNode.children.map((child) => buildNode(child, node))
      : [];

    return node;
  }

  const root = buildNode(rawRepertoire, null);

  function resolveNode(node) {
    node.sourceNode = node.sourceNodeId ? (nodesById.get(String(node.sourceNodeId)) || null) : null;
    node.isTransposition = Boolean(node.isTransposition && node.sourceNode);
    delete node.sourceNodeId;
    node.children.forEach(resolveNode);
  }

  resolveNode(root);
  return root;
}

export function hydrateRepertoires(rawRepertoires) {
  return Array.isArray(rawRepertoires)
    ? rawRepertoires.map(hydrateRepertoire)
    : [];
}
