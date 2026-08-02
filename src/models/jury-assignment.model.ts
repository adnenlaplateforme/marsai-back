import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import db from '../database/connection.js';
import { JURY_RATABLE_STATUS } from '../helpers/jury-visibility.js';
import {
  MIN_JURIES_PER_MOVIE,
  type JuryAssignment,
} from '../helpers/assign-juries.js';
import type JuryAssignmentProgress from '../types/interfaces/jury-assignment-progress.interface.js';

interface MovieIdRow extends RowDataPacket {
  id: number;
}

interface TotalRow extends RowDataPacket {
  total: number;
}

/**
 * Insère un lot d'attributions en une seule requête.
 *
 * `query` et non `execute` : seul le premier développe un tableau de tableaux
 * en liste de VALUES. `execute` prépare la requête et n'y verrait qu'un unique
 * paramètre. Même piège que le `IN (?)` de rating.model.
 *
 * Une seule requête plutôt qu'un INSERT par ligne : l'attribution d'un festival
 * représente plus d'un millier de lignes, et le service les écrit dans une
 * transaction qu'on ne veut pas tenir ouverte pendant mille allers-retours.
 */
const createMany = async (assignments: JuryAssignment[]): Promise<number> => {
  const values = assignments.map(({ userId, movieId }) => [userId, movieId]);

  const [result] = await db.query<ResultSetHeader>(
    'INSERT INTO jury_assignment (user_id, movie_id) VALUES ?',
    [values],
  );

  return result.affectedRows;
};

/**
 * Retire un film de la file d'un juré.
 *
 * Renvoie le nombre de lignes supprimées, que le controller traduit en 204 ou
 * 404 : retirer un film qui n'était pas dans la file n'est pas un succès
 * silencieux.
 */
const remove = async (userId: number, movieId: number): Promise<number> => {
  const [result] = await db.execute<ResultSetHeader>(
    'DELETE FROM jury_assignment WHERE user_id = ? AND movie_id = ?',
    [userId, movieId],
  );

  return result.affectedRows;
};

/**
 * L'avancement de chaque juré : ce qui lui a été confié, ce qu'il a déjà noté.
 *
 * `rating` est joint sur le couple (juré, film) de l'attribution et non sur le
 * seul juré. Deux effets, tous deux voulus : une note posée hors du lot ne fait
 * pas avancer la barre, et `rated <= assigned` est vrai par construction.
 *
 * Cette condition évite aussi le produit croisé qu'auraient donné deux
 * jointures indépendantes : `rating` portant UNIQUE (user_id, movie_id), chaque
 * ligne d'attribution ne peut matcher qu'une note au plus. Un `COUNT` simple
 * suffit donc, sans `DISTINCT`.
 *
 * LEFT JOIN sur les deux : un juré à qui rien n'a été confié doit sortir à
 * zéro, pas disparaître — c'est celui que l'admin cherche après l'attribution.
 */
const findProgress = async (): Promise<JuryAssignmentProgress[]> => {
  const sql = `SELECT u.id AS user_id, \
    COUNT(ja.id) AS assigned, \
    COUNT(r.id) AS rated \
    FROM user u \
    JOIN role_user ru ON ru.user_id = u.id AND ru.role_id = 2 \
    LEFT JOIN jury_assignment ja ON ja.user_id = u.id \
    LEFT JOIN rating r ON r.user_id = ja.user_id AND r.movie_id = ja.movie_id \
    GROUP BY u.id \
    ORDER BY u.id`;

  const [progress] = await db.query<JuryAssignmentProgress[]>(sql);
  return progress;
};

/**
 * Les films que l'attribution a le droit de confier.
 *
 * `JURY_RATABLE_STATUS` et non les statuts visibles : c'est déjà la règle de
 * `/movies/to-rate` et de `POST /movies/:id/ratings`. Mettre un film en attente
 * de revue dans la file d'un juré lui ouvrirait un formulaire que la route de
 * notation refuse.
 *
 * `ORDER BY id` n'est pas décoratif : l'algorithme parcourt les films dans
 * l'ordre reçu, et une attribution qu'on ne peut pas rejouer à l'identique est
 * intestable.
 */
const findAssignableMovieIds = async (): Promise<number[]> => {
  const [rows] = await db.query<MovieIdRow[]>(
    'SELECT id FROM movie WHERE status = ? ORDER BY id',
    [JURY_RATABLE_STATUS],
  );

  return rows.map((row) => row.id);
};

/**
 * Les films acceptés qui n'ont pas atteint le minimum de deux jurés.
 *
 * C'est l'accusé de réception de l'attribution, et le seul endroit où un film
 * accepté après coup se signale : sans ce chiffre, il n'aurait aucun juré et
 * personne ne s'en apercevrait avant la délibération.
 *
 * Le comptage porte sur les lignes d'attribution seules, sans regarder
 * `rating` : les lignes ne sont jamais retirées, un film que ses deux jurés ont
 * déjà noté reste donc couvert.
 */
const countUnassignedMovies = async (): Promise<number> => {
  const sql = `SELECT COUNT(*) AS total FROM ( \
    SELECT m.id \
    FROM movie m \
    LEFT JOIN jury_assignment ja ON ja.movie_id = m.id \
    WHERE m.status = ? \
    GROUP BY m.id \
    HAVING COUNT(ja.id) < ? \
  ) AS sous_couvert`;

  const [rows] = await db.query<TotalRow[]>(sql, [
    JURY_RATABLE_STATUS,
    MIN_JURIES_PER_MOVIE,
  ]);

  return rows[0]?.total ?? 0;
};

/**
 * Confie un film à un juré, à l'unité — le rattrapage d'un film accepté après
 * l'attribution, ou un ajustement de l'admin.
 *
 * L'insertion en doublon remonte telle quelle (errno 1062) : c'est le service
 * qui la traduit en refus métier, comme le fait déjà `jury-invite.service`.
 */
const create = async (userId: number, movieId: number): Promise<number> => {
  const [result] = await db.execute<ResultSetHeader>(
    'INSERT INTO jury_assignment (user_id, movie_id) VALUES (?, ?)',
    [userId, movieId],
  );

  return result.insertId;
};

/**
 * Le nombre d'attributions en base — la question « l'attribution a-t-elle déjà
 * eu lieu ? », à laquelle le service répond par un refus.
 */
const count = async (): Promise<number> => {
  const [rows] = await db.query<TotalRow[]>(
    'SELECT COUNT(*) AS total FROM jury_assignment',
  );

  return rows[0]?.total ?? 0;
};

/**
 * Remet l'attribution à zéro.
 *
 * Ne touche que `jury_assignment` : les notes vivent dans `rating` et survivent
 * à toute redistribution. La séparation des deux tables est ce qui rend cette
 * garantie structurelle plutôt que déclarative.
 */
const deleteAll = async (): Promise<number> => {
  const [result] = await db.query<ResultSetHeader>(
    'DELETE FROM jury_assignment',
  );

  return result.affectedRows;
};

const juryAssignmentModel = {
  createMany,
  create,
  count,
  deleteAll,
  remove,
  findProgress,
  findAssignableMovieIds,
  countUnassignedMovies,
};

export default juryAssignmentModel;
