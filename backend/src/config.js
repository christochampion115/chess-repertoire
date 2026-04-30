const path = require('path');
const os = require('os');

const DEFAULT_JWT_SECRET = 'alpha-chess-secret-change-me';
const jwtSecret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;

if (process.env.NODE_ENV === 'production' && jwtSecret === DEFAULT_JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

// Base de données stockée hors du workspace pour éviter que Live Server
// ne détecte les écritures SQLite et recharge la page.
const dbPath = process.env.DB_PATH ||
  path.join(os.homedir(), '.alpha-chess', 'database.sqlite');

module.exports = {
  jwtSecret,
  tokenTTL: '8h',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  dbPath
};
