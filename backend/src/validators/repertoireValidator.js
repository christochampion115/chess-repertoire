const { z } = require('zod');

const serializedRepertoireNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80).optional(),
  color: z.enum(['w', 'b']).optional(),
  san: z.string().min(1),
  fen: z.string().min(1),
  comment: z.string().max(500).optional(),
  varName: z.string().max(120).optional(),
  varAnnotation: z.string().max(8).optional(),
  annotation: z.string().max(8).optional(),
  moveNum: z.number().int().min(0).optional(),
  turn: z.enum(['w', 'b']).optional(),
  createdAt: z.union([z.number(), z.string()]).optional(),
  isTransposition: z.boolean().optional(),
  sourceNodeId: z.string().nullable().optional(),
  children: z.array(z.string()).optional()
}).passthrough();

const serializedRepertoireSchema = z.object({
  rootId: z.string().min(1),
  nodes: z.array(serializedRepertoireNodeSchema).min(1)
});

const repertoireSchema = z.object({
  data: serializedRepertoireSchema
});

const repertoireUpdateSchema = z
  .object({
    data: serializedRepertoireSchema
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided'
  });

const repertoireSyncSchema = z.object({
  repertoires: z.array(serializedRepertoireSchema)
});

module.exports = {
  repertoireSchema,
  repertoireUpdateSchema,
  repertoireSyncSchema
};
