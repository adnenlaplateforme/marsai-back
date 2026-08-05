import db from '../database/connection.js';
import type { ResultSetHeader } from 'mysql2';
import type Booking from '../types/interfaces/booking.interface.js';
import type {
  BookingTotalsRow,
  CountRow,
  EventBooking,
} from '../types/interfaces/booking.interface.js';

const create = async (
  eventId: number,
  participantId: number,
): Promise<number> => {
  const [result] = await db.execute<ResultSetHeader>(
    'INSERT INTO booking (event_id, participant_id) VALUES (?, ?)',
    [eventId, participantId],
  );
  return result.insertId;
};

const findByParticipantAndEvent = async (
  participantId: number,
  eventId: number,
): Promise<Booking | null> => {
  const [rows] = await db.query<Booking[]>(
    'SELECT * FROM booking WHERE participant_id = ? AND event_id = ?',
    [participantId, eventId],
  );
  return rows[0] ?? null;
};

const remove = async (id: number): Promise<number> => {
  const [result] = await db.execute<ResultSetHeader>(
    'DELETE FROM booking WHERE id = ?',
    [id],
  );
  return result.affectedRows;
};

/**
 * Les réservations d'un événement, participant compris.
 *
 * L'administration a besoin de savoir *qui* vient, pas seulement combien : la
 * jointure remonte donc les coordonnées, et le tri chronologique donne l'ordre
 * d'arrivée — c'est celui qui compte quand un atelier se remplit.
 */
const findByEventId = async (eventId: number): Promise<EventBooking[]> => {
  const [rows] = await db.query<EventBooking[]>(
    `SELECT b.id, b.participant_id, b.created_at,
      p.firstname, p.lastname, p.email
    FROM booking b
    JOIN participant p ON p.id = b.participant_id
    WHERE b.event_id = ?
    ORDER BY b.created_at, b.id`,
    [eventId],
  );
  return rows;
};

/**
 * Le total des réservations et celles posées aujourd'hui.
 *
 * `COALESCE` et `Number` ne sont pas décoratifs : `SUM()` rend NULL sur une
 * table vide, et mysql2 rend les agrégats DECIMAL en chaîne — sans eux, le
 * tableau de bord afficherait « null » ou comparerait '2' à 2.
 *
 * `CURDATE()` est la date du serveur MySQL. Festival et base vivant sur le même
 * fuseau, « aujourd'hui » y a le même sens que pour l'administrateur.
 */
const countTotals = async (): Promise<{ total: number; today: number }> => {
  const [rows] = await db.query<BookingTotalsRow[]>(
    `SELECT COUNT(*) AS total,
      COALESCE(SUM(created_at >= CURDATE()), 0) AS today
    FROM booking`,
  );
  return {
    total: Number(rows[0]?.total ?? 0),
    today: Number(rows[0]?.today ?? 0),
  };
};

const countByEventId = async (eventId: number): Promise<number> => {
  const [rows] = await db.query<CountRow[]>(
    'SELECT COUNT(*) as count FROM booking WHERE event_id = ?',
    [eventId],
  );
  return rows[0]!.count;
};

const bookingModel = {
  create,
  findByParticipantAndEvent,
  findByEventId,
  countTotals,
  remove,
  countByEventId,
};

export default bookingModel;
