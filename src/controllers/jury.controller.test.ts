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

/**
 * La portée de la suppression (les cascades sur `rating` et `jury_assignment`)
 * est couverte dans jury.model.test.ts, contre la vraie base. Ce fichier ne
 * vérifie que la garde et les codes de retour.
 */
describe('DELETE /juries/:id', () => {
  it('refuse un visiteur anonyme', async () => {
    const res = await request(app).delete('/juries/1');

    expect(res.status).toBe(401);
  });

  /**
   * La garde la plus importante du lot : un juré qui pourrait supprimer ses
   * pairs effacerait leurs notes et déciderait seul du classement.
   */
  it('refuse un juré', async () => {
    const res = await request(app)
      .delete('/juries/1')
      .set('Cookie', juryCookie);

    expect(res.status).toBe(403);
  });

  it("supprime le juré à la demande de l'admin", async () => {
    const jure = await createUser({
      email: 'a-virer@test.com',
      roles: [Role.Jury],
    });

    const res = await request(app)
      .delete(`/juries/${jure.id}`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(204);

    const apres = await request(app).get('/juries').set('Cookie', adminCookie);
    expect(apres.body).toEqual([]);
  });

  /**
   * Sans ce 404, l'admin qui se trompe d'identifiant reçoit un succès et croit
   * avoir retiré quelqu'un — le même raisonnement que le 404 de `unassign`.
   */
  it('renvoie 404 sur un juré inconnu', async () => {
    const res = await request(app)
      .delete('/juries/999999')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(404);
  });

  /**
   * Un id d'admin ne doit pas être un chemin vers la suppression d'un
   * administrateur : le modèle filtre sur le rôle, la route répond donc comme
   * pour un inconnu.
   */
  it('renvoie 404 sur un utilisateur qui n’est pas juré', async () => {
    const admin = await createUser({
      email: 'autre-admin@test.com',
      roles: [Role.Admin],
    });

    const res = await request(app)
      .delete(`/juries/${admin.id}`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(404);
  });

  it('refuse un identifiant malformé', async () => {
    const res = await request(app)
      .delete('/juries/abc')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(400);
  });
});
