const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Trop de tentatives, réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

const router = express.Router();
router.post('/signup', authLimiter, authController.signup);
router.post('/login', authLimiter, authController.login);
router.get('/me', authMiddleware, authController.me);
router.post('/logout', authMiddleware, authController.logout);

module.exports = router;
