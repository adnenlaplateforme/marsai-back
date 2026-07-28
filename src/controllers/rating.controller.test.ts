import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { resetDatabase } from '../helpers/resetDatabase.js';
import {
  authCookie,
  createMovie,
  createUser,
} from '../helpers/test-factories.js';
import ratingModel from '../models/rating.model.js';
import { Role } from '../types/enums/role.enum.js';

/**
 * La route ne consulte jamais la table `user` : isLogged et isAdmin se
 * contentent de lire le JWT. Un cookie forgé suffit donc pour l'appelant.
 * Les jurés qui posent les notes, eux, doivent exister en base : `rating`
 * porte une clé étrangère vers `user`.
 */
const adminCookie = authCookie({ id: 1, roles: [Role.Admin] });
const juryCookie = authCookie({ id: 2, roles: [Role.Jury] });

beforeEach(async () => {
  await resetDatabase();
});

describe('GET /movies/ratings/average', () => {
  it('refuse un visiteur anonyme', async () => {
    const res = await request(app).get('/movies/ratings/average');

    expect(res.status).toBe(401);
  });

  it('refuse un juré : le palmarès ne se lit pas pendant la délibération', async () => {
    const res = await request(app)
      .get('/movies/ratings/average')
      .set('Cookie', juryCookie);

    expect(res.status).toBe(403);
  });

  it("classe les films par moyenne décroissante pour l'admin", async () => {
    const first = await createUser({
      email: 'j1@test.com',
      roles: [Role.Jury],
    });
    const second = await createUser({
      email: 'j2@test.com',
      roles: [Role.Jury],
    });
    const favori = await createMovie({
      slug: 'film-favori',
      originalTitle: 'Le Favori',
      director: { firstname: 'Agnès', lastname: 'Varda' },
    });
    const outsider = await createMovie({
      slug: 'film-outsider',
      originalTitle: "L'Outsider",
    });

    await ratingModel.create(first.id, favori.id, 8);
    await ratingModel.create(second.id, favori.id, 9);
    await ratingModel.create(first.id, outsider.id, 5);

    const res = await request(app)
      .get('/movies/ratings/average')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({
      id: favori.id,
      original_title: 'Le Favori',
      average: 8.5,
      votes: 2,
      director: { firstname: 'Agnès', lastname: 'Varda' },
    });
    expect(res.body[1]).toMatchObject({
      id: outsider.id,
      average: 5,
      votes: 1,
    });
  });

  it("garde les films qu'aucun juré n'a notés, en fin de classement", async () => {
    const jury = await createUser({ email: 'j3@test.com', roles: [Role.Jury] });
    const noted = await createMovie({ slug: 'film-note' });
    const untouched = await createMovie({ slug: 'film-jamais-note' });

    await ratingModel.create(jury.id, noted.id, 4);

    const res = await request(app)
      .get('/movies/ratings/average')
      .set('Cookie', adminCookie);

    expect(res.body.map((m: { id: number }) => m.id)).toEqual([
      noted.id,
      untouched.id,
    ]);
    expect(res.body[1]).toMatchObject({ average: null, votes: 0 });
  });

  it("répond une liste vide quand aucun film n'a été soumis", async () => {
    const res = await request(app)
      .get('/movies/ratings/average')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
