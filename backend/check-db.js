require('dotenv').config({ path: require('path').join(__dirname, '.env.prod') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function query(label, sql, params = []) {
  console.log(`\n━━━ ${label} ━━━`);
  try {
    const res = await pool.query(sql, params);
    if (res.rows.length === 0) {
      console.log('(vide)');
    } else {
      console.table(res.rows);
    }
  } catch (err) {
    console.error(`Erreur: ${err.message}`);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Erreur : ajoute DATABASE_URL dans backend/.env');
    process.exit(1);
  }

  await query('Utilisateurs', `SELECT id, username, email, "createdAt" FROM users ORDER BY id`);
  await query('Répertoires', `SELECT id, "userId", name, color, fen, "createdAt", "updatedAt" FROM repertoires ORDER BY id`);
  await query('Training Stats', `SELECT * FROM training_stats ORDER BY id`);
  await query('Rapports sauvegardés', `SELECT id, "userId", params, "createdAt" FROM saved_reports ORDER BY id`);
  await query('Cache stats joueurs', `SELECT id, "userId", "cacheKey", fen, "createdAt" FROM player_stats_cache ORDER BY id`);
  await query('Tokens révoqués', `SELECT * FROM revoked_tokens ORDER BY "expiresAt"`);
  await query('User settings', `SELECT "userId", settings, "updatedAt" FROM user_settings ORDER BY "userId"`);

  await pool.end();
  console.log('\n✅ Terminé');
}

main().catch(console.error);
