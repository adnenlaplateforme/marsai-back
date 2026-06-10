import z from 'zod';

export const CreateEventRequestSchema = z.object({
  title: z.string().nonempty(),
  slug: z.string().optional(),
  description: z.string().optional().default(''),
  date: z.coerce.date(),
  publishedAt: z.coerce.date(),
  duration: z.int().positive(),
  location: z.string().max(255),
  isBookable: z.boolean().default(false),
  capacity: z.number().int().positive(),
  lang: z.enum(['FR', 'EN']).default('FR'),
});

export type CreateEventRequest = z.infer<typeof CreateEventRequestSchema>;
