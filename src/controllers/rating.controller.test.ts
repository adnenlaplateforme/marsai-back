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

/**
 * Confie un film à un juré.
 *
 * Depuis le filtre du lot, `/movies/to-rate` ne sert que les films attribués :
 * tout test qui en attend une liste non vide doit passer par ici. Sans cela il
 * passerait au vert en n'exerçant plus que le lot vide.
 */
const assign = async (userId: number, movieId: number): Promise<void> => {
  await db.execute(
    'INSERT INTO jury_assignment (user_id, movie_id) VALUES (?, ?)',
    [userId, movieId],
  );
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

/**
 * Le détail nominatif des votes : plus sensible que la moyenne, qui au moins
 * agrège. La route n'avait aucun middleware — elle servait à un visiteur
 * anonyme la note et le commentaire de chaque juré, en pleine délibération.
 */
describe('GET /movies/:id/ratings', () => {
  it('refuse un visiteur anonyme', async () => {
    const movie = await createAcceptedMovie();

    const res = await request(app).get(`/movies/${movie.id}/ratings`);

    expect(res.status).toBe(401);
  });

  // Un juré non plus : voir les notes des autres pendant qu'il pose les siennes
  // est exactement ce que `/ratings/average` lui interdit déjà.
  it('refuse un juré', async () => {
    const movie = await createAcceptedMovie();

    const res = await request(app)
      .get(`/movies/${movie.id}/ratings`)
      .set('Cookie', juryCookie);

    expect(res.status).toBe(403);
  });

  it("répond 404 quand le film n'existe pas", async () => {
    const res = await request(app)
      .get('/movies/999999/ratings')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ message: 'Movie not found' });
  });

  it('refuse un id de film non numérique', async () => {
    const res = await request(app)
      .get('/movies/abc/ratings')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Invalid movie id' });
  });

  it("sert à l'admin les notes de tous les jurés", async () => {
    const first = await createUser({
      email: 'v1@test.com',
      roles: [Role.Jury],
    });
    const second = await createUser({
      email: 'v2@test.com',
      roles: [Role.Jury],
    });
    const movie = await createAcceptedMovie();
    await ratingModel.create(first.id, movie.id, 8, 'solide');
    await ratingModel.create(second.id, movie.id, 5);

    const res = await request(app)
      .get(`/movies/${movie.id}/ratings`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ user_id: first.id, note: 8 }),
        expect.objectContaining({ user_id: second.id, note: 5 }),
      ]),
    );
  });

  /**
   * Aucun filtre de statut ici, contrairement aux listes du jury : l'admin
   * dépouille, il doit voir les votes posés même si le film a changé de statut
   * depuis — c'est la même règle que pour le classement.
   */
  it('sert les notes quel que soit le statut du film', async () => {
    const jury = await createUser({ email: 'v3@test.com', roles: [Role.Jury] });
    const movie = await createMovie({ status: 'rejected' });
    await ratingModel.create(jury.id, movie.id, 3);

    const res = await request(app)
      .get(`/movies/${movie.id}/ratings`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
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

  /**
   * Répondait 404 « Rating not found » sur le parcours le plus courant de
   * l'app — un juré ouvrant un film qu'il n'a pas encore noté. Le front
   * ignorait déjà la réponse en silence et affichait un formulaire vierge,
   * mais chaque ouverture écrivait une exception dans la console du serveur.
   * L'absence de note est une réponse, pas une erreur : 200 et un corps nul.
   */
  it("répond 200 avec un corps nul quand le juré n'a pas encore noté le film", async () => {
    const { cookie } = await createJury('pas-encore@test.com');
    const movie = await createAcceptedMovie();

    const res = await request(app)
      .get(`/movies/${movie.id}/ratings/me`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
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

    // Le corps nul est ce qui prouve l'isolation : la route filtre sur le juré
    // courant, la note de l'autre ne fuite pas dans la réponse.
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  /**
   * Le film reste lisible sur `/movies/:id`, qui est public : le refus porte
   * sur le périmètre du jury, pas sur l'existence du film. D'où 403 et non 404.
   */
  it.each(['pending_review', 'pending_change', 'rejected'] as const)(
    'refuse un film au statut %s',
    async (status) => {
      const { user, cookie } = await createJury(`hors-${status}@test.com`);
      const movie = await createMovie({ slug: `film-${status}`, status });
      await ratingModel.create(user.id, movie.id, 6);

      const res = await request(app)
        .get(`/movies/${movie.id}/ratings/me`)
        .set('Cookie', cookie);

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ message: 'Movie not visible to jury' });
    },
  );

  /**
   * Le pendant du garde de notation : le vote est clos sur ces deux statuts,
   * mais le juré doit pouvoir relire la note qu'il a posée avant la décision.
   * C'est ce qui rend la liste « Notés » cliquable de bout en bout.
   */
  it.each(['selected', 'winner'] as const)(
    'sert encore la note du juré sur un film promu en %s',
    async (status) => {
      const { user, cookie } = await createJury(`relit-${status}@test.com`);
      const movie = await createAcceptedMovie({ slug: `film-${status}` });
      await ratingModel.create(user.id, movie.id, 9, 'inoubliable');

      await db.execute('UPDATE movie SET status = ? WHERE id = ?', [
        status,
        movie.id,
      ]);

      const res = await request(app)
        .get(`/movies/${movie.id}/ratings/me`)
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ note: 9, comment: 'inoubliable' });
    },
  );
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

  it('enregistre la note du juré sur un film accepté de son lot', async () => {
    const { user, cookie } = await createJury('votant@test.com');
    const movie = await createAcceptedMovie();
    await assign(user.id, movie.id);

    const res = await rate(movie.id, cookie);

    expect(res.status).toBe(201);
    const stored = await ratingModel.getByMovieIdAndUserId(user.id, movie.id);
    expect(stored).toMatchObject({ note: 7 });
  });

  /**
   * Le pendant du filtre de `/movies/to-rate` : la file ne propose plus le film,
   * la route de notation doit le refuser aussi. Elle prend son id dans l'URL,
   * elle ne peut pas se reposer sur la liste dont il est censé sortir.
   */
  it("refuse de noter un film qui n'est pas dans le lot du juré", async () => {
    const { user, cookie } = await createJury('hors-lot@test.com');
    const movie = await createAcceptedMovie();

    const res = await rate(movie.id, cookie);

    expect(res.status).toBe(403);
    expect(await ratingModel.getByMovieIdAndUserId(user.id, movie.id)).toBe(
      null,
    );
  });

  it('refuse de noter un film confié à un autre juré', async () => {
    const { user, cookie } = await createJury('curieux@test.com');
    const other = await createUser({
      email: 'titulaire@test.com',
      roles: [Role.Jury],
    });
    const movie = await createAcceptedMovie();
    await assign(other.id, movie.id);

    const res = await rate(movie.id, cookie);

    expect(res.status).toBe(403);
    expect(await ratingModel.getByMovieIdAndUserId(user.id, movie.id)).toBe(
      null,
    );
  });

  /**
   * Une note posée hors lot — avant le déploiement du filtre, ou avant que
   * l'admin ne retire le film du lot — devient figée, pas rouvrable. Elle reste
   * en base et lisible : le lot borne l'écriture, pas la lecture.
   */
  it('refuse de corriger une note déjà posée hors du lot', async () => {
    const { user, cookie } = await createJury('repentant@test.com');
    const movie = await createAcceptedMovie();
    await ratingModel.create(user.id, movie.id, 3, 'première impression');

    const res = await rate(movie.id, cookie);

    expect(res.status).toBe(403);
    expect(
      await ratingModel.getByMovieIdAndUserId(user.id, movie.id),
    ).toMatchObject({ note: 3, comment: 'première impression' });
  });

  it('laisse le juré corriger une note posée dans son lot', async () => {
    const { user, cookie } = await createJury('correcteur@test.com');
    const movie = await createAcceptedMovie();
    await assign(user.id, movie.id);
    await ratingModel.create(user.id, movie.id, 3);

    const res = await rate(movie.id, cookie);

    expect(res.status).toBe(201);
    expect(
      await ratingModel.getByMovieIdAndUserId(user.id, movie.id),
    ).toMatchObject({ note: 7 });
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
    'winner',
  ] as const)('refuse de noter un film au statut %s', async (status) => {
    const { user, cookie } = await createJury(`${status}@test.com`);
    const movie = await createMovie({ slug: `film-${status}`, status });
    // Dans le lot : c'est bien le statut qui refuse, pas l'attribution.
    await assign(user.id, movie.id);

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
   * Les décisions de l'admin ne rétrécissent pas l'historique du juré : un film
   * qu'il a noté puis que l'admin promeut reste dans sa liste, avec sa note.
   * Seul le vote se ferme — c'est `POST /movies/:id/ratings` qui le dit.
   */
  it.each(['selected', 'winner'] as const)(
    "garde un film noté que l'admin a promu en %s",
    async (status) => {
      const { user, cookie } = await createJury(`promu-${status}@test.com`);
      const movie = await createAcceptedMovie({ slug: `film-${status}` });
      await ratingModel.create(user.id, movie.id, 9);

      await db.execute('UPDATE movie SET status = ? WHERE id = ?', [
        status,
        movie.id,
      ]);

      const res = await request(app).get('/movies/rated').set('Cookie', cookie);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ id: movie.id, note: 9, status });
    },
  );

  it.each(['pending_change', 'rejected'] as const)(
    'retire un film noté repassé en %s',
    async (status) => {
      const { user, cookie } = await createJury(`sorti-${status}@test.com`);
      const movie = await createAcceptedMovie({ slug: `film-${status}` });
      await ratingModel.create(user.id, movie.id, 9);

      await db.execute('UPDATE movie SET status = ? WHERE id = ?', [
        status,
        movie.id,
      ]);

      const res = await request(app).get('/movies/rated').set('Cookie', cookie);

      expect(res.body).toEqual([]);
      // La note reste en base : c'est la liste qui se ferme, pas la note.
      expect(
        await ratingModel.getByMovieIdAndUserId(user.id, movie.id),
      ).toMatchObject({ note: 9 });
    },
  );
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
    await assign(user.id, done.id);
    await assign(user.id, todo.id);
    await ratingModel.create(user.id, done.id, 5);

    const res = await request(app).get('/movies/to-rate').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.map((m: { id: number }) => m.id)).toEqual([todo.id]);
  });

  it('compte encore un film que seul un autre juré a noté : chacun doit poser sa propre note', async () => {
    const { user, cookie } = await createJury('independant@test.com');
    const other = await createUser({
      email: 'collegue@test.com',
      roles: [Role.Jury],
    });
    const movie = await createAcceptedMovie();
    await assign(user.id, movie.id);
    await assign(other.id, movie.id);
    await ratingModel.create(other.id, movie.id, 8);

    const res = await request(app).get('/movies/to-rate').set('Cookie', cookie);

    expect(res.body.map((m: { id: number }) => m.id)).toEqual([movie.id]);
  });

  it('répond une liste vide quand le juré a tout noté', async () => {
    const { user, cookie } = await createJury('assidu@test.com');
    const movie = await createAcceptedMovie();
    await assign(user.id, movie.id);
    await ratingModel.create(user.id, movie.id, 4);

    const res = await request(app).get('/movies/to-rate').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  /**
   * Le cœur de la règle vu du juré : sa file de visionnage ne contient que ce
   * que l'admin a accepté. `selected` et `winner` en sortent aussi — le vote y
   * est clos, un film sur lequel on ne peut plus voter n'a rien à faire dans
   * une file à noter. Ils restent en revanche dans la liste « Notés ».
   */
  it('ignore les films que l’admin n’a pas acceptés', async () => {
    const { user, cookie } = await createJury('perimetre@test.com');
    const visible = await createAcceptedMovie({ slug: 'film-accepte' });
    const others = [
      await createMovie({ slug: 'film-en-attente', status: 'pending_review' }),
      await createMovie({ slug: 'film-a-corriger', status: 'pending_change' }),
      await createMovie({ slug: 'film-refuse', status: 'rejected' }),
      await createMovie({ slug: 'film-selectionne', status: 'selected' }),
      await createMovie({ slug: 'film-laureat', status: 'winner' }),
    ];

    // Tous dans le lot, y compris ceux qui doivent en sortir : c'est bien le
    // statut qu'on teste ici, pas l'attribution.
    await assign(user.id, visible.id);
    for (const movie of others) await assign(user.id, movie.id);

    const res = await request(app).get('/movies/to-rate').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.map((m: { id: number }) => m.id)).toEqual([visible.id]);
  });

  /**
   * Le filtre du lot vu de la route. Le SQL est couvert par rating.model.test ;
   * ce qui se joue ici est qu'aucune couche intermédiaire ne le contourne.
   */
  it('ne propose que les films du lot du juré', async () => {
    const { user, cookie } = await createJury('lot@test.com');
    const mien = await createAcceptedMovie({ slug: 'film-de-mon-lot' });
    await createAcceptedMovie({ slug: 'film-hors-de-mon-lot' });

    await assign(user.id, mien.id);

    const res = await request(app).get('/movies/to-rate').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.map((m: { id: number }) => m.id)).toEqual([mien.id]);
  });

  it("répond une liste vide au juré à qui rien n'a été attribué", async () => {
    const { cookie } = await createJury('sans-lot@test.com');
    await createAcceptedMovie({ slug: 'film-non-attribue' });

    const res = await request(app).get('/movies/to-rate').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
