const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { postTrainingStat, getTrainingStat } = require('../controllers/trainingStatsController');

router.use(authMiddleware);
router.post('/', postTrainingStat);
router.get('/', getTrainingStat);

module.exports = router;
