import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '../types/enums/role.enum.js';

vi.mock('../models/user.model.js', () => ({
  default: { findByEmail: vi.fn() },
}));
vi.mock('bcrypt', () => ({
  default: { compare: vi.fn(), hash: vi.fn() },
}));
vi.mock('./jwt.service.js', () => ({
  default: { signPair: vi.fn() },
}));

import authService from './auth.service.js';
import userModel from '../models/user.model.js';
import bcrypt from 'bcrypt';
import jwtService from './jwt.service.js';

const buildUser = () =>
  ({
    id: 1,
    email: 'user@test.com',
    password: 'hashed-password',
    roles: [Role.Admin],
    created_at: new Date('2026-01-01'),
  }) as never;

describe('authService.login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retourne null quand l'utilisateur n'existe pas", async () => {
    vi.mocked(userModel.findByEmail).mockResolvedValue(null);

    const result = await authService.login({
      email: 'unknown@test.com',
      password: 'whatever',
    });

    expect(result).toBeNull();
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('retourne null quand le mot de passe ne correspond pas', async () => {
    vi.mocked(userModel.findByEmail).mockResolvedValue(buildUser());
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const result = await authService.login({
      email: 'user@test.com',
      password: 'wrong',
    });

    expect(result).toBeNull();
    expect(jwtService.signPair).not.toHaveBeenCalled();
  });

  it('retourne user (sans password) + tokens quand les identifiants sont valides', async () => {
    vi.mocked(userModel.findByEmail).mockResolvedValue(buildUser());
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(jwtService.signPair).mockReturnValue({
      accessToken: 'access',
      refreshToken: 'refresh',
    });

    const result = await authService.login({
      email: 'user@test.com',
      password: 'good',
    });

    expect(result).toEqual({
      user: {
        id: 1,
        email: 'user@test.com',
        roles: [Role.Admin],
        created_at: new Date('2026-01-01'),
      },
      accessToken: 'access',
      refreshToken: 'refresh',
    });
    expect(result).not.toHaveProperty('user.password');
  });
});

describe('authService.hashPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hash le mot de passe avec un salt de 10 tours', async () => {
    vi.mocked(bcrypt.hash).mockResolvedValue('hashed' as never);

    const result = await authService.hashPassword('plain');

    expect(bcrypt.hash).toHaveBeenCalledWith('plain', 10);
    expect(result).toBe('hashed');
  });
});
