import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { Role } from '../types/enums/role.enum.js';
import { isAdmin } from './is-admin.js';

const mockRes = () => {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
};

const mockReq = (roles: Role[]) =>
  ({ user_roles: roles }) as unknown as Request;

describe('isAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('appelle next quand le rôle admin est présent', () => {
    const req = mockReq([Role.Admin]);
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    isAdmin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("répond 403 quand le rôle admin est absent", () => {
    const req = mockReq([Role.Jury]);
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    isAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith({ message: 'Must be an admin' });
    expect(next).not.toHaveBeenCalled();
  });
});
