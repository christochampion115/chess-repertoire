const { z } = require('zod');

const signupSchema = z.object({
  username: z.string().min(3).max(30).trim(),
  email: z.string().email().max(254).trim().toLowerCase(),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(1),
});

module.exports = {
  signupSchema,
  loginSchema
};
