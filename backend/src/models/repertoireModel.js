const { getDb, run, get, all } = require('../db');

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

function findById(id) {
  return get(getDb(), 'SELECT * FROM repertoires WHERE id = ?', [id]);
}

function findByIdAndUser(id, userId) {
  return get(getDb(), 'SELECT * FROM repertoires WHERE id = ? AND userId = ?', [id, userId]);
}

function listByUser(userId) {
  return all(getDb(), 'SELECT * FROM repertoires WHERE userId = ? ORDER BY createdAt DESC', [userId]);
}

async function listPayloadsByUser(userId) {
  const rows = await listByUser(userId);
  return rows.map(parsePayload);
}

async function createRepertoire({ userId, name, color, fen, san, comment }) {
  const now = new Date().toISOString();
  const result = await run(
    getDb(),
    'INSERT INTO repertoires (userId, name, color, fen, san, comment, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [userId, name, color, fen, san, comment || '', now, now]
  );

  return { id: result.lastID, userId, name, color, fen, san, comment: comment || '', createdAt: now, updatedAt: now };
}

async function replaceAllByUser(userId, payloads) {
  const db = getDb();
  const now = new Date().toISOString();

  await run(db, 'BEGIN TRANSACTION');

  try {
    await run(db, 'DELETE FROM repertoires WHERE userId = ?', [userId]);

    for (const payload of payloads) {
      const stored = getStoredFieldsFromPayload(payload);
      await run(
        db,
        'INSERT INTO repertoires (userId, name, color, fen, san, comment, payload, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, stored.name, stored.color, stored.fen, stored.san, stored.comment, stored.payload, now, now]
      );
    }

    await run(db, 'COMMIT');
  } catch (error) {
    await run(db, 'ROLLBACK');
    throw error;
  }

  return listPayloadsByUser(userId);
}

async function updateRepertoire(id, userId, updates) {
  const existing = await findByIdAndUser(id, userId);
  if (!existing) {
    return null;
  }

  const data = {
    name: updates.name ?? existing.name,
    color: updates.color ?? existing.color,
    fen: updates.fen ?? existing.fen,
    san: updates.san ?? existing.san,
    comment: updates.comment ?? existing.comment,
    updatedAt: new Date().toISOString()
  };

  await run(
    getDb(),
    'UPDATE repertoires SET name = ?, color = ?, fen = ?, san = ?, comment = ?, updatedAt = ? WHERE id = ? AND userId = ?',
    [data.name, data.color, data.fen, data.san, data.comment, data.updatedAt, id, userId]
  );

  return { id, userId, ...data, createdAt: existing.createdAt };
}

async function deleteRepertoire(id, userId) {
  const result = await run(getDb(), 'DELETE FROM repertoires WHERE id = ? AND userId = ?', [id, userId]);
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
