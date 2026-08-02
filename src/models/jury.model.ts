import type { ResultSetHeader } from 'mysql2';
import db from '../database/connection.js';
import type JuryProgress from '../types/interfaces/jury-progress.interface.js';
import type Jury from '../types/interfaces/jury.interface.js';

const create = async (
  jury: Omit<Jury, 'id'> & { password: string },
): Promise<number> => {
  const [res] = await db.query<ResultSetHeader>(
    'INSERT INTO user (email, firstname, lastname, password) VALUES (?, ?, ?, ?)',
    [jury.email, jury.firstname, jury.lastname, jury.password],
  );

  const juryRoleId = 2;

  await db.query('INSERT INTO role_user (user_id, role_id) VALUES (?, ?)', [
    res.insertId,
    juryRoleId,
  ]);

  await db.commit();

  return res.insertId;
};

const findAll = async (): Promise<Jury[]> => {
  const sql =
    'SELECT u.id, u.email, u.firstname, u.lastname FROM user u JOIN role_user ru ON ru.user_id = u.id WHERE ru.role_id = 2';
  const [juries] = await db.query<Jury[]>(sql);
  return juries;
};

/**
 * Le nombre de films notés par chaque juré, et sa dernière activité.
 *
 * `MAX(r.updated_at)` et non `created_at` : réviser une note est une activité.
 * Il vaut NULL tant que le juré n'a rien noté, pendant exact de `rated = 0`.
 *
 * LEFT JOIN sur `rating` et non INNER : un juré qui n'a rien noté doit rester
 * dans la liste avec `rated = 0`. C'est précisément celui que l'admin cherche —
 * un INNER JOIN le ferait disparaître du tableau de bord.
 *
 * Trié sur `u.id`, comme l'est de fait `findAll` : les deux listes arrivent
 * dans le même ordre côté admin.
 */
const findProgress = async (): Promise<JuryProgress[]> => {
  const sql = `SELECT u.id, u.email, u.firstname, u.lastname, \
    COUNT(r.id) AS rated, \
    MAX(r.updated_at) AS last_rated_at \
    FROM user u \
    JOIN role_user ru ON ru.user_id = u.id AND ru.role_id = 2 \
    LEFT JOIN rating r ON r.user_id = u.id \
    GROUP BY u.id \
    ORDER BY u.id`;

  const [progress] = await db.query<JuryProgress[]>(sql);
  return progress;
};

/**
 * `u.id` et non `id` : `role_user` porte elle aussi une colonne `id`, et MySQL
 * refusait la requête entière (ER_NON_UNIQ_ERROR). Le défaut est resté invisible
 * tant que la méthode n'avait aucun appelant.
 */
const findById = async (juryId: number): Promise<Jury | null> => {
  const sql =
    'SELECT u.id, u.email, u.firstname, u.lastname FROM user u JOIN role_user ru ON ru.user_id = u.id WHERE ru.role_id = 2 AND u.id = ?';
  const [result] = await db.query<Jury[]>(sql, [juryId]);
  return result[0] ?? null;
};

const findInEmails = async (juries: { email: string }[]): Promise<Jury[]> => {
  const emails = juries.map((j) => j.email);

  const [res] = await db.query(
    'SELECT id, email FROM user WHERE email IN (?)',
    [emails],
  );

  return res as Jury[];
};

const juryModel = { create, findAll, findProgress, findById, findInEmails };
export default juryModel;
