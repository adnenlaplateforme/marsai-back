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
 * Ces routes ne consultent jamais la table `user` : isLogged, isAdmin et isJury
 * se contentent de lire le JWT. Un cookie forgé suffit donc pour l'appelant.
 * Les jurés qui posent des notes, eux, doivent exister en base : `rating` porte
 * une clé étrangère vers `user`.
 */
const adminCookie = authCookie({ id: 1, roles: [Role.Admin] });
const juryCookie = authCookie({ id: 2, roles: [Role.Jury] });

/**
 * Un juré réel et le cookie qui le désigne. Indispensable dès qu'un test pose
 * une note : le cookie doit porter l'id de la ligne `user`, sans quoi l'INSERT
 * dans `rating` viole la clé étrangère.
 */
const createJury = async (email: string) => {
  const user = await createUser({ email, roles: [Role.Jury] });
  return { user, cookie: authCookie({ id: user.id, roles: [Role.Jury] }) };
};

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

describe('GET /movies/:id/ratings/me', () => {
  it('refuse un visiteur anonyme', async () => {
    const movie = await createMovie();

    const res = await request(app).get(`/movies/${movie.id}/ratings/me`);

    expect(res.status).toBe(401);
  });

  it("refuse un admin : la route sert la note du juré courant, qu'un admin n'a pas", async () => {
    const movie = await createMovie();

    const res = await request(app)
      .get(`/movies/${movie.id}/ratings/me`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(403);
  });

  it("répond 404 quand le film n'existe pas", async () => {
    const res = await request(app)
      .get('/movies/999999/ratings/me')
      .set('Cookie', juryCookie);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ message: 'Movie not found' });
  });

  it("répond 404 quand le juré n'a pas encore noté le film", async () => {
    const { cookie } = await createJury('pas-encore@test.com');
    const movie = await createMovie();

    const res = await request(app)
      .get(`/movies/${movie.id}/ratings/me`)
      .set('Cookie', cookie);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ message: 'Rating not found' });
  });

  /**
   * Répondait 500 : `Number('abc')` donnait NaN, que `db.query` interpolait
   * dans le SQL. Le garde partagé le rejette désormais en 400.
   */
  it('refuse un id de film non numérique', async () => {
    const res = await request(app)
      .get('/movies/abc/ratings/me')
      .set('Cookie', juryCookie);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Invalid movie id' });
  });

  it('renvoie la note du juré courant', async () => {
    const { user, cookie } = await createJury('note@test.com');
    const movie = await createMovie();
    await ratingModel.create(user.id, movie.id, 7, 'un beau geste');

    const res = await request(app)
      .get(`/movies/${movie.id}/ratings/me`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      movie_id: movie.id,
      user_id: user.id,
      note: 7,
      comment: 'un beau geste',
    });
  });

  it("ignore la note d'un autre juré sur le même film", async () => {
    const { cookie } = await createJury('moi@test.com');
    const other = await createUser({
      email: 'autre@test.com',
      roles: [Role.Jury],
    });
    const movie = await createMovie();
    await ratingModel.create(other.id, movie.id, 10, 'chef-d’œuvre');

    const res = await request(app)
      .get(`/movies/${movie.id}/ratings/me`)
      .set('Cookie', cookie);

    expect(res.status).toBe(404);
  });
});

describe('GET /movies/rated', () => {
  it('refuse un visiteur anonyme', async () => {
    const res = await request(app).get('/movies/rated');

    expect(res.status).toBe(401);
  });

  it('refuse un admin', async () => {
    const res = await request(app)
      .get('/movies/rated')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(403);
  });

  it("répond une liste vide quand le juré n'a rien noté", async () => {
    const { cookie } = await createJury('vierge@test.com');
    await createMovie();

    const res = await request(app).get('/movies/rated').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('renvoie les films notés avec la note, le commentaire et le réalisateur', async () => {
    const { user, cookie } = await createJury('actif@test.com');
    const movie = await createMovie({
      originalTitle: 'Le Voyage',
      director: { firstname: 'Agnès', lastname: 'Varda' },
    });
    await ratingModel.create(user.id, movie.id, 9, 'bouleversant');

    const res = await request(app).get('/movies/rated').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: movie.id,
      original_title: 'Le Voyage',
      note: 9,
      comment: 'bouleversant',
      director: { firstname: 'Agnès', lastname: 'Varda' },
    });
    expect(res.body[0].rated_at).toBeTruthy();
  });

  it("n'expose pas les films notés par un autre juré", async () => {
    const { cookie } = await createJury('lecteur@test.com');
    const other = await createUser({
      email: 'voisin@test.com',
      roles: [Role.Jury],
    });
    const movie = await createMovie();
    await ratingModel.create(other.id, movie.id, 6);

    const res = await request(app).get('/movies/rated').set('Cookie', cookie);

    expect(res.body).toEqual([]);
  });
});

describe('GET /movies/to-rate', () => {
  it('refuse un visiteur anonyme', async () => {
    const res = await request(app).get('/movies/to-rate');

    expect(res.status).toBe(401);
  });

  it('refuse un admin', async () => {
    const res = await request(app)
      .get('/movies/to-rate')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(403);
  });

  it("ne renvoie que les films que le juré n'a pas notés", async () => {
    const { user, cookie } = await createJury('progression@test.com');
    const done = await createMovie({
      slug: 'film-fait',
      originalTitle: 'Fait',
    });
    const todo = await createMovie({
      slug: 'film-a-faire',
      originalTitle: 'À faire',
    });
    await ratingModel.create(user.id, done.id, 5);

    const res = await request(app).get('/movies/to-rate').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.map((m: { id: number }) => m.id)).toEqual([todo.id]);
  });

  it('compte encore un film que seul un autre juré a noté : chacun doit poser sa propre note', async () => {
    const { cookie } = await createJury('independant@test.com');
    const other = await createUser({
      email: 'collegue@test.com',
      roles: [Role.Jury],
    });
    const movie = await createMovie();
    await ratingModel.create(other.id, movie.id, 8);

    const res = await request(app).get('/movies/to-rate').set('Cookie', cookie);

    expect(res.body.map((m: { id: number }) => m.id)).toEqual([movie.id]);
  });

  it('répond une liste vide quand le juré a tout noté', async () => {
    const { user, cookie } = await createJury('assidu@test.com');
    const movie = await createMovie();
    await ratingModel.create(user.id, movie.id, 4);

    const res = await request(app).get('/movies/to-rate').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
