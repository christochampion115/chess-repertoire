const path = require('path');
const os = require('os');

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error('JWT_SECRET must be set in environment variables');
}

// Base de données stockée hors du workspace pour éviter que Live Server
// ne détecte les écritures SQLite et recharge la page.
const dbPath = process.env.DB_PATH ||
  path.join(os.homedir(), '.blundertale', 'database.sqlite');

module.exports = {
  jwtSecret,
  tokenTTL: '8h',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  dbPath
};
