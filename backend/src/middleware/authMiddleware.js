const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config');
const authService = require('../services/authService');
const userModel = require('../models/userModel');

async function authMiddleware(req, res, next) {
  try {
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header missing or malformed' });
    }

    const token = authorization.split(' ')[1];
    if (await authService.isTokenRevoked(token)) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }

    const payload = jwt.verify(token, jwtSecret);
    const user = await userModel.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = { id: user.id, username: user.username, email: user.email };
    req.token = token;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = authMiddleware;

// ─── Optional auth ────────────────────────────────────────────────────────
// Populates req.user if a valid token is present, but never returns 401.
async function optionalAuthMiddleware(req, res, next) {
  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith('Bearer ')) return next();
  try {
    const token = authorization.split(' ')[1];
    if (await authService.isTokenRevoked(token)) return next();
    const payload = jwt.verify(token, jwtSecret);
    const user = await userModel.findById(payload.sub);
    if (user) req.user = { id: user.id, username: user.username, email: user.email };
  } catch (_) { /* invalid token — proceed without user */ }
  next();
}

module.exports.optionalAuthMiddleware = optionalAuthMiddleware;
