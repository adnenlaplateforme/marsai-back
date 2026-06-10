import z from 'zod';

export const RandomMovieRequestSchema = z.object({
  query: z.object({
    qt: z.coerce.number().int().positive(),
  }),
});

export type RandomMovieRequest = z.infer<typeof RandomMovieRequestSchema>;
