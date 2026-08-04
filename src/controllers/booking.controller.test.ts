import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { RowDataPacket } from 'mysql2/promise';

// POST /bookings envoie un email de confirmation. Le vrai service ouvre un
// transport SMTP au chargement du module et tenterait une connexion réseau à
// chaque réservation : on le remplace pour que les tests restent hors-ligne, et
// pour pouvoir inspecter ce qui aurait été envoyé.
vi.mock('../services/email.service.js', () => ({
  default: { sendMailSubscribeEvent: vi.fn() },
}));

import app from '../app.js';
import db from '../database/connection.js';
import emailService from '../services/email.service.js';
import { resetDatabase } from '../helpers/resetDatabase.js';
import {
  addEventTranslation,
  authCookie,
  createBooking,
  createEvent,
} from '../helpers/test-factories.js';
import { Role } from '../types/enums/role.enum.js';

// Les routes d'administration ne consultent pas l'utilisateur en base : isLogged
// et isAdmin lisent le JWT, un cookie forgé suffit.
const adminCookie = authCookie({ id: 1, roles: [Role.Admin] });
const juryCookie = authCookie({ id: 2, roles: [Role.Jury] });

/** Corps valide au regard de BookingRequestSchema. */
const validBody = (eventId: number) => ({
  eventId,
  firstname: 'Jean',
  lastname: 'Dupont',
  email: 'jean@test.com',
});

/** Compte les lignes d'une table, aucune route n'exposant ces données. */
const countRows = async (table: 'booking' | 'participant'): Promise<number> => {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS count FROM \`${table}\``,
  );
  return rows[0]!.count as number;
};

/** Récupère le token passé au dernier email de confirmation envoyé. */
const lastMailToken = (): string => {
  const calls = vi.mocked(emailService.sendMailSubscribeEvent).mock.calls;
  return calls.at(-1)![3];
};

beforeEach(async () => {
  await resetDatabase();
  vi.clearAllMocks();
});

describe('POST /bookings', () => {
  it('crée la réservation et répond 201 avec son identifiant', async () => {
    const event = await createEvent();

    const res = await request(app).post('/bookings').send(validBody(event.id));

    expect(res.status).toBe(201);
    expect(res.body.id).toEqual(expect.any(Number));
    expect(await countRows('booking')).toBe(1);
  });

  it('consomme une place sur l’événement', async () => {
    const event = await createEvent({ capacity: 10 });

    await request(app).post('/bookings').send(validBody(event.id));

    const seats = await request(app).get(`/events/${event.id}/remaining-seats`);
    expect(seats.body).toEqual({ remainingSeats: 9 });
  });

  it('crée le participant à partir du corps de la requête', async () => {
    const event = await createEvent();

    await request(app).post('/bookings').send(validBody(event.id));

    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM `participant`',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      firstname: 'Jean',
      lastname: 'Dupont',
      email: 'jean@test.com',
    });
  });

  it("réutilise le participant existant quand l'email est déjà connu", async () => {
    // findOrCreate identifie le participant par son email seul : réserver sur
    // deux événements ne doit pas dupliquer la fiche.
    const premier = await createEvent({ slug: 'premier' });
    const second = await createEvent({ slug: 'second' });
    await createBooking(premier.id, { email: 'jean@test.com' });

    const res = await request(app).post('/bookings').send(validBody(second.id));

    expect(res.status).toBe(201);
    expect(await countRows('participant')).toBe(1);
    expect(await countRows('booking')).toBe(2);
  });

  it("envoie l'email de confirmation avec le titre et la description", async () => {
    const event = await createEvent({
      title: 'Projection de gala',
      description: 'Une soirée de projection',
    });

    await request(app).post('/bookings').send(validBody(event.id));

    expect(emailService.sendMailSubscribeEvent).toHaveBeenCalledWith(
      'jean@test.com',
      'Projection de gala',
      'Une soirée de projection',
      expect.any(String),
    );
  });

  it("renvoie 404 quand l'événement n'existe pas", async () => {
    const res = await request(app).post('/bookings').send(validBody(999999));

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ message: 'Event not found' });
  });

  it("renvoie 404 quand l'événement n'est pas traduit en français", async () => {
    // Le service appelle eventModel.findById sans langue : la valeur par défaut
    // est 'FR' et le INNER JOIN sur event_translation ne trouve rien. Un
    // événement créé uniquement en anglais est donc irréservable.
    const event = await createEvent({ lang: 'EN', title: 'Screening' });

    const res = await request(app).post('/bookings').send(validBody(event.id));

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ message: 'Event not found' });
  });

  it('réserve un événement multilingue via sa traduction française', async () => {
    const event = await createEvent({ lang: 'FR', title: 'Projection' });
    await addEventTranslation(event.id, { lang: 'EN', title: 'Screening' });

    const res = await request(app).post('/bookings').send(validBody(event.id));

    expect(res.status).toBe(201);
    expect(emailService.sendMailSubscribeEvent).toHaveBeenCalledWith(
      'jean@test.com',
      'Projection',
      expect.any(String),
      expect.any(String),
    );
  });

  it("renvoie 400 quand l'événement n'est pas réservable", async () => {
    const event = await createEvent({ isBookable: false });

    const res = await request(app).post('/bookings').send(validBody(event.id));

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'This event is not bookable' });
    expect(await countRows('booking')).toBe(0);
  });

  it("renvoie 409 quand l'événement est complet", async () => {
    const event = await createEvent({ capacity: 2 });
    await createBooking(event.id, { email: 'a@test.com' });
    await createBooking(event.id, { email: 'b@test.com' });

    const res = await request(app).post('/bookings').send(validBody(event.id));

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ message: 'Event is full' });
    expect(await countRows('booking')).toBe(2);
  });

  it('accepte la dernière place disponible', async () => {
    const event = await createEvent({ capacity: 2 });
    await createBooking(event.id, { email: 'a@test.com' });

    const res = await request(app).post('/bookings').send(validBody(event.id));

    expect(res.status).toBe(201);
  });

  it('renvoie 409 quand le participant est déjà inscrit', async () => {
    const event = await createEvent({ capacity: 10 });
    await createBooking(event.id, { email: 'jean@test.com' });

    const res = await request(app).post('/bookings').send(validBody(event.id));

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      message: 'Participant is already registered for this event',
    });
    expect(await countRows('booking')).toBe(1);
  });

  it("signale l'événement complet avant le doublon quand les deux s'appliquent", async () => {
    // Le contrôle de capacité précède celui du doublon : sur un événement
    // complet, même un participant déjà inscrit reçoit « Event is full ».
    const event = await createEvent({ capacity: 1 });
    await createBooking(event.id, { email: 'jean@test.com' });

    const res = await request(app).post('/bookings').send(validBody(event.id));

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ message: 'Event is full' });
  });

  it("n'envoie pas d'email quand la réservation est refusée", async () => {
    const event = await createEvent({ isBookable: false });

    await request(app).post('/bookings').send(validBody(event.id));

    expect(emailService.sendMailSubscribeEvent).not.toHaveBeenCalled();
  });

  it('renvoie 400 quand le corps ne passe pas la validation zod', async () => {
    const event = await createEvent();

    const res = await request(app)
      .post('/bookings')
      .send({ ...validBody(event.id), email: 'pas-un-email', firstname: '' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Validation failed' });
    expect(await countRows('participant')).toBe(0);
  });

  it("renvoie 400 quand l'identifiant d'événement n'est pas un entier positif", async () => {
    // eventId est typé number côté zod : une chaîne ou un nombre négatif est
    // rejeté avant d'atteindre la base, aucun risque de NaN dans le SQL.
    const corps = [
      { eventId: 'abc' },
      { eventId: -1 },
      { eventId: 1.5 },
    ] as const;

    for (const invalide of corps) {
      const res = await request(app)
        .post('/bookings')
        .send({ ...validBody(1), ...invalide });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ message: 'Validation failed' });
    }
  });

  it('crée tout de même le participant quand la réservation échoue', async () => {
    // Défaut connu : le contrôleur appelle findOrCreate AVANT que le service
    // ne valide l'événement. Une requête anonyme portant un eventId inexistant
    // laisse donc une fiche participant orpheline en base.
    const res = await request(app).post('/bookings').send(validBody(999999));

    expect(res.status).toBe(404);
    expect(await countRows('booking')).toBe(0);
    expect(await countRows('participant')).toBe(1);
  });
});

describe('GET /bookings/unsubscribe/:token', () => {
  it('supprime la réservation et répond 200', async () => {
    const event = await createEvent();
    await request(app).post('/bookings').send(validBody(event.id));

    const res = await request(app).get(
      `/bookings/unsubscribe/${lastMailToken()}`,
    );

    expect(res.status).toBe(200);
    expect(res.text).toBe('You have been unsubscribed');
    expect(await countRows('booking')).toBe(0);
  });

  it('libère la place réservée', async () => {
    const event = await createEvent({ capacity: 10 });
    await request(app).post('/bookings').send(validBody(event.id));

    await request(app).get(`/bookings/unsubscribe/${lastMailToken()}`);

    const seats = await request(app).get(`/events/${event.id}/remaining-seats`);
    expect(seats.body).toEqual({ remainingSeats: 10 });
  });

  it('conserve la fiche participant après désinscription', async () => {
    // Seule la réservation est supprimée : le participant reste connu, ce qui
    // permet à findOrCreate de le réutiliser lors d'une nouvelle inscription.
    const event = await createEvent();
    await request(app).post('/bookings').send(validBody(event.id));

    await request(app).get(`/bookings/unsubscribe/${lastMailToken()}`);

    expect(await countRows('participant')).toBe(1);
  });

  it('permet au participant de se réinscrire ensuite', async () => {
    const event = await createEvent();
    await request(app).post('/bookings').send(validBody(event.id));
    await request(app).get(`/bookings/unsubscribe/${lastMailToken()}`);

    const res = await request(app).post('/bookings').send(validBody(event.id));

    expect(res.status).toBe(201);
    expect(await countRows('booking')).toBe(1);
    expect(await countRows('participant')).toBe(1);
  });

  it('répond 200 quand la réservation a déjà été supprimée', async () => {
    // DELETE sur un id absent ne supprime aucune ligne, mais la route ne
    // distingue pas ce cas : se désinscrire deux fois reste sans effet.
    const event = await createEvent();
    await request(app).post('/bookings').send(validBody(event.id));
    const token = lastMailToken();
    await request(app).get(`/bookings/unsubscribe/${token}`);

    const res = await request(app).get(`/bookings/unsubscribe/${token}`);

    expect(res.status).toBe(200);
    expect(await countRows('booking')).toBe(0);
  });

  it('renvoie 400 quand le token est illisible', async () => {
    const res = await request(app).get('/bookings/unsubscribe/pas-un-token');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Invalid or expired token' });
  });

  it('renvoie 400 quand le token est signé avec un autre secret', async () => {
    const token = jwt.sign({ id: 1 }, 'mauvais-secret', { expiresIn: '7d' });

    const res = await request(app).get(`/bookings/unsubscribe/${token}`);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Invalid or expired token' });
  });

  it('renvoie 400 et ne supprime rien quand le token est expiré', async () => {
    // Le lien de désinscription vit 7 jours : un lien plus ancien cliqué depuis
    // un vieil email ne doit pas produire une erreur serveur.
    const event = await createEvent();
    const booking = await createBooking(event.id);
    const token = jwt.sign({ id: booking.id }, process.env.JWT_SECRET, {
      expiresIn: '-1s',
    });

    const res = await request(app).get(`/bookings/unsubscribe/${token}`);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Invalid or expired token' });
    expect(await countRows('booking')).toBe(1);
  });
});

/**
 * La liste des participants d'un événement.
 *
 * Elle sort des noms et des e-mails : c'est la seule route de ce fichier qui
 * demande un administrateur, et les tests d'accès en dessous valent autant que
 * ceux du contenu.
 */
describe('GET /events/:id/bookings', () => {
  it('rend les participants dans leur ordre d’arrivée', async () => {
    const event = await createEvent();
    await createBooking(event.id, {
      firstname: 'Alice',
      lastname: 'Martin',
      email: 'alice@test.com',
      createdAt: '2026-07-02 10:00:00',
    });
    await createBooking(event.id, {
      firstname: 'Bob',
      lastname: 'Durand',
      email: 'bob@test.com',
      createdAt: '2026-07-01 10:00:00',
    });

    const res = await request(app)
      .get(`/events/${event.id}/bookings`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({
      firstname: 'Bob',
      lastname: 'Durand',
      email: 'bob@test.com',
    });
  });

  it('rend une liste vide quand personne n’a réservé', async () => {
    const event = await createEvent();

    const res = await request(app)
      .get(`/events/${event.id}/bookings`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  /**
   * Un événement saisi en anglais seulement a des participants comme un autre.
   * L'existence se vérifie donc sur `event`, et non via findById qui joint la
   * traduction — sinon la liste répondrait 404 sur un atelier bien réel.
   */
  it('liste les participants d’un événement non traduit en français', async () => {
    const event = await createEvent({ lang: 'EN', title: 'Workshop' });
    await createBooking(event.id);

    const res = await request(app)
      .get(`/events/${event.id}/bookings`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("renvoie 404 quand l'événement n'existe pas", async () => {
    const res = await request(app)
      .get('/events/999999/bookings')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ message: 'Event not found' });
  });

  it('renvoie 400 sur un identifiant non numérique', async () => {
    const res = await request(app)
      .get('/events/abc/bookings')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Invalid event id' });
  });

  it("renvoie 401 quand la requête n'est pas authentifiée", async () => {
    const event = await createEvent();
    await createBooking(event.id);

    const res = await request(app).get(`/events/${event.id}/bookings`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Token missing' });
  });

  it("renvoie 403 quand l'utilisateur n'est pas administrateur", async () => {
    const event = await createEvent();
    await createBooking(event.id);

    const res = await request(app)
      .get(`/events/${event.id}/bookings`)
      .set('Cookie', juryCookie);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Must be an admin' });
  });
});
