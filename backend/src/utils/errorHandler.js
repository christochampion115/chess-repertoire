function handleError(res, error, defaultMessage = 'Erreur interne du serveur') {
  const statusCode = error.statusCode || error.status || 500;
  console.error(`[error] ${statusCode} —`, error.message);
  if (process.env.NODE_ENV === 'production') {
    return res.status(statusCode).json({ error: defaultMessage });
  }
  return res.status(statusCode).json({ error: error.message || defaultMessage });
}

function handleSseError(safeWrite, error, defaultMessage = 'Erreur interne du serveur') {
  console.error('[error] SSE —', error.message);
  const message = process.env.NODE_ENV === 'production'
    ? defaultMessage
    : (error.message || defaultMessage);
  safeWrite(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`);
}

module.exports = { handleError, handleSseError };
