const rateLimit = require('express-rate-limit');

const WHITELIST_IPS = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
const skipLocal = (req) => WHITELIST_IPS.includes(req.ip);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: skipLocal,
  message: { error: 'Trop de tentatives, réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const statsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  skip: skipLocal,
  message: { error: 'Trop de requêtes, réessayez dans une minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const reportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  skip: skipLocal,
  message: { error: 'Trop de requêtes rapport, réessayez dans une minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const batchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  skip: skipLocal,
  message: { error: 'Trop de requêtes batch, réessayez dans une minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const sseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  skip: skipLocal,
  message: { error: 'Trop de connexions, réessayez dans une minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { authLimiter, statsLimiter, reportLimiter, batchLimiter, sseLimiter };
