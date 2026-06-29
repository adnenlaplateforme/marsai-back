import { z } from 'zod';
import { getVideoDurationInSeconds } from 'get-video-duration';
import { Languages } from '../enums/languages.enum.js';
import { ImageFileSchema, VideoFileSchema } from './MovieRequest.schema.js';

const ImageUrlOrFileField = z.union([
  ImageFileSchema.transform(
    (file) => process.env.SCALEWAY_VIRTUAL_ENDPOINT + file.key,
  ),
  z.url(),
]);

const VideoUrlOrFileField = z.union([
  VideoFileSchema.transform(async (file, ctx) => {
    const url = process.env.SCALEWAY_VIRTUAL_ENDPOINT + file.key;
    try {
      const duration = await getVideoDurationInSeconds(url, '/usr/bin/ffprobe');
      if (duration > 90) {
        ctx.addIssue({
          code: 'custom',
          message: 'Video cannot be longer than 90 seconds.',
        });
        return z.NEVER;
      }
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Could not verify video duration.' });
      return z.NEVER;
    }
    return url;
  }),
  z.url(),
]);

export const UpdateMovieRequestSchema = z.object({
  originalTitle: z.string().min(1).max(255).optional(),
  englishTitle: z.string().min(1).max(255).optional(),
  videoPath: VideoUrlOrFileField.optional(),
  coverPath: ImageUrlOrFileField.optional(),
  isHybrid: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  language: z.enum(Languages).optional(),
  originalSynopsis: z.string().min(1).max(300).optional(),
  englishSynopsis: z.string().min(1).max(300).optional(),
  creativeProcess: z.string().min(1).max(500).optional(),
  aiTools: z.string().min(1).max(500).optional(),
  hasSubs: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export type UpdateMovieRequest = z.infer<typeof UpdateMovieRequestSchema>;
