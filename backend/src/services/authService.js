const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const { jwtSecret, tokenTTL } = require('../config');
const { getDb, run, get } = require('../db');

async function revokeToken(token) {
  if (!token) return;
  try {
    const payload = jwt.decode(token);
    const expiresAt = payload?.exp
      ? new Date(payload.exp * 1000).toISOString()
      : new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    await run(getDb(), 'INSERT OR IGNORE INTO revoked_tokens (token, expiresAt) VALUES (?, ?)', [token, expiresAt]);
  } catch {
    // Ignorer les erreurs de révocation (token malformé, base indisponible)
  }
}

async function isTokenRevoked(token) {
  if (!token) return false;
  try {
    const row = await get(getDb(), 'SELECT token FROM revoked_tokens WHERE token = ?', [token]);
    return !!row;
  } catch {
    return false;
  }
}

function buildAuthResponse(user) {
  const token = jwt.sign({ sub: user.id, email: user.email }, jwtSecret, {
    expiresIn: tokenTTL
  });

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email
    }
  };
}

function buildInternalEmail(username) {
  const encodedUsername = Buffer.from(String(username || '').trim(), 'utf8').toString('hex') || 'user';
  return `user_${encodedUsername}@alpha-chess.local`;
}

async function signup({ username, email, password }) {
  const resolvedEmail = email || buildInternalEmail(username);

  const existingEmail = await userModel.findByEmail(resolvedEmail);
  if (existingEmail) {
    const error = new Error('Email already in use');
    error.statusCode = 409;
    throw error;
  }

  const existingUsername = await userModel.findByUsername(username);
  if (existingUsername) {
    const error = new Error('Username already in use');
    error.statusCode = 409;
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await userModel.createUser({ username, email: resolvedEmail, passwordHash });
  return buildAuthResponse(user);
}

async function login({ email, password }) {
  const user = await userModel.findByEmail(email) || await userModel.findByUsername(email);
  if (!user) {
    const error = new Error('Invalid credentials');
    error.statusCode = 401;
    throw error;
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch) {
    const error = new Error('Invalid credentials');
    error.statusCode = 401;
    throw error;
  }

  return buildAuthResponse(user);
}

function logout(token) {
  if (token) {
    revokeToken(token);
  }
}

function isTokenRevoked(token) {
  return revokedTokens.has(token);
}

module.exports = {
  signup,
  login,
  logout,
  isTokenRevoked
};
