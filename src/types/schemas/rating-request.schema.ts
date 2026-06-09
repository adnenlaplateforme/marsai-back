import z from 'zod';

export const RatingRequestSchema = z.object({
  note: z.coerce.number().int().gte(1).lte(10),
  comment: z.string().optional(),
});

export type RatingRequest = z.infer<typeof RatingRequestSchema>;
