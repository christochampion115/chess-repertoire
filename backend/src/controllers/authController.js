const authService = require('../services/authService');
const { signupSchema, loginSchema } = require('../validators/authValidator');

async function signup(req, res, next) {
  try {
    const data = signupSchema.parse(req.body);
    const session = await authService.signup(data);
    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
}

async function login(req, res, next) {
  try {
    const data = loginSchema.parse(req.body);
    const result = await authService.login(data);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

function logout(req, res, next) {
  try {
    authService.logout(req.token);
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
}

function me(req, res, next) {
  try {
    res.json({ user: req.user });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  signup,
  login,
  logout,
  me
};
