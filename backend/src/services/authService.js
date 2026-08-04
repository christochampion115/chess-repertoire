const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
// findByPhone est utilisé dans login() via userModel.findByPhone()
const repertoireModel = require('../models/repertoireModel');
const { jwtSecret, tokenTTL } = require('../config');
const { getDb, run, get } = require('../db');

async function revokeToken(token) {
  if (!token) return;
  try {
    const payload = jwt.decode(token);
    const expiresAt = payload?.exp
      ? new Date(payload.exp * 1000).toISOString()
      : new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    await run(getDb(), 'INSERT INTO revoked_tokens (token, "expiresAt") VALUES (?, ?) ON CONFLICT DO NOTHING', [token, expiresAt]);
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

// Hash factice utilisé pour maintenir un temps de réponse constant
// même quand l'identifiant n'existe pas (protection timing attack — OWASP)
const DUMMY_HASH = '$2b$12$invalidhashfortimingprotectionXXXXXXXXXXXXXXX';

async function signup({ username, email, phone, password }) {
  const existingUsername = await userModel.findByUsername(username);
  if (existingUsername) {
    const error = new Error('Username already in use');
    error.statusCode = 409;
    throw error;
  }

  if (email) {
    const existingEmail = await userModel.findByEmail(email);
    if (existingEmail) {
      const error = new Error('Email already in use');
      error.statusCode = 409;
      throw error;
    }
  }

  if (phone) {
    const existingPhone = await userModel.findByPhone(phone);
    if (existingPhone) {
      const error = new Error('Phone already in use');
      error.statusCode = 409;
      throw error;
    }
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await userModel.createUser({ username, email: email || null, phone: phone || null, passwordHash });
  return buildAuthResponse(user);
}

async function login({ identifier, password }) {
  let user = null;

  // Détection du type d'identifiant
  if (identifier.includes('@')) {
    user = await userModel.findByEmail(identifier);
  } else if (/^\+?\d{7,15}$/.test(identifier)) {
    user = await userModel.findByPhone(identifier);
  }
  // Toujours essayer par username en dernier recours
  if (!user) {
    user = await userModel.findByUsername(identifier);
  }

  // Toujours exécuter bcrypt même si user introuvable (protection timing attack — OWASP)
  const passwordMatch = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !passwordMatch) {
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

// Conversion invité → compte (P1-C) : insère les répertoires locaux en base
async function convertGuest(userId, repertoires) {
  let count = 0;
  for (const rep of repertoires) {
    try {
      await repertoireModel.createRepertoire({ userId, data: rep });
      count++;
    } catch {
      // best-effort
    }
  }
  return { count };
}

module.exports = {
  signup,
  login,
  logout,
  isTokenRevoked,
  convertGuest,
};
