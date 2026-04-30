const repertoireModel = require('../models/repertoireModel');

function listRepertoires(userId) {
  return repertoireModel.listPayloadsByUser(userId);
}

function replaceAllRepertoires(userId, payloads) {
  return repertoireModel.replaceAllByUser(userId, payloads);
}

function createRepertoire(userId, repertoireData) {
  return repertoireModel.createRepertoire({ userId, ...repertoireData });
}

async function updateRepertoire(userId, id, repertoireData) {
  const updated = await repertoireModel.updateRepertoire(id, userId, repertoireData);
  if (!updated) {
    const error = new Error('Repertoire not found or access denied');
    error.statusCode = 404;
    throw error;
  }
  return updated;
}

async function deleteRepertoire(userId, id) {
  const deleted = await repertoireModel.deleteRepertoire(id, userId);
  if (!deleted) {
    const error = new Error('Repertoire not found or access denied');
    error.statusCode = 404;
    throw error;
  }
  return deleted;
}

module.exports = {
  listRepertoires,
  replaceAllRepertoires,
  createRepertoire,
  updateRepertoire,
  deleteRepertoire
};
