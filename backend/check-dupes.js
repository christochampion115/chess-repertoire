require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const users = await pool.query('SELECT id, username, email, LENGTH(username) as len, "createdAt" FROM users ORDER BY id');
  console.log('\n=== TOUS LES UTILISATEURS ===');
  console.table(users.rows);

  const dupU = await pool.query('SELECT username, COUNT(*) as count FROM users GROUP BY username HAVING COUNT(*) > 1');
  console.log('\n=== DOUBLONS USERNAME ===');
  console.log(dupU.rows.length ? dupU.rows : 'aucun');

  const dupE = await pool.query('SELECT email, COUNT(*) as count FROM users GROUP BY email HAVING COUNT(*) > 1');
  console.log('\n=== DOUBLONS EMAIL ===');
  console.log(dupE.rows.length ? dupE.rows : 'aucun');

  await pool.end();
}
main().catch(console.error);
