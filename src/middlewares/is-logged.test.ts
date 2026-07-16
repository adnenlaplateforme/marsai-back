import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { Role } from '../types/enums/role.enum.js';

vi.mock('../services/jwt.service.js', () => ({
  default: { verify: vi.fn() },
}));

import { isLogged } from './is-logged.js';
import jwtService from '../services/jwt.service.js';

const mockRes = () => {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
};

const mockReq = (cookies: Record<string, unknown> = {}) =>
  ({ cookies }) as unknown as Request;

describe('isLogged', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("répond 401 'Token missing' quand aucun accessToken n'est présent", () => {
    const req = mockReq({});
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    isLogged(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith({ message: 'Token missing' });
    expect(next).not.toHaveBeenCalled();
    expect(jwtService.verify).not.toHaveBeenCalled();
  });

  it('injecte user_id/user_roles et appelle next quand le token est valide', () => {
    vi.mocked(jwtService.verify).mockReturnValue({
      id: 42,
      roles: [Role.Admin],
    });
    const req = mockReq({ accessToken: 'valid-token' });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    isLogged(req, res, next);

    expect(jwtService.verify).toHaveBeenCalledWith('valid-token');
    expect(req.user_id).toBe(42);
    expect(req.user_roles).toEqual([Role.Admin]);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("répond 401 'Invalid token' quand la vérification échoue", () => {
    vi.mocked(jwtService.verify).mockImplementation(() => {
      throw new Error('jwt malformed');
    });
    const req = mockReq({ accessToken: 'bad-token' });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    isLogged(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith({ message: 'Invalid token' });
    expect(next).not.toHaveBeenCalled();
  });
});
