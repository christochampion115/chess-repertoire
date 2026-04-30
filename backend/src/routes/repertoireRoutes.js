const express = require('express');
const repertoireController = require('../controllers/repertoireController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();
router.use(authMiddleware);
router.get('/', repertoireController.listRepertoires);
router.put('/sync', repertoireController.syncRepertoires);
router.post('/', repertoireController.createRepertoire);
router.put('/:id', repertoireController.updateRepertoire);
router.delete('/:id', repertoireController.deleteRepertoire);

module.exports = router;
