import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { z, type ZodType } from 'zod';
import { validateParamsAndQuery } from './validate-all.js';

const mockRes = () => {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
};

const mockReq = (query: unknown, params: unknown) =>
  ({ query, params }) as unknown as Request;

const validator = z.object({
  query: z.object({ page: z.string() }),
  params: z.object({ id: z.string() }),
});

describe('validateParamsAndQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('appelle next quand query et params sont valides', async () => {
    const req = mockReq({ page: '1' }, { id: '5' });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await validateParamsAndQuery(validator)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("répond 400 avec le message du premier problème en cas d'erreur Zod", async () => {
    const req = mockReq({}, { id: '5' });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await validateParamsAndQuery(validator)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ msg: expect.any(String) }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('répond 500 pour une erreur non-Zod', async () => {
    const brokenValidator = {
      parseAsync: vi.fn().mockRejectedValue(new Error('crash')),
    } as unknown as ZodType;
    const req = mockReq({ page: '1' }, { id: '5' });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await validateParamsAndQuery(brokenValidator)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith(
      'Error making request, contact support',
    );
    expect(next).not.toHaveBeenCalled();
  });
});
