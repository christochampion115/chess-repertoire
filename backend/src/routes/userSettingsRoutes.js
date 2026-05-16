const express = require('express');
const userSettingsController = require('../controllers/userSettingsController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();
router.use(authMiddleware);
router.get('/', userSettingsController.getSettings);
router.put('/', userSettingsController.updateSettings);

module.exports = router;
