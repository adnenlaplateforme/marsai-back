import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { resetDatabase } from '../helpers/resetDatabase.js';
import { authCookie, createUser } from '../helpers/test-factories.js';
import { Role } from '../types/enums/role.enum.js';

/**
 * La sémantique de l'agrégation est couverte dans jury.model.test.ts, contre la
 * vraie base. Ce fichier ne vérifie que ce qui vit au-dessus du modèle : la
 * garde et la forme servie au front.
 *
 * isLogged et isAdmin se contentent de lire le JWT : un cookie forgé suffit
 * pour l'appelant, sans ligne `user` correspondante.
 */
const adminCookie = authCookie({ id: 1, roles: [Role.Admin] });
const juryCookie = authCookie({ id: 2, roles: [Role.Jury] });

beforeEach(async () => {
  await resetDatabase();
});

describe('GET /juries/progress', () => {
  it('refuse un visiteur anonyme', async () => {
    const res = await request(app).get('/juries/progress');

    expect(res.status).toBe(401);
  });

  /**
   * L'avancement nomme chaque juré et porte son e-mail, comme `GET /juries`. Un
   * juré n'a pas à savoir qui délibère ni où en sont ses pairs.
   */
  it('refuse un juré', async () => {
    const res = await request(app)
      .get('/juries/progress')
      .set('Cookie', juryCookie);

    expect(res.status).toBe(403);
  });

  /**
   * Le contrat que consomme JuryManager : `rated` doit arriver en nombre — le
   * front le divise par le nombre de films pour remplir la barre —, et
   * `last_rated_at` en date sérialisable ou `null`, jamais absent.
   */
  it("sert à l'admin l'avancement de chaque juré", async () => {
    const jure = await createUser({
      email: 'jure@test.com',
      roles: [Role.Jury],
    });

    const res = await request(app)
      .get('/juries/progress')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: jure.id,
        email: 'jure@test.com',
        firstname: null,
        lastname: null,
        rated: 0,
        last_rated_at: null,
      },
    ]);
    expect(typeof res.body[0].rated).toBe('number');
  });
});
