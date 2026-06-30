import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodError, ZodType } from 'zod';
import { removeUploads } from '../helpers/remove-uploads.js';

export const validate =
  (schema: ZodType): RequestHandler =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dataToValidate: Record<string, unknown> = {
        ...(req.body as Record<string, unknown>),
      };
      if (req.uploadedFiles?.video)
        dataToValidate.videoPath = req.uploadedFiles.video;
      if (req.uploadedFiles?.coverImage)
        dataToValidate.coverPath = req.uploadedFiles.coverImage;
      const body = req.body as Record<string, unknown>;
      dataToValidate.stillsUrls = [
        req.uploadedFiles?.stillImageA ?? (body.existingStillA || undefined),
        req.uploadedFiles?.stillImageB ?? (body.existingStillB || undefined),
        req.uploadedFiles?.stillImageC ?? (body.existingStillC || undefined),
      ].filter(Boolean);
      req.body = await schema.parseAsync(dataToValidate);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        await removeUploads(req);
        return res.status(400).json({
          message: 'Validation failed',
          errors: error.issues,
        });
      }
      next(error);
    }
  };
