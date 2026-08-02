// Le contrôleur d'attribution est entièrement réservé à l'admin : c'est lui qui
// décide qui note quoi. Ce fichier couvre la garde et le contrat JSON servi au
// tableau de bord ; la sémantique SQL est dans jury-assignment.model.test.ts et
// les refus métier dans le test unitaire du service.
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { resetDatabase } from '../helpers/resetDatabase.js';
import {
  authCookie,
  createMovie,
  createUser,
} from '../helpers/test-factories.js';
import juryAssignmentModel from '../models/jury-assignment.model.js';
import ratingModel from '../models/rating.model.js';
import { Role } from '../types/enums/role.enum.js';

/**
 * Ces routes ne consultent la table `user` que pour les jurés qu'elles citent :
 * isLogged et isAdmin se contentent de lire le JWT, un cookie forgé suffit donc
 * pour l'appelant.
 */
const adminCookie = authCookie({ id: 1, roles: [Role.Admin] });
const juryCookie = authCookie({ id: 2, roles: [Role.Jury] });

const createJury = (email: string) => createUser({ email, roles: [Role.Jury] });

beforeEach(async () => {
  await resetDatabase();
});

/** Les cinq routes, sous la forme attendue par supertest. */
const routes = [
  ['post', '/jury-assignments'],
  ['get', '/jury-assignments'],
  ['delete', '/jury-assignments'],
  ['post', '/jury-assignments/1/movies/1'],
  ['delete', '/jury-assignments/1/movies/1'],
] as const;

describe('garde des routes /jury-assignments', () => {
  it.each(routes)('%s %s répond 401 sans cookie', async (method, path) => {
    await request(app)[method](path).expect(401);
  });

  /**
   * Un juré ne doit pas pouvoir se composer son propre lot, ni lire celui des
   * autres : l'attribution est l'outil de l'admin.
   */
  it.each(routes)('%s %s répond 403 pour un juré', async (method, path) => {
    await request(app)[method](path).set('Cookie', juryCookie).expect(403);
  });
});

describe('POST /jury-assignments', () => {
  it('attribue les films acceptés et renvoie le récap de ce qui a été écrit', async () => {
    const alice = await createJury('alice@test.com');
    const bob = await createJury('bob@test.com');
    for (const slug of ['un', 'deux', 'trois']) {
      await createMovie({ slug, status: 'accepted' });
    }
    await createMovie({ slug: 'en-revue', status: 'pending_review' });

    const res = await request(app)
      .post('/jury-assignments')
      .set('Cookie', adminCookie)
      .expect(201);

    expect(res.body).toEqual({
      movies: 3,
      juries: 2,
      assignments: 6,
      perJury: [
        { user_id: alice.id, assigned: 3 },
        { user_id: bob.id, assigned: 3 },
      ],
    });
  });

  /**
   * L'attribution est un acte unique. Le second appel est refusé plutôt que
   * d'écraser des lots sur lesquels les jurés ont pu commencer à travailler.
   */
  it('refuse une seconde attribution en 409', async () => {
    await createJury('alice@test.com');
    await createJury('bob@test.com');
    await createMovie({ slug: 'un', status: 'accepted' });

    await request(app)
      .post('/jury-assignments')
      .set('Cookie', adminCookie)
      .expect(201);

    await request(app)
      .post('/jury-assignments')
      .set('Cookie', adminCookie)
      .expect(409);
  });

  it('refuse en 422 avec un seul juré', async () => {
    await createJury('seul@test.com');
    await createMovie({ slug: 'un', status: 'accepted' });

    await request(app)
      .post('/jury-assignments')
      .set('Cookie', adminCookie)
      .expect(422);
  });

  it('refuse en 422 sans film accepté', async () => {
    await createJury('alice@test.com');
    await createJury('bob@test.com');
    await createMovie({ slug: 'en-revue', status: 'pending_review' });

    await request(app)
      .post('/jury-assignments')
      .set('Cookie', adminCookie)
      .expect(422);
  });
});

describe('GET /jury-assignments', () => {
  it("sert l'avancement de chaque juré et le nombre de films non couverts", async () => {
    const alice = await createJury('alice@test.com');
    const bob = await createJury('bob@test.com');
    const vu = await createMovie({ slug: 'vu', status: 'accepted' });
    // Accepté mais confié à personne : c'est lui que `unassigned` doit compter.
    await createMovie({ slug: 'orphelin', status: 'accepted' });

    await juryAssignmentModel.createMany([
      { userId: alice.id, movieId: vu.id },
      { userId: bob.id, movieId: vu.id },
    ]);
    await ratingModel.create(alice.id, vu.id, 8);

    const res = await request(app)
      .get('/jury-assignments')
      .set('Cookie', adminCookie)
      .expect(200);

    expect(res.body).toEqual({
      juries: [
        { user_id: alice.id, assigned: 1, rated: 1 },
        { user_id: bob.id, assigned: 1, rated: 0 },
      ],
      unassigned: 1,
    });
  });
});

describe('DELETE /jury-assignments', () => {
  /**
   * La remise à zéro rend une nouvelle attribution possible, sans jamais
   * toucher aux notes déjà posées — elles vivent dans une autre table.
   */
  it('vide les attributions et laisse les notes intactes', async () => {
    const alice = await createJury('alice@test.com');
    const film = await createMovie({ slug: 'film', status: 'accepted' });
    await juryAssignmentModel.createMany([
      { userId: alice.id, movieId: film.id },
    ]);
    await ratingModel.create(alice.id, film.id, 7);

    await request(app)
      .delete('/jury-assignments')
      .set('Cookie', adminCookie)
      .expect(204);

    expect(await juryAssignmentModel.count()).toBe(0);
    expect(
      await ratingModel.getByMovieIdAndUserId(alice.id, film.id),
    ).not.toBeNull();
  });
});

describe('POST /jury-assignments/:juryId/movies/:movieId', () => {
  it('confie un film à un juré', async () => {
    const alice = await createJury('alice@test.com');
    const film = await createMovie({ slug: 'film', status: 'accepted' });

    await request(app)
      .post(`/jury-assignments/${alice.id}/movies/${film.id}`)
      .set('Cookie', adminCookie)
      .expect(201);

    expect(await juryAssignmentModel.count()).toBe(1);
  });

  it('refuse en 409 un film déjà dans la file du juré', async () => {
    const alice = await createJury('alice@test.com');
    const film = await createMovie({ slug: 'film', status: 'accepted' });
    const path = `/jury-assignments/${alice.id}/movies/${film.id}`;

    await request(app).post(path).set('Cookie', adminCookie).expect(201);
    await request(app).post(path).set('Cookie', adminCookie).expect(409);
  });

  /**
   * `juryModel.findById` filtre sur le rôle : l'admin n'en est pas un. Sans ce
   * contrôle, la clé étrangère accepterait l'insertion.
   */
  it("refuse en 404 un utilisateur qui n'est pas juré", async () => {
    const admin = await createUser({
      email: 'admin@test.com',
      roles: [Role.Admin],
    });
    const film = await createMovie({ slug: 'film', status: 'accepted' });

    await request(app)
      .post(`/jury-assignments/${admin.id}/movies/${film.id}`)
      .set('Cookie', adminCookie)
      .expect(404);
  });

  it('refuse en 404 un film inexistant', async () => {
    const alice = await createJury('alice@test.com');

    await request(app)
      .post(`/jury-assignments/${alice.id}/movies/999999`)
      .set('Cookie', adminCookie)
      .expect(404);
  });

  it("refuse en 422 un film qui n'est pas accepté", async () => {
    const alice = await createJury('alice@test.com');
    const film = await createMovie({ slug: 'film', status: 'pending_review' });

    await request(app)
      .post(`/jury-assignments/${alice.id}/movies/${film.id}`)
      .set('Cookie', adminCookie)
      .expect(422);
  });

  /**
   * `parseId` sur les deux paramètres : sans lui, `Number('abc')` vaut NaN,
   * interpolé tel quel par `db.query` — un 500 pour une URL malformée.
   */
  it.each([
    ['/jury-assignments/abc/movies/1'],
    ['/jury-assignments/1/movies/abc'],
  ])('refuse en 400 un identifiant non numérique (%s)', async (path) => {
    await request(app).post(path).set('Cookie', adminCookie).expect(400);
  });
});

describe('DELETE /jury-assignments/:juryId/movies/:movieId', () => {
  it('retire le film de la file du juré', async () => {
    const alice = await createJury('alice@test.com');
    const bob = await createJury('bob@test.com');
    const film = await createMovie({ slug: 'film', status: 'accepted' });
    await juryAssignmentModel.createMany([
      { userId: alice.id, movieId: film.id },
      { userId: bob.id, movieId: film.id },
    ]);

    await request(app)
      .delete(`/jury-assignments/${alice.id}/movies/${film.id}`)
      .set('Cookie', adminCookie)
      .expect(204);

    expect(await juryAssignmentModel.count()).toBe(1);
  });

  /**
   * Sans ce 404, l'admin qui se trompe de juré reçoit un succès et croit avoir
   * agi sur le bon lot.
   */
  it('refuse en 404 un film absent de la file', async () => {
    const alice = await createJury('alice@test.com');
    const film = await createMovie({ slug: 'film', status: 'accepted' });

    await request(app)
      .delete(`/jury-assignments/${alice.id}/movies/${film.id}`)
      .set('Cookie', adminCookie)
      .expect(404);
  });
});
