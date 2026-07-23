import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import { resetDatabase } from '../helpers/resetDatabase.js';
import { authCookie, createUser } from '../helpers/test-factories.js';
import jwtService from '../services/jwt.service.js';
import { Role } from '../types/enums/role.enum.js';

/** Récupère un cookie précis dans l'en-tête Set-Cookie de la réponse. */
const getCookie = (res: request.Response, name: string): string | undefined => {
  const cookies = res.headers['set-cookie'] as unknown as string[] | undefined;
  return cookies?.find((cookie) => cookie.startsWith(`${name}=`));
};

/** Extrait la valeur d'un cookie, l'en-tête ayant la forme `nom=valeur; Path=...`. */
const getCookieValue = (res: request.Response, name: string): string =>
  getCookie(res, name)?.split(';')[0]?.replace(`${name}=`, '') ?? '';

/** Un cookie purgé par clearCookie est renvoyé vide avec une date passée. */
const isCleared = (cookie: string | undefined): boolean =>
  cookie !== undefined && cookie.includes('Expires=Thu, 01 Jan 1970');

beforeEach(async () => {
  await resetDatabase();
});

describe('POST /auth/login', () => {
  it('renvoie 200, l’utilisateur sans password, et pose les deux cookies', async () => {
    const user = await createUser({ email: 'admin@test.com' });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: user.password });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: user.id, email: user.email });
    expect(res.body).not.toHaveProperty('password');

    expect(getCookie(res, 'accessToken')).toContain('HttpOnly');

    const refreshToken = getCookie(res, 'refreshToken');
    expect(refreshToken).toContain('HttpOnly');
    // Le refresh token n'est envoyé qu'à la route qui le consomme.
    expect(refreshToken).toContain('Path=/auth/refresh-token');
  });

  it('renvoie un accessToken qui porte bien l’id et les rôles', async () => {
    const user = await createUser({
      email: 'jury@test.com',
      roles: [Role.Jury],
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: user.password });

    const payload = jwtService.verify(getCookieValue(res, 'accessToken'));

    expect(payload.id).toBe(user.id);
    expect(payload.roles).toEqual([Role.Jury]);
  });

  it('renvoie 401 quand le mot de passe est incorrect', async () => {
    const user = await createUser({ email: 'admin@test.com' });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: 'mauvais-mot-de-passe' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Invalid credentials' });
    expect(getCookie(res, 'accessToken')).toBeUndefined();
  });

  it("renvoie 401 quand l'utilisateur n'existe pas", async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'inconnu@test.com', password: 'password123' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Invalid credentials' });
  });

  it('renvoie 400 quand le body ne passe pas la validation zod', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'pas-un-email', password: '' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Validation failed' });
  });
});

describe('GET /auth/me', () => {
  it("renvoie l'utilisateur courant quand le cookie est valide", async () => {
    const user = await createUser({ email: 'me@test.com' });

    const res = await request(app)
      .get('/auth/me')
      .set('Cookie', authCookie(user));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: user.id, email: user.email });
    expect(res.body).not.toHaveProperty('password');
  });

  it('renvoie 401 quand le cookie est absent', async () => {
    const res = await request(app).get('/auth/me');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Token missing' });
  });

  it("renvoie 401 quand le token n'est pas un JWT valide", async () => {
    const res = await request(app)
      .get('/auth/me')
      .set('Cookie', 'accessToken=pas-un-jwt');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Invalid token' });
  });

  it('renvoie 401 quand le token est signé avec un mauvais secret', async () => {
    const token = jwt.sign({ id: 1, roles: [Role.Admin] }, 'mauvais-secret');

    const res = await request(app)
      .get('/auth/me')
      .set('Cookie', `accessToken=${token}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Invalid token' });
  });

  it("renvoie 404 quand le token est valide mais l'utilisateur n'existe plus", async () => {
    const res = await request(app)
      .get('/auth/me')
      .set('Cookie', authCookie({ id: 999999, roles: [Role.Admin] }));

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ message: 'User not found' });
  });
});

describe('POST /auth/refresh-token', () => {
  it('renvoie une nouvelle paire de tokens et repose les cookies', async () => {
    const user = await createUser({ email: 'refresh@test.com' });
    const refreshToken = jwtService.signRefreshToken({
      id: user.id,
      roles: user.roles,
    });

    const res = await request(app)
      .post('/auth/refresh-token')
      .set('Cookie', `refreshToken=${refreshToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(getCookie(res, 'accessToken')).toContain('HttpOnly');

    const payload = jwtService.verify(res.body.accessToken as string);
    expect(payload.id).toBe(user.id);
  });

  it('renvoie 400 quand le cookie refreshToken est absent', async () => {
    const res = await request(app).post('/auth/refresh-token');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Empty refresh token' });
  });

  it('renvoie 400 et purge les cookies quand le refresh token est expiré', async () => {
    const expired = jwt.sign(
      { id: 1, roles: [Role.Admin] },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' },
    );

    const res = await request(app)
      .post('/auth/refresh-token')
      .set('Cookie', `refreshToken=${expired}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Refresh token expired' });
    expect(isCleared(getCookie(res, 'accessToken'))).toBe(true);
  });
});

describe('GET /auth/logout', () => {
  it('renvoie 200 et purge les deux cookies', async () => {
    const user = await createUser({ email: 'logout@test.com' });

    const res = await request(app)
      .get('/auth/logout')
      .set('Cookie', authCookie(user));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Successfully logged out' });
    expect(isCleared(getCookie(res, 'accessToken'))).toBe(true);
    expect(isCleared(getCookie(res, 'refreshToken'))).toBe(true);
  });

  it('renvoie 401 quand la requête n’est pas authentifiée', async () => {
    const res = await request(app).get('/auth/logout');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Token missing' });
  });
});
