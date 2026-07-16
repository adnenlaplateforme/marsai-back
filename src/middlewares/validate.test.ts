import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { z, type ZodType } from 'zod';

vi.mock('../helpers/remove-uploads.js', () => ({
  removeUploads: vi.fn(),
}));

import { validate } from './validate.js';
import { removeUploads } from '../helpers/remove-uploads.js';

const mockRes = () => {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const mockReq = (data: Record<string, unknown>) => data as unknown as Request;

const schema = z.object({
  title: z.string(),
  videoPath: z.string().optional(),
  coverPath: z.string().optional(),
  stillsUrls: z.array(z.string()),
});

describe('validate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('valide le body et appelle next', async () => {
    const req = mockReq({ body: { title: 'Mon film' } });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await validate(schema)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.body).toEqual({ title: 'Mon film', stillsUrls: [] });
  });

  it('injecte les fichiers uploadés (videoPath, coverPath, stills) dans les données validées', async () => {
    const req = mockReq({
      body: { title: 'Mon film' },
      uploadedFiles: {
        video: 'video.mp4',
        coverImage: 'cover.jpg',
        stillImageA: 'a.jpg',
      },
    });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await validate(schema)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.body).toEqual({
      title: 'Mon film',
      videoPath: 'video.mp4',
      coverPath: 'cover.jpg',
      stillsUrls: ['a.jpg'],
    });
  });

  it("répond 400 et nettoie les uploads en cas d'erreur de validation Zod", async () => {
    const req = mockReq({ body: { title: 123 } });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await validate(schema)(req, res, next);

    expect(removeUploads).toHaveBeenCalledWith(req);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Validation failed' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('transmet une erreur non-Zod à next', async () => {
    const boom = new Error('parse crash');
    const brokenSchema = {
      parseAsync: vi.fn().mockRejectedValue(boom),
    } as unknown as ZodType;
    const req = mockReq({ body: { title: 'Mon film' } });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await validate(brokenSchema)(req, res, next);

    expect(next).toHaveBeenCalledWith(boom);
    expect(res.status).not.toHaveBeenCalled();
    expect(removeUploads).not.toHaveBeenCalled();
  });
});
