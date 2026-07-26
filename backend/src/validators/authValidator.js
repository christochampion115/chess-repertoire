const { z } = require('zod');

const signupSchema = z.object({
  username: z.string().min(3).max(30).trim(),
  email: z.string().email().optional(),
  phone: z.string().regex(/^\+\d{7,15}$/, 'Format attendu : +32475123456').optional(),
  password: z.string().min(8).max(128),
}).refine((data) => data.email || data.phone, {
  message: 'Un email ou un numéro de téléphone est requis',
  path: ['email'],
});

const loginSchema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(1),
});

module.exports = {
  signupSchema,
  loginSchema
};
