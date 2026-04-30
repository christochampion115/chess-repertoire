const repertoireService = require('../services/repertoireService');
const { repertoireSchema, repertoireUpdateSchema, repertoireSyncSchema } = require('../validators/repertoireValidator');

function parseRepertoireId(rawId) {
  const id = Number.parseInt(rawId, 10);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error('Invalid repertoire id');
    error.statusCode = 400;
    throw error;
  }
  return id;
}

async function listRepertoires(req, res, next) {
  try {
    const repertoires = await repertoireService.listRepertoires(req.user.id);
    res.json({ repertoires });
  } catch (error) {
    next(error);
  }
}

async function createRepertoire(req, res, next) {
  try {
    const data = repertoireSchema.parse(req.body);
    const repertoire = await repertoireService.createRepertoire(req.user.id, data);
    res.status(201).json({ repertoire });
  } catch (error) {
    next(error);
  }
}

async function updateRepertoire(req, res, next) {
  try {
    const id = parseRepertoireId(req.params.id);
    const payload = repertoireUpdateSchema.parse(req.body);
    const updated = await repertoireService.updateRepertoire(req.user.id, id, payload);
    res.json({ repertoire: updated });
  } catch (error) {
    next(error);
  }
}

async function syncRepertoires(req, res, next) {
  try {
    const data = repertoireSyncSchema.parse(req.body);
    const repertoires = await repertoireService.replaceAllRepertoires(req.user.id, data.repertoires);
    res.json({ repertoires });
  } catch (error) {
    next(error);
  }
}

async function deleteRepertoire(req, res, next) {
  try {
    const id = parseRepertoireId(req.params.id);
    await repertoireService.deleteRepertoire(req.user.id, id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listRepertoires,
  createRepertoire,
  syncRepertoires,
  updateRepertoire,
  deleteRepertoire
};
