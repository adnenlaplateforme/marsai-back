import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { errorHandler } from './error-handler.js';
import AppError from '../helpers/AppError.js';

const mockRes = () => {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const req = {} as Request;
const next = vi.fn() as NextFunction;

describe('errorHandler', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('utilise le statut/message/détails d\'une AppError', () => {
    const res = mockRes();
    const appError = new AppError(404, 'Not found', { field: 'id' });

    errorHandler(appError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Not found',
      error: { field: 'id' },
      stack: undefined,
    });
  });

  it('renvoie 500 générique pour une erreur inconnue (hors dev)', () => {
    process.env.NODE_ENV = 'production';
    const res = mockRes();

    errorHandler(new Error('boom'), req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Internal server error',
      error: undefined,
      stack: undefined,
    });
  });

  it("expose le message et la stack en environnement de développement", () => {
    process.env.NODE_ENV = 'development';
    const res = mockRes();
    const error = new Error('détail interne');

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    const payload = vi.mocked(res.json).mock.calls[0]?.[0] as {
      message: string;
      stack: string;
    };
    expect(payload.message).toBe('détail interne');
    expect(payload.stack).toBe(error.stack);
  });
});
