const { getDb, run, get } = require('../db');

function findByEmail(email) {
  return get(getDb(), 'SELECT * FROM users WHERE email = ?', [email]);
}

function findByUsername(username) {
  return get(getDb(), 'SELECT * FROM users WHERE username = ?', [username]);
}

function findByPhone(phone) {
  return get(getDb(), 'SELECT * FROM users WHERE phone = ?', [phone]);
}

function findById(id) {
  return get(getDb(), 'SELECT * FROM users WHERE id = ?', [id]);
}

async function createUser({ username, email, phone, passwordHash }) {
  const createdAt = new Date().toISOString();
  const result = await run(
    getDb(),
    'INSERT INTO users (username, email, phone, "passwordHash", "createdAt") VALUES (?, ?, ?, ?, ?) RETURNING id',
    [username, email || null, phone || null, passwordHash, createdAt]
  );

  return { id: result.lastID, username, email: email || null, phone: phone || null, createdAt };
}

module.exports = {
  findByEmail,
  findByUsername,
  findByPhone,
  findById,
  createUser
};
