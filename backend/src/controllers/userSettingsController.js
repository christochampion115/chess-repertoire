const userSettingsModel = require('../models/userSettingsModel');

const ALLOWED_KEYS = ['repFolders', 'repOrder', 'boardTheme', 'analysisSettings', 'statsFilters'];

async function getSettings(req, res, next) {
  try {
    const settings = await userSettingsModel.getSettings(req.user.id);
    res.json({ settings });
  } catch (error) {
    next(error);
  }
}

async function updateSettings(req, res, next) {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return res.status(400).json({ error: 'Invalid settings payload' });
    }

    // Sanitize: only accept known keys to prevent arbitrary data storage
    const sanitized = {};
    for (const key of ALLOWED_KEYS) {
      if (Object.prototype.hasOwnProperty.call(settings, key)) {
        sanitized[key] = settings[key];
      }
    }

    // Merge with existing settings to avoid overwriting unrelated keys
    const existing = await userSettingsModel.getSettings(req.user.id);
    const merged = { ...existing, ...sanitized };

    const updated = await userSettingsModel.upsertSettings(req.user.id, merged);
    res.json({ settings: updated });
  } catch (error) {
    next(error);
  }
}

module.exports = { getSettings, updateSettings };
