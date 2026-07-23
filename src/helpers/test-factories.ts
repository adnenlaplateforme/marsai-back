import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import db from '../database/connection.js';
import authService from '../services/auth.service.js';
import jwtService from '../services/jwt.service.js';
import { Role } from '../types/enums/role.enum.js';

interface RoleRow extends RowDataPacket {
  id: number;
}

export interface TestUser {
  id: number;
  email: string;
  password: string;
  roles: Role[];
}

/**
 * Crée un utilisateur en base de test avec ses rôles, mot de passe hashé.
 *
 * Le mot de passe en clair est renvoyé pour permettre aux tests de login de
 * l'utiliser tel quel, sans le redéclarer de leur côté.
 */
export const createUser = async ({
  email = 'user@test.com',
  password = 'password123',
  roles = [Role.Admin],
}: Partial<
  Pick<TestUser, 'email' | 'password' | 'roles'>
> = {}): Promise<TestUser> => {
  const hashed = await authService.hashPassword(password);

  const [result] = await db.execute<ResultSetHeader>(
    'INSERT INTO `user` (`email`, `password`) VALUES (?, ?)',
    [email, hashed],
  );
  const userId = result.insertId;

  for (const role of roles) {
    const [rows] = await db.execute<RoleRow[]>(
      'SELECT `id` FROM `role` WHERE `name` = ? LIMIT 1',
      [role],
    );
    const roleId = rows[0]?.id;
    if (!roleId) throw new Error(`Rôle introuvable en base de test : ${role}`);

    await db.execute(
      'INSERT INTO `role_user` (`user_id`, `role_id`) VALUES (?, ?)',
      [userId, roleId],
    );
  }

  return { id: userId, email, password, roles };
};

export type Lang = 'FR' | 'EN';
export type EventStatus = 'draft' | 'published' | 'canceled';

export interface TestEvent {
  id: number;
  slug: string;
  title: string;
  description: string;
  lang: Lang;
  capacity: number;
}

interface CreateEventOptions {
  slug?: string;
  title?: string;
  description?: string;
  lang?: Lang;
  status?: EventStatus;
  date?: string;
  publishedAt?: string;
  duration?: number;
  location?: string;
  isBookable?: boolean;
  capacity?: number;
}

/**
 * Ajoute une traduction à un événement existant.
 *
 * `findAll` et `findById` font un INNER JOIN sur event_translation : un
 * événement n'apparaît que dans les langues où il est traduit. Cette factory
 * sert donc aussi bien à tester le multilingue qu'à provoquer une absence.
 */
export const addEventTranslation = async (
  eventId: number,
  {
    lang,
    title,
    description = '',
  }: { lang: Lang; title: string; description?: string },
): Promise<void> => {
  await db.execute(
    'INSERT INTO `event_translation` (`event_id`, `lang`, `title`, `description`) VALUES (?, ?, ?, ?)',
    [eventId, lang, title, description],
  );
};

/**
 * Crée un événement et sa traduction en base de test.
 *
 * POST /events répond 201 sans corps : l'API ne renvoie jamais l'id du nouvel
 * événement. Les tests qui doivent ensuite cibler cet événement (findById,
 * update, remove) ne peuvent donc pas passer par l'API et insèrent directement.
 *
 * `slug` est UNIQUE en base : le passer explicitement dès qu'un test crée
 * plusieurs événements.
 */
export const createEvent = async ({
  slug = 'evenement-test',
  title = 'Événement de test',
  description = 'Description de test',
  lang = 'FR',
  status = 'published',
  date = '2026-09-01 20:00:00',
  publishedAt = '2026-08-01 10:00:00',
  duration = 120,
  location = 'Marseille',
  isBookable = true,
  capacity = 100,
}: CreateEventOptions = {}): Promise<TestEvent> => {
  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO \`event\` (\`slug\`, \`status\`, \`date\`, \`published_at\`, \`duration\`, \`location\`, \`is_bookable\`, \`capacity\`)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [slug, status, date, publishedAt, duration, location, isBookable, capacity],
  );
  const id = result.insertId;

  await addEventTranslation(id, { lang, title, description });

  return { id, slug, title, description, lang, capacity };
};

/**
 * Réserve une place sur un événement (participant + booking).
 *
 * Le nombre de places restantes est calculé en SQL (capacity - COUNT(booking)),
 * il n'est donc vérifiable qu'avec de vraies lignes en base.
 */
export const createBooking = async (
  eventId: number,
  {
    firstname = 'Jean',
    lastname = 'Participant',
    email = 'participant@test.com',
  }: { firstname?: string; lastname?: string; email?: string } = {},
): Promise<{ id: number; participantId: number }> => {
  const [participant] = await db.execute<ResultSetHeader>(
    'INSERT INTO `participant` (`firstname`, `lastname`, `email`) VALUES (?, ?, ?)',
    [firstname, lastname, email],
  );
  const [booking] = await db.execute<ResultSetHeader>(
    'INSERT INTO `booking` (`event_id`, `participant_id`) VALUES (?, ?)',
    [eventId, participant.insertId],
  );

  return { id: booking.insertId, participantId: participant.insertId };
};

/**
 * Forge un cookie accessToken valide pour un utilisateur, afin de tester les
 * routes protégées sans passer par un vrai /auth/login à chaque test.
 */
export const authCookie = (user: Pick<TestUser, 'id' | 'roles'>): string => {
  const token = jwtService.signAccessToken({
    id: user.id,
    roles: user.roles,
  } as never);
  return `accessToken=${token}`;
};
