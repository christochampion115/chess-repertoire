require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const authRoutes = require('./routes/authRoutes');
const repertoireRoutes = require('./routes/repertoireRoutes');
const lichessStatsRoutes = require('./routes/lichessStatsRoutes');
const chesscomStatsRoutes = require('./routes/chesscomStatsRoutes');
const trainingStatsRoutes = require('./routes/trainingStatsRoutes');
const userSettingsRoutes = require('./routes/userSettingsRoutes');
const { initDb, run, getDb } = require('./db');
const { corsOrigin } = require('./config');
const { handleError } = require('./utils/errorHandler');

const app = express();
app.use(helmet());
app.use(express.json({ limit: '20mb' }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', corsOrigin);
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});
app.use('/api/auth', authRoutes);
app.use('/api/repertoires', repertoireRoutes);
app.use('/api/lichess', lichessStatsRoutes);
app.use('/api/chesscom', chesscomStatsRoutes);
app.use('/api/training-stats', trainingStatsRoutes);
app.use('/api/user-settings', userSettingsRoutes);

app.use((err, req, res, next) => {
  if (err.name === 'ZodError') {
    return res.status(400).json({ error: 'Validation failed', details: err.errors });
  }
  handleError(res, err);
});

const PORT = process.env.PORT || 4000;
initDb()
  .then(() => {
    // Nettoyage périodique des tokens révoqués expirés (toutes les 6h)
    setInterval(async () => {
      try {
        await run(getDb(), 'DELETE FROM revoked_tokens WHERE "expiresAt" < ?', [new Date().toISOString()]);
      } catch (e) {
        console.warn('[maintenance] Cleanup revoked_tokens failed:', e.message);
      }
    }, 6 * 60 * 60 * 1000);
  })
  .catch((error) => {
    console.warn('[dev] Database unavailable — auth/repertoires routes will fail:', error.message);
  })
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Blundertale backend listening on http://localhost:${PORT}`);
    });
  });
