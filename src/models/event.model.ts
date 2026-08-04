import db from '../database/connection.js';
import type { CreateEventRequest } from '../types/schemas/create-event-request.schema.js';
import type { UpdateEventRequest } from '../types/schemas/update-event-request.schema.js';
import type { Event } from '../types/interfaces/event.interface.js';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

/** Rend l'identifiant créé : c'est la seule donnée que l'appelant ne peut pas
 * reconstituer, le slug étant calculé ici. */
const create = async (event: CreateEventRequest): Promise<number> => {
  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO event (slug, date, published_at, duration, location, is_bookable, capacity)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      event.slug,
      event.date,
      event.publishedAt,
      event.duration,
      event.location,
      event.isBookable,
      event.capacity,
    ],
  );
  await db.execute(
    `INSERT INTO event_translation (event_id, lang, title, description) VALUES (?, ?, ?, ?)`,
    [result.insertId, event.lang, event.title, event.description],
  );

  return result.insertId;
};

const findAll = async (lang = 'FR'): Promise<Event[]> => {
  const [rows] = await db.query(
    `SELECT e.*, et.title, et.description, et.lang,
      e.capacity - COALESCE(bc.booked, 0) AS remaining_seats
    FROM event e
    JOIN event_translation et ON et.event_id = e.id AND et.lang = ?
    LEFT JOIN (
      SELECT event_id, COUNT(*) AS booked
      FROM booking
      GROUP BY event_id
    ) bc ON bc.event_id = e.id`,
    [lang],
  );
  return rows as Event[];
};

const findById = async (id: number, lang = 'FR'): Promise<Event | null> => {
  const [rows] = await db.query<Event[]>(
    `SELECT e.*, et.title, et.description, et.lang,
      e.capacity - COALESCE(COUNT(b.id), 0) AS remaining_seats
    FROM event e
    JOIN event_translation et ON et.event_id = e.id AND et.lang = ?
    LEFT JOIN booking b ON b.event_id = e.id
    WHERE e.id = ?
    GROUP BY e.id, et.title, et.description, et.lang`,
    [lang, id],
  );
  return rows[0] ?? null;
};

const findBySlug = async (slug: string, lang = 'FR'): Promise<Event | null> => {
  const [rows] = await db.query<Event[]>(
    `SELECT e.*, et.title, et.description, et.lang
    FROM event e
    JOIN event_translation et ON et.event_id = e.id AND et.lang = ?
    WHERE e.slug = ?`,
    [lang, slug],
  );
  return rows[0] ?? null;
};

/**
 * L'événement existe-t-il, quelle que soit sa langue ?
 *
 * `findById` ne sert pas à cela : il joint `event_translation` et rendrait
 * `null` sur un événement bien présent mais non traduit dans la langue demandée.
 * Une liste de participants ne doit pas dépendre d'une traduction.
 */
const existsById = async (id: number): Promise<boolean> => {
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT 1 FROM event WHERE id = ?',
    [id],
  );
  return rows.length > 0;
};

const getRemainingSeats = async (id: number): Promise<number | null> => {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT e.capacity - COALESCE(COUNT(b.id), 0) AS remaining_seats
    FROM event e
    LEFT JOIN booking b ON b.event_id = e.id
    WHERE e.id = ?
    GROUP BY e.id`,
    [id],
  );
  return rows[0] ? (rows[0].remaining_seats as number) : null;
};

const update = async (
  id: number,
  event: UpdateEventRequest,
): Promise<number> => {
  const eventFieldMap: Record<string, string> = {
    slug: 'slug',
    status: 'status',
    date: 'date',
    publishedAt: 'published_at',
    duration: 'duration',
    location: 'location',
    isBookable: 'is_bookable',
    capacity: 'capacity',
  };
  const translationFields = new Set(['title', 'description']);

  const eventCols: string[] = [];
  const eventVals: unknown[] = [];
  const translationCols: string[] = [];
  const translationVals: unknown[] = [];

  for (const [key, value] of Object.entries(event)) {
    if (key === 'lang') continue;
    if (key in eventFieldMap) {
      eventCols.push(`${eventFieldMap[key]} = ?`);
      eventVals.push(value);
    } else if (translationFields.has(key)) {
      translationCols.push(`${key} = ?`);
      translationVals.push(value);
    }
  }

  let affectedRows = 0;

  if (eventCols.length > 0) {
    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE event SET ${eventCols.join(', ')} WHERE id = ?`,
      [...eventVals, id],
    );
    affectedRows = result.affectedRows;
  }

  if (event.lang && event.title !== undefined) {
    // Un upsert quand le titre est là : la traduction demandée peut ne pas
    // exister encore — c'est le cas de tout événement saisi dans une seule
    // langue — et un UPDATE n'y toucherait aucune ligne sans rien signaler.
    // `description` n'entre dans la mise à jour que si elle est fournie :
    // corriger un titre seul ne doit pas effacer le texte existant.
    const onDuplicate = ['title = VALUES(title)'];
    if (event.description !== undefined) {
      onDuplicate.push('description = VALUES(description)');
    }

    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO event_translation (event_id, lang, title, description)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE ${onDuplicate.join(', ')}`,
      [id, event.lang, event.title, event.description ?? ''],
    );
    affectedRows += result.affectedRows;
  } else if (translationCols.length > 0 && event.lang) {
    // Une description seule ne peut que modifier : `title` est NOT NULL, il n'y
    // a pas de quoi créer la ligne si elle manque.
    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE event_translation SET ${translationCols.join(', ')} WHERE event_id = ? AND lang = ?`,
      [...translationVals, id, event.lang],
    );
    affectedRows += result.affectedRows;
  }

  return affectedRows;
};

const remove = async (id: number): Promise<number> => {
  const [result] = await db.execute<ResultSetHeader>(
    'DELETE FROM event WHERE id = ?',
    [id],
  );
  return result.affectedRows;
};

const eventModel = {
  create,
  findAll,
  update,
  remove,
  findById,
  findBySlug,
  existsById,
  getRemainingSeats,
};

export default eventModel;
