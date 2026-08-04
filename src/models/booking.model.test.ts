// La nouvelle requête de booking.model est du SQL et rien d'autre : une jointure
// vers participant, un tri chronologique. Comme pour jury-assignment, seule la
// vraie base exerce la jointure et l'ordre — un mock ne dirait que ce qu'on lui
// a soufflé.
import { describe, it, expect, beforeEach } from 'vitest';
import bookingModel from './booking.model.js';
import { resetDatabase } from '../helpers/resetDatabase.js';
import { createBooking, createEvent } from '../helpers/test-factories.js';

beforeEach(async () => {
  await resetDatabase();
});

describe('bookingModel.findByEventId', () => {
  it('rend les participants de l’événement avec leurs coordonnées', async () => {
    const event = await createEvent();
    await createBooking(event.id, {
      firstname: 'Alice',
      lastname: 'Martin',
      email: 'alice@test.com',
    });

    const bookings = await bookingModel.findByEventId(event.id);

    expect(bookings).toHaveLength(1);
    expect(bookings[0]).toMatchObject({
      firstname: 'Alice',
      lastname: 'Martin',
      email: 'alice@test.com',
    });
    expect(bookings[0]!.created_at).toBeInstanceOf(Date);
  });

  it('range les réservations de la plus ancienne à la plus récente', async () => {
    const event = await createEvent();
    await createBooking(event.id, {
      email: 'second@test.com',
      createdAt: '2026-07-02 10:00:00',
    });
    await createBooking(event.id, {
      email: 'premier@test.com',
      createdAt: '2026-07-01 10:00:00',
    });

    const bookings = await bookingModel.findByEventId(event.id);

    expect(bookings.map((b) => b.email)).toEqual([
      'premier@test.com',
      'second@test.com',
    ]);
  });

  it('ne rend que les participants de l’événement demandé', async () => {
    const concert = await createEvent({ slug: 'concert' });
    const atelier = await createEvent({ slug: 'atelier' });
    await createBooking(concert.id, { email: 'concert@test.com' });
    await createBooking(atelier.id, { email: 'atelier@test.com' });

    const bookings = await bookingModel.findByEventId(atelier.id);

    expect(bookings).toHaveLength(1);
    expect(bookings[0]!.email).toBe('atelier@test.com');
  });

  it('rend une liste vide quand personne n’a réservé', async () => {
    const event = await createEvent();

    expect(await bookingModel.findByEventId(event.id)).toEqual([]);
  });
});
