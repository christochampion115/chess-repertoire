require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const authRoutes = require('./routes/authRoutes');
const repertoireRoutes = require('./routes/repertoireRoutes');
const lichessStatsRoutes = require('./routes/lichessStatsRoutes');
const { initDb } = require('./db');
const { corsOrigin } = require('./config');

const app = express();
app.use(helmet());
app.use(express.json({ limit: '2mb' }));
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

app.use((err, req, res, next) => {
  console.error(err);

  if (err.name === 'ZodError') {
    return res.status(400).json({ error: 'Validation failed', details: err.errors });
  }

  const statusCode = err.statusCode || 500;
  return res.status(statusCode).json({ error: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 4000;
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Alpha Chess backend listening on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Database initialization failed:', error);
    process.exit(1);
  });
