const { z } = require('zod');

const signupSchema = z.object({
  username: z.string().min(3).max(30),
  email: z.string().email().optional(),
  password: z.string().min(8)
});

const loginSchema = z.object({
  email: z.string().min(3),
  password: z.string().min(8)
});

module.exports = {
  signupSchema,
  loginSchema
};
