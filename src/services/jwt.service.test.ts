import { describe, it, expect } from 'vitest';
import jwtService from './jwt.service.js';
import { Role } from '../types/enums/role.enum.js';

describe('jwtService', () => {
  const payload = { id: 1, roles: [Role.Admin] };

  it('génère un accessToken vérifiable', () => {
    const token = jwtService.signAccessToken(payload);
    const decoded = jwtService.verify(token);

    expect(decoded.id).toBe(1);
    expect(decoded.roles).toContain('admin');
  });

  it('lève une erreur pour un token invalide', () => {
    expect(() => jwtService.verify('token.invalide')).toThrow();
  });
});
