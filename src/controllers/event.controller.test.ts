import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { resetDatabase } from '../helpers/resetDatabase.js';
import {
  addEventTranslation,
  authCookie,
  createBooking,
  createEvent,
} from '../helpers/test-factories.js';
import { Role } from '../types/enums/role.enum.js';

/**
 * Les routes /events ne consultent jamais l'utilisateur en base : isLogged et
 * isAdmin se contentent de lire le JWT. Un cookie forgé suffit donc, ce qui
 * évite de créer un utilisateur (et de payer un hachage bcrypt) à chaque test.
 */
const adminCookie = authCookie({ id: 1, roles: [Role.Admin] });
const juryCookie = authCookie({ id: 2, roles: [Role.Jury] });

/** Corps valide au regard de CreateEventRequestSchema. */
const validBody = {
  title: 'Projection de gala',
  description: 'Une soirée de projection',
  date: '2026-09-01T20:00:00.000Z',
  publishedAt: '2026-08-01T10:00:00.000Z',
  duration: 120,
  location: 'Marseille',
  isBookable: true,
  capacity: 100,
  lang: 'FR',
};

beforeEach(async () => {
  await resetDatabase();
});

describe('POST /events', () => {
  /**
   * L'identifiant est la seule chose que l'appelant ne peut pas deviner : le
   * slug est calculé côté serveur, et rien d'autre n'identifie l'événement de
   * façon sûre. Sans lui, un client qui vient de créer un événement ne peut pas
   * enchaîner dessus — ajouter la traduction anglaise, par exemple — sans
   * relire toute la liste et parier sur le titre.
   */
  it("répond 201 avec l'identifiant du nouvel événement", async () => {
    const res = await request(app)
      .post('/events')
      .set('Cookie', adminCookie)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(Number) });

    const relu = await request(app).get(`/events/${res.body.id}`);
    expect(relu.body).toMatchObject({ title: 'Projection de gala' });
  });

  /** Le parcours du formulaire d'ajout : créer en français, compléter en anglais. */
  it('laisse compléter la traduction anglaise juste après la création', async () => {
    const cree = await request(app)
      .post('/events')
      .set('Cookie', adminCookie)
      .send(validBody);

    await request(app)
      .put(`/events/${cree.body.id}`)
      .set('Cookie', adminCookie)
      .send({ lang: 'EN', title: 'Gala screening', description: 'Evening' });

    const en = await request(app).get('/events').query({ lang: 'EN' });
    expect(en.body).toHaveLength(1);
    expect(en.body[0]).toMatchObject({ title: 'Gala screening' });
  });

  it("crée l'événement et répond 201", async () => {
    const res = await request(app)
      .post('/events')
      .set('Cookie', adminCookie)
      .send(validBody);

    expect(res.status).toBe(201);

    const list = await request(app).get('/events');
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      title: 'Projection de gala',
      description: 'Une soirée de projection',
      location: 'Marseille',
      capacity: 100,
    });
  });

  it("génère le slug à partir du titre quand il n'est pas fourni", async () => {
    await request(app)
      .post('/events')
      .set('Cookie', adminCookie)
      .send(validBody);

    const list = await request(app).get('/events');
    expect(list.body[0].slug).toBe('projection-de-gala');
  });

  it('suffixe le slug quand celui-ci est déjà pris', async () => {
    await createEvent({ slug: 'projection-de-gala', title: 'Déjà là' });

    await request(app)
      .post('/events')
      .set('Cookie', adminCookie)
      .send(validBody);

    const list = await request(app).get('/events');
    const cree = list.body.find(
      (e: { title: string }) => e.title === 'Projection de gala',
    );
    expect(cree.slug).toBe('projection-de-gala-1');
  });

  it("renvoie 401 quand la requête n'est pas authentifiée", async () => {
    const res = await request(app).post('/events').send(validBody);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Token missing' });
  });

  it("renvoie 403 quand l'utilisateur n'est pas administrateur", async () => {
    const res = await request(app)
      .post('/events')
      .set('Cookie', juryCookie)
      .send(validBody);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Must be an admin' });
  });

  it('renvoie 400 quand le corps ne passe pas la validation zod', async () => {
    const res = await request(app)
      .post('/events')
      .set('Cookie', adminCookie)
      .send({ ...validBody, title: '', capacity: -5 });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Validation failed' });
  });

  it("valide le corps avant de contrôler l'authentification", async () => {
    // validate() est déclaré avant isLogged dans event.route.ts : une requête
    // anonyme au corps invalide reçoit donc 400, et non 401.
    const res = await request(app).post('/events').send({ title: '' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Validation failed' });
  });

  it("n'enregistre rien quand la création est refusée", async () => {
    await request(app)
      .post('/events')
      .set('Cookie', juryCookie)
      .send(validBody);

    const list = await request(app).get('/events');
    expect(list.body).toEqual([]);
  });
});

describe('GET /events', () => {
  it('est accessible sans authentification et renvoie les places restantes', async () => {
    const event = await createEvent({ capacity: 10 });
    await createBooking(event.id);
    await createBooking(event.id, { email: 'autre@test.com' });

    const res = await request(app).get('/events');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].remaining_seats).toBe(8);
  });

  it('renvoie toutes les places quand aucune réservation n’existe', async () => {
    await createEvent({ capacity: 42 });

    const res = await request(app).get('/events');

    expect(res.body[0].remaining_seats).toBe(42);
  });

  it('renvoie la traduction française par défaut', async () => {
    const event = await createEvent({ title: 'Projection', lang: 'FR' });
    await addEventTranslation(event.id, { lang: 'EN', title: 'Screening' });

    const res = await request(app).get('/events');

    expect(res.body[0]).toMatchObject({ title: 'Projection', lang: 'FR' });
  });

  it('renvoie la traduction demandée via ?lang=EN', async () => {
    const event = await createEvent({ title: 'Projection', lang: 'FR' });
    await addEventTranslation(event.id, { lang: 'EN', title: 'Screening' });

    const res = await request(app).get('/events').query({ lang: 'EN' });

    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ title: 'Screening', lang: 'EN' });
  });

  it('omet les événements non traduits dans la langue demandée', async () => {
    // findAll fait un INNER JOIN sur event_translation : sans traduction EN,
    // l'événement disparaît complètement du résultat.
    await createEvent({ title: 'Projection', lang: 'FR' });

    const res = await request(app).get('/events').query({ lang: 'EN' });

    expect(res.body).toEqual([]);
  });

  it("renvoie un tableau vide quand il n'y a aucun événement", async () => {
    const res = await request(app).get('/events');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /events/:id', () => {
  it("renvoie l'événement et ses places restantes", async () => {
    const event = await createEvent({ title: 'Projection', capacity: 10 });
    await createBooking(event.id);

    const res = await request(app).get(`/events/${event.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: event.id,
      title: 'Projection',
      capacity: 10,
      remaining_seats: 9,
    });
  });

  it("renvoie 404 quand l'événement n'existe pas", async () => {
    const res = await request(app).get('/events/999999');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ message: 'Event not found' });
  });

  it("renvoie 404 quand l'événement n'est pas traduit dans la langue demandée", async () => {
    const event = await createEvent({ lang: 'FR' });

    const res = await request(app)
      .get(`/events/${event.id}`)
      .query({ lang: 'EN' });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ message: 'Event not found' });
  });
});

describe('GET /events/:id/remaining-seats', () => {
  it('renvoie la capacité totale quand aucune place n’est réservée', async () => {
    const event = await createEvent({ capacity: 3 });

    const res = await request(app).get(`/events/${event.id}/remaining-seats`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ remainingSeats: 3 });
  });

  it('décrémente le compte à chaque réservation', async () => {
    const event = await createEvent({ capacity: 3 });
    await createBooking(event.id);
    await createBooking(event.id, { email: 'autre@test.com' });

    const res = await request(app).get(`/events/${event.id}/remaining-seats`);

    expect(res.body).toEqual({ remainingSeats: 1 });
  });

  it("renvoie 404 quand l'événement n'existe pas", async () => {
    const res = await request(app).get('/events/999999/remaining-seats');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ message: 'Event not found' });
  });
});

describe('PUT /events/:id', () => {
  it("met à jour les champs de l'événement", async () => {
    const event = await createEvent({ capacity: 100, location: 'Marseille' });

    const res = await request(app)
      .put(`/events/${event.id}`)
      .set('Cookie', adminCookie)
      .send({ capacity: 50, location: 'Aix-en-Provence' });

    expect(res.status).toBe(200);

    const relu = await request(app).get(`/events/${event.id}`);
    expect(relu.body).toMatchObject({
      capacity: 50,
      location: 'Aix-en-Provence',
    });
  });

  it('met à jour le titre dans la langue indiquée', async () => {
    const event = await createEvent({ title: 'Ancien titre', lang: 'FR' });

    const res = await request(app)
      .put(`/events/${event.id}`)
      .set('Cookie', adminCookie)
      .send({ title: 'Nouveau titre', lang: 'FR' });

    expect(res.status).toBe(200);

    const relu = await request(app).get(`/events/${event.id}`);
    expect(relu.body.title).toBe('Nouveau titre');
  });

  it('renvoie 400 quand le titre est modifié sans préciser la langue', async () => {
    // Le refine du schéma impose lang dès qu'un champ de traduction est présent,
    // sans quoi on ne saurait pas quelle ligne event_translation modifier.
    const event = await createEvent();

    const res = await request(app)
      .put(`/events/${event.id}`)
      .set('Cookie', adminCookie)
      .send({ title: 'Nouveau titre' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Validation failed' });
  });

  /**
   * Un événement saisi dans une seule langue est invisible sur l'autre version
   * du site, `GET /events?lang=` filtrant sur la traduction. La modification
   * doit donc pouvoir *créer* la traduction manquante : un simple UPDATE ne
   * toucherait aucune ligne et ne signalerait rien.
   */
  it('crée la traduction qui manque au lieu de ne rien faire', async () => {
    const event = await createEvent({ title: 'Projection', lang: 'FR' });

    const res = await request(app)
      .put(`/events/${event.id}`)
      .set('Cookie', adminCookie)
      .send({ lang: 'EN', title: 'Screening', description: 'Nice evening' });

    expect(res.status).toBe(200);

    const en = await request(app)
      .get(`/events/${event.id}`)
      .query({ lang: 'EN' });
    expect(en.status).toBe(200);
    expect(en.body).toMatchObject({
      title: 'Screening',
      description: 'Nice evening',
    });
  });

  it('conserve la description quand seul le titre est modifié', async () => {
    const event = await createEvent({
      title: 'Ancien titre',
      description: 'Description à garder',
      lang: 'FR',
    });

    await request(app)
      .put(`/events/${event.id}`)
      .set('Cookie', adminCookie)
      .send({ lang: 'FR', title: 'Nouveau titre' });

    const relu = await request(app).get(`/events/${event.id}`);
    expect(relu.body).toMatchObject({
      title: 'Nouveau titre',
      description: 'Description à garder',
    });
  });

  /**
   * MySQL ne compte que les lignes réellement changées : renvoyer la capacité
   * déjà en base donnait `affectedRows = 0`, que le service prenait pour un
   * événement introuvable. C'est très exactement ce que fait un formulaire
   * d'édition qu'on ouvre et qu'on renvoie sans y toucher.
   */
  it('accepte une modification qui ne change aucune valeur', async () => {
    const event = await createEvent({ capacity: 100 });

    const res = await request(app)
      .put(`/events/${event.id}`)
      .set('Cookie', adminCookie)
      .send({ capacity: 100 });

    expect(res.status).toBe(200);
  });

  it("renvoie 404 quand l'événement n'existe pas", async () => {
    const res = await request(app)
      .put('/events/999999')
      .set('Cookie', adminCookie)
      .send({ capacity: 50 });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ message: 'Event not found' });
  });

  it("renvoie 401 quand la requête n'est pas authentifiée", async () => {
    const event = await createEvent();

    const res = await request(app)
      .put(`/events/${event.id}`)
      .send({ capacity: 50 });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Token missing' });
  });

  it("renvoie 403 et ne modifie rien quand l'utilisateur n'est pas administrateur", async () => {
    const event = await createEvent({ capacity: 100 });

    const res = await request(app)
      .put(`/events/${event.id}`)
      .set('Cookie', juryCookie)
      .send({ capacity: 50 });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Must be an admin' });

    const relu = await request(app).get(`/events/${event.id}`);
    expect(relu.body.capacity).toBe(100);
  });
});

describe('identifiant invalide dans l’URL', () => {
  // Avant la garde parseId, les routes passant par db.query interpolaient NaN
  // dans le SQL et répondaient 500 : MySQL prenait `NaN` pour un nom de colonne.
  const routes = [
    ['GET', '/events/abc'],
    ['GET', '/events/abc/remaining-seats'],
    ['GET', '/events/1.5'],
    ['GET', '/events/0'],
    ['GET', '/events/-1'],
  ] as const;

  it.each(routes)('%s %s renvoie 400', async (_methode, url) => {
    const res = await request(app).get(url);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Invalid event id' });
  });

  it('ne tronque pas un identifiant partiellement numérique', async () => {
    // parseInt('12abc') vaut 12 : l'ancienne implémentation aurait servi
    // l'événement 12 au lieu de rejeter la requête.
    const event = await createEvent();

    const res = await request(app).get(`/events/${event.id}abc`);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Invalid event id' });
  });

  it('renvoie 400 sur PUT avec un identifiant non numérique', async () => {
    const res = await request(app)
      .put('/events/abc')
      .set('Cookie', adminCookie)
      .send({ capacity: 50 });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Invalid event id' });
  });

  it('renvoie 400 sur DELETE avec un identifiant non numérique', async () => {
    const res = await request(app)
      .delete('/events/abc')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Invalid event id' });
  });

  it("contrôle l'authentification avant l'identifiant", async () => {
    // isLogged est déclaré avant le contrôleur : un id invalide sans cookie
    // reçoit 401, l'API ne révèle rien de plus à un appelant anonyme.
    const res = await request(app).delete('/events/abc');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Token missing' });
  });
});

describe('DELETE /events/:id', () => {
  it("supprime l'événement et répond 204", async () => {
    const event = await createEvent();

    const res = await request(app)
      .delete(`/events/${event.id}`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(204);

    const relu = await request(app).get(`/events/${event.id}`);
    expect(relu.status).toBe(404);
  });

  it("renvoie 404 quand l'événement n'existe pas", async () => {
    const res = await request(app)
      .delete('/events/999999')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ message: 'Event not found' });
  });

  it("renvoie 401 quand la requête n'est pas authentifiée", async () => {
    const event = await createEvent();

    const res = await request(app).delete(`/events/${event.id}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Token missing' });
  });

  it("renvoie 403 et ne supprime rien quand l'utilisateur n'est pas administrateur", async () => {
    const event = await createEvent();

    const res = await request(app)
      .delete(`/events/${event.id}`)
      .set('Cookie', juryCookie);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Must be an admin' });

    const relu = await request(app).get(`/events/${event.id}`);
    expect(relu.status).toBe(200);
  });
});
