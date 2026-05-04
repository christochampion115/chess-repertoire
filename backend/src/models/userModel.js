const { getDb, run, get } = require('../db');

function findByEmail(email) {
  return get(getDb(), 'SELECT * FROM users WHERE email = ?', [email]);
}

function findByUsername(username) {
  return get(getDb(), 'SELECT * FROM users WHERE username = ?', [username]);
}

function findById(id) {
  return get(getDb(), 'SELECT * FROM users WHERE id = ?', [id]);
}

async function createUser({ username, email, passwordHash }) {
  const createdAt = new Date().toISOString();
  const result = await run(
    getDb(),
    'INSERT INTO users (username, email, "passwordHash", "createdAt") VALUES (?, ?, ?, ?) RETURNING id',
    [username, email, passwordHash, createdAt]
  );

  return { id: result.lastID, username, email, createdAt };
}

module.exports = {
  findByEmail,
  findByUsername,
  findById,
  createUser
};
