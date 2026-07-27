import type { ResultSetHeader } from 'mysql2';
import db from '../database/connection.js';
import type Rate from '../types/interfaces/rate.interface.js';
import type {
  MovieWithDirector,
  MovieWithRating,
} from '../types/interfaces/Movie.interface.js';

const getByMovieIdAndUserId = async (
  userId: number,
  movieId: number,
): Promise<Rate | null> => {
  const [result] = await db.execute<Rate[]>(
    'SELECT * FROM rating WHERE user_id = ? AND movie_id = ?',
    [userId, movieId],
  );

  return result[0] ?? null;
};

const update = async (
  userId: number,
  movieId: number,
  note: number,
  comment?: string,
): Promise<number> => {
  const [result] = await db.execute<ResultSetHeader>(
    'UPDATE rating SET note = ?, comment = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND movie_id = ?',
    [note, comment ?? null, userId, movieId],
  );

  return result.affectedRows;
};

const create = async (
  userId: number,
  movieId: number,
  note: number,
  comment?: string,
): Promise<number> => {
  const [result] = await db.execute<ResultSetHeader>(
    'INSERT INTO rating (note, comment, user_id, movie_id) VALUES (?, ?, ?, ?)',
    [note, comment ?? null, userId, movieId],
  );
  return result.insertId;
};

const findAllByMovieId = async (movieId: number): Promise<Rate[]> => {
  const [result] = await db.query<Rate[]>(
    'SELECT * FROM rating WHERE movie_id = ?',
    [movieId],
  );
  return result;
};

/**
 * Le réalisateur est joint en INNER JOIN, comme dans `getAll`, `getById` et
 * `getRandom` de movie.model : un film sans réalisateur est déjà invisible
 * partout ailleurs dans l'API. Le joindre ici évite qu'un film apparaisse dans
 * les listes du jury alors qu'aucune autre route ne sait le servir.
 */
const directorJson =
  'JSON_OBJECT( \
    "gender", c.gender,\
    "firstname", c.firstname,\
    "lastname", c.lastname\
  ) AS director';

const findRatedMoviesByUserId = async (
  userId: number,
): Promise<MovieWithRating[]> => {
  const sql = `SELECT m.*, r.note, r.comment, r.updated_at AS rated_at, ${directorJson} \
    FROM rating r \
    INNER JOIN movie m ON m.id = r.movie_id \
    INNER JOIN collaborator c ON c.movie_id = m.id AND c.is_director = true \
    WHERE r.user_id = ? \
    ORDER BY r.updated_at DESC`;

  const [result] = await db.query<MovieWithRating[]>(sql, [userId]);
  return result;
};

/**
 * Les films que ce juré n'a pas encore notés.
 *
 * Le `user_id` est dans la condition du LEFT JOIN et non dans le WHERE : placé
 * dans le WHERE, il annulerait le LEFT JOIN et ne renverrait plus jamais rien.
 * Aucun filtre de statut, pour rester aligné sur POST /movies/:id/ratings qui
 * accepte n'importe quel film existant.
 */
const findMoviesToRateByUserId = async (
  userId: number,
): Promise<MovieWithDirector[]> => {
  const sql = `SELECT m.*, ${directorJson} \
    FROM movie m \
    INNER JOIN collaborator c ON c.movie_id = m.id AND c.is_director = true \
    LEFT JOIN rating r ON r.movie_id = m.id AND r.user_id = ? \
    WHERE r.id IS NULL \
    ORDER BY m.submitted_at DESC`;

  const [result] = await db.query<MovieWithDirector[]>(sql, [userId]);
  return result;
};

const ratingModel = {
  getByMovieIdAndUserId,
  update,
  create,
  findAllByMovieId,
  findRatedMoviesByUserId,
  findMoviesToRateByUserId,
};

export default ratingModel;
