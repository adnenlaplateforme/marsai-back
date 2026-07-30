import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import db from '../database/connection.js';
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

/**
 * Un film ouvert au jury.
 *
 * La factory partagée crée un film `pending_review` — l'état d'une soumission
 * que l'admin n'a pas encore tranchée. Les routes du jury ne servent que les
 * films acceptés : tout test qui attend une note ou une liste non vide doit
 * donc passer par ici.
 */
const createAcceptedMovie = (
  options: Parameters<typeof createMovie>[0] = {},
): ReturnType<typeof createMovie> =>
  createMovie({ ...options, status: 'accepted' });

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
    const movie = await createAcceptedMovie();

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
    const movie = await createAcceptedMovie();
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
    const movie = await createAcceptedMovie();
    await ratingModel.create(other.id, movie.id, 10, 'chef-d’œuvre');

    const res = await request(app)
      .get(`/movies/${movie.id}/ratings/me`)
      .set('Cookie', cookie);

    expect(res.status).toBe(404);
  });

  /**
   * Le film reste lisible sur `/movies/:id`, qui est public : le refus porte
   * sur la délibération, pas sur l'existence du film. D'où 403 et non 404.
   */
  it("refuse un film que l'admin n'a pas accepté", async () => {
    const { user, cookie } = await createJury('hors-perimetre@test.com');
    const movie = await createMovie({ status: 'pending_review' });
    await ratingModel.create(user.id, movie.id, 6);

    const res = await request(app)
      .get(`/movies/${movie.id}/ratings/me`)
      .set('Cookie', cookie);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      message: 'Movie not open to jury rating',
    });
  });
});

describe('POST /movies/:id/ratings', () => {
  const rate = (id: number, cookie?: string) => {
    const req = request(app).post(`/movies/${id}/ratings`).send({ note: 7 });
    return cookie ? req.set('Cookie', cookie) : req;
  };

  it('refuse un visiteur anonyme', async () => {
    const movie = await createAcceptedMovie();

    expect((await rate(movie.id)).status).toBe(401);
  });

  it('refuse un admin : il ne délibère pas', async () => {
    const movie = await createAcceptedMovie();

    expect((await rate(movie.id, adminCookie)).status).toBe(403);
  });

  it("répond 404 quand le film n'existe pas", async () => {
    const { cookie } = await createJury('fantome@test.com');

    expect((await rate(999999, cookie)).status).toBe(404);
  });

  it('enregistre la note du juré sur un film accepté', async () => {
    const { user, cookie } = await createJury('votant@test.com');
    const movie = await createAcceptedMovie();

    const res = await rate(movie.id, cookie);

    expect(res.status).toBe(201);
    const stored = await ratingModel.getByMovieIdAndUserId(user.id, movie.id);
    expect(stored).toMatchObject({ note: 7 });
  });

  /**
   * Le garde ne peut pas vivre dans la seule requête des listes : l'id arrive
   * par l'URL, un juré peut le forger sans jamais passer par une liste.
   */
  it.each([
    'pending_review',
    'pending_change',
    'rejected',
    'selected',
  ] as const)('refuse de noter un film au statut %s', async (status) => {
    const { user, cookie } = await createJury(`${status}@test.com`);
    const movie = await createMovie({ slug: `film-${status}`, status });

    const res = await rate(movie.id, cookie);

    expect(res.status).toBe(403);
    expect(await ratingModel.getByMovieIdAndUserId(user.id, movie.id)).toBe(
      null,
    );
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
    const movie = await createAcceptedMovie({
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
    const movie = await createAcceptedMovie();
    await ratingModel.create(other.id, movie.id, 6);

    const res = await request(app).get('/movies/rated').set('Cookie', cookie);

    expect(res.body).toEqual([]);
  });

  /**
   * Conséquence assumée du filtre : si l'admin fait sortir un film du statut
   * `accepted` après la délibération, il quitte la liste des films notés du
   * juré. La note reste en base et le classement admin la compte toujours.
   */
  it("retire un film noté que l'admin a fait passer en sélection", async () => {
    const { user, cookie } = await createJury('selection@test.com');
    const movie = await createAcceptedMovie();
    await ratingModel.create(user.id, movie.id, 9);

    await db.execute('UPDATE movie SET status = ? WHERE id = ?', [
      'selected',
      movie.id,
    ]);

    const res = await request(app).get('/movies/rated').set('Cookie', cookie);

    expect(res.body).toEqual([]);
    expect(
      await ratingModel.getByMovieIdAndUserId(user.id, movie.id),
    ).toMatchObject({ note: 9 });
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
    const done = await createAcceptedMovie({
      slug: 'film-fait',
      originalTitle: 'Fait',
    });
    const todo = await createAcceptedMovie({
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
    const movie = await createAcceptedMovie();
    await ratingModel.create(other.id, movie.id, 8);

    const res = await request(app).get('/movies/to-rate').set('Cookie', cookie);

    expect(res.body.map((m: { id: number }) => m.id)).toEqual([movie.id]);
  });

  it('répond une liste vide quand le juré a tout noté', async () => {
    const { user, cookie } = await createJury('assidu@test.com');
    const movie = await createAcceptedMovie();
    await ratingModel.create(user.id, movie.id, 4);

    const res = await request(app).get('/movies/to-rate').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  /**
   * Le cœur de la règle vu du juré : sa file de visionnage ne contient que ce
   * que l'admin a accepté. `selected` et `winner` en sortent aussi — ce sont
   * des décisions postérieures à la délibération.
   */
  it('ignore les films que l’admin n’a pas acceptés', async () => {
    const { cookie } = await createJury('perimetre@test.com');
    const visible = await createAcceptedMovie({ slug: 'film-accepte' });
    await createMovie({ slug: 'film-en-attente', status: 'pending_review' });
    await createMovie({ slug: 'film-a-corriger', status: 'pending_change' });
    await createMovie({ slug: 'film-refuse', status: 'rejected' });
    await createMovie({ slug: 'film-selectionne', status: 'selected' });
    await createMovie({ slug: 'film-laureat', status: 'winner' });

    const res = await request(app).get('/movies/to-rate').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.map((m: { id: number }) => m.id)).toEqual([visible.id]);
  });
});
