const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const { jwtSecret, tokenTTL } = require('../config');

const revokedTokens = new Set();

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
    revokedTokens.add(token);
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
