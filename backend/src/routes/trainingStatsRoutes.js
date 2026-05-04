const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { postTrainingStat, getTrainingStat } = require('../controllers/trainingStatsController');

router.use(authenticate);
router.post('/', postTrainingStat);
router.get('/', getTrainingStat);

module.exports = router;
