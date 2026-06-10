import z from 'zod';
import {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  MAX_IMAGE_SIZE,
  MAX_VIDEO_SIZE,
} from '../../helpers/upload-const.js';
import { getVideoDurationInSeconds } from 'get-video-duration';
import { Languages } from '../enums/languages.enum.js';
import { MovieStatus } from '../enums/movie-status.enum.js';

const parseJson = (value: unknown, ctx: z.RefinementCtx) => {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as object;
    } catch (e) {
      ctx.addIssue({
        code: 'custom',
        message: (e as Error).message,
      });
      return z.NEVER;
    }
  }
  return value;
};

const ImageFileSchema = z.object({
  mimetype: z.enum(ALLOWED_IMAGE_TYPES),
  size: z.number().max(MAX_IMAGE_SIZE, {
    message: `Image size must be less than ${MAX_IMAGE_SIZE / 1048576}MB.`,
  }),
  location: z.url(),
  key: z.string(),
});

const VideoFileSchema = z.object({
  mimetype: z.enum(ALLOWED_VIDEO_TYPES),
  size: z.number().max(MAX_VIDEO_SIZE, {
    message: `Video size must be less than ${MAX_VIDEO_SIZE / 1048576}MB.`,
  }),
  location: z.url(),
  key: z.string(),
});

const DirectorSchema = z.object({
  firstname: z.string(),
  lastname: z.string(),
  gender: z.string(),
  email: z.email(),
  job: z.string(),
  address: z.string(),
  zipcode: z.string().nullable().default(null),
  city: z.string(),
  region: z.string().nullable().default(null),
  country: z.string(),
  phone: z.string(),
  birthdate: z.string(),
  facebookUrl: z.string().nullable().default(null),
  instagramUrl: z.string().nullable().default(null),
  youtubeUrl: z.string().nullable().default(null),
  twitterUrl: z.string().nullable().default(null),
  linkedinUrl: z.string().nullable().default(null),
});

export type Director = z.infer<typeof DirectorSchema>;

const CollaboratorsSchema = z.object({
  gender: z.string(),
  firstname: z.string(),
  lastname: z.string(),
  contribution: z.string(),
  email: z.email(),
});

export type Collaborator = z.infer<typeof CollaboratorsSchema>;

const ImageUrlField = ImageFileSchema.transform(
  (file) => process.env.SCALEWAY_VIRTUAL_ENDPOINT + file.key,
);
const VideoUrlField = VideoFileSchema.transform(
  (file) => process.env.SCALEWAY_VIRTUAL_ENDPOINT + file.key,
);

export const MovieRequestSchema = z
  .object({
    token: z.string().nonempty().optional(),
    status: z.enum(MovieStatus).optional(),
    originalTitle: z.string().min(1).max(255),
    englishTitle: z.string().min(1).max(255),
    slug: z.string().optional(),
    videoPath: VideoUrlField,
    coverPath: ImageUrlField,
    stillsUrls: z.array(ImageUrlField).default([]),
    isHybrid: z
      .enum(['true', 'false'])
      .transform((v) => (v === 'true' ? true : false)),
    language: z.enum(Languages),
    originalSynopsis: z.string().min(1).max(300),
    englishSynopsis: z.string().min(1).max(300),
    creativeProcess: z.string().min(1).max(500),
    aiTools: z.string().min(1).max(500),
    hasSubs: z
      .enum(['true', 'false'])
      .transform((v) => (v === 'true' ? true : false)),
    director: z.preprocess(parseJson, DirectorSchema),
    collaborators: z.preprocess(parseJson, z.array(CollaboratorsSchema)),
  })
  .transform(async (data, ctx) => {
    try {
      const duration = await getVideoDurationInSeconds(
        data.videoPath,
        '/usr/bin/ffprobe',
      );
      //const duration = 40;
      if (duration > 90) {
        ctx.addIssue({
          code: 'custom',
          message: 'Video cannot be longer than 90 seconds.',
          path: ['videoPath'],
        });
        return z.NEVER;
      }

      return { ...data, duration };
    } catch (e) {
      console.error(e);
      ctx.addIssue({
        code: 'custom',
        message: 'Could not verify video duration.',
        path: ['videoPath'],
      });
      return z.NEVER;
    }
  });

export type MovieRequest = z.infer<typeof MovieRequestSchema>;

export type AdminMovieRequest = MovieRequest & {
  adminData: { adminText: string; adminStatus: string };
};
