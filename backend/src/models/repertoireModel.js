const { getDb, run, get, all, withTransaction } = require('../db');

function buildLegacyPayload(row) {
  const createdAt = Date.parse(row.createdAt);

  return {
    id: `legacy-${row.id}`,
    name: row.name,
    color: row.color,
    san: row.san,
    fen: row.fen,
    comment: row.comment || '',
    varName: '',
    varAnnotation: '',
    annotation: '',
    moveNum: 0,
    turn: 'b',
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    isTransposition: false,
    sourceNodeId: null,
    children: []
  };
}

function parsePayload(row) {
  if (!row.payload) {
    return buildLegacyPayload(row);
  }

  try {
    return JSON.parse(row.payload);
  } catch {
    return buildLegacyPayload(row);
  }
}

function getStoredFieldsFromPayload(payload) {
  return {
    name: payload.name,
    color: payload.color,
    fen: payload.fen,
    san: payload.san,
    comment: payload.comment || '',
    payload: JSON.stringify(payload)
  };
}

// Extrait les champs stockables depuis le format sérialisé { rootId, nodes }
function getStoredFieldsFromSerializedData(serializedData) {
  const rootNode = Array.isArray(serializedData.nodes)
    ? serializedData.nodes.find(n => String(n.id) === String(serializedData.rootId))
    : null;
  return {
    name: rootNode?.name || '',
    color: rootNode?.color || 'w',
    fen: rootNode?.fen || '',
    san: rootNode?.san || 'Initial',
    comment: rootNode?.comment || '',
    payload: JSON.stringify(serializedData)
  };
}

function findById(id) {
  return get(getDb(), 'SELECT * FROM repertoires WHERE id = ?', [id]);
}

function findByIdAndUser(id, userId) {
  return get(getDb(), 'SELECT * FROM repertoires WHERE id = ? AND "userId" = ?', [id, userId]);
}

function listByUser(userId) {
  return all(getDb(), 'SELECT * FROM repertoires WHERE "userId" = ? ORDER BY "createdAt" DESC', [userId]);
}

async function listPayloadsByUser(userId) {
  const rows = await listByUser(userId);
  return rows.map(row => ({ serverId: row.id, data: parsePayload(row) }));
}

async function createRepertoire({ userId, data }) {
  const stored = getStoredFieldsFromSerializedData(data);
  const now = new Date().toISOString();
  const result = await run(
    getDb(),
    'INSERT INTO repertoires ("userId", name, color, fen, san, comment, payload, "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
    [userId, stored.name, stored.color, stored.fen, stored.san, stored.comment, stored.payload, now, now]
  );

  return { serverId: result.lastID, data };
}

async function replaceAllByUser(userId, payloads) {
  const now = new Date().toISOString();

  await withTransaction(async (client) => {
    await client.query('DELETE FROM repertoires WHERE "userId" = $1', [userId]);

    for (const payload of payloads) {
      const stored = getStoredFieldsFromSerializedData(payload);
      await client.query(
        'INSERT INTO repertoires ("userId", name, color, fen, san, comment, payload, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [userId, stored.name, stored.color, stored.fen, stored.san, stored.comment, stored.payload, now, now]
      );
    }
  });

  return listPayloadsByUser(userId);
}

async function updateRepertoire(id, userId, updates) {
  const existing = await findByIdAndUser(id, userId);
  if (!existing) {
    return null;
  }

  let stored;
  if (updates.data) {
    stored = getStoredFieldsFromSerializedData(updates.data);
  } else {
    stored = {
      name: updates.name ?? existing.name,
      color: updates.color ?? existing.color,
      fen: updates.fen ?? existing.fen,
      san: updates.san ?? existing.san,
      comment: updates.comment ?? existing.comment,
      payload: existing.payload
    };
  }

  const updatedAt = new Date().toISOString();
  await run(
    getDb(),
    'UPDATE repertoires SET name = ?, color = ?, fen = ?, san = ?, comment = ?, payload = ?, "updatedAt" = ? WHERE id = ? AND "userId" = ?',
    [stored.name, stored.color, stored.fen, stored.san, stored.comment, stored.payload, updatedAt, id, userId]
  );

  return { serverId: id, data: updates.data };
}

async function deleteRepertoire(id, userId) {
  const result = await run(getDb(), 'DELETE FROM repertoires WHERE id = ? AND "userId" = ?', [id, userId]);
  return result.changes > 0;
}

module.exports = {
  findById,
  findByIdAndUser,
  listByUser,
  listPayloadsByUser,
  createRepertoire,
  replaceAllByUser,
  updateRepertoire,
  deleteRepertoire
};
