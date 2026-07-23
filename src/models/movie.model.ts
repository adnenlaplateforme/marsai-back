import type { ResultSetHeader } from 'mysql2';
import db from '../database/connection.js';
import type { MovieRequest } from '../types/schemas/MovieRequest.schema.js';
import type Movie from '../types/interfaces/Movie.interface.js';
import type { MovieFindAllResponse } from '../types/interfaces/MovieFindAllResponse.interface.js';
import type { MovieCount } from '../types/interfaces/MovieFindAllResponse.interface.js';
import { toSnakeCase } from '../helpers/string-utils.js';
import type { MovieWithDirector } from '../types/interfaces/Movie.interface.js';

const create = async (newMovie: MovieRequest): Promise<number> => {
  const sql = `
  INSERT INTO movie 
  (original_title, english_title, slug, cover_path, duration, is_hybrid, language, original_synopsis, english_synopsis, creative_process, ai_tools, has_subs, video_path) 
  VALUES 
  (:originalTitle, :englishTitle, :slug, :coverPath, :duration, :isHybrid, :language, :originalSynopsis, :englishSynopsis, :creativeProcess, :aiTools, :hasSubs, :videoPath)
  `;
  const [result] = await db.execute<ResultSetHeader>(sql, newMovie);

  return result.insertId;
};

const getAll = async (
  page: number,
  type: string,
  search: string,
): Promise<MovieFindAllResponse> => {
  const offset: number = (page - 1) * 20;
  const isHybridFirst: number = type === 'hybrid' ? 1 : 0;
  const isHybridSecond: number = type === 'hybrid' || type === 'all' ? 1 : 0;

  const sqlCount =
    'SELECT COUNT(m.id) AS total \
                    FROM movie m \
                    INNER JOIN collaborator c ON m.id = c.movie_id \
                    WHERE is_director = true \
                    AND m.english_title LIKE ? \
                    AND( m.is_hybrid = ? OR m.is_hybrid = ? )';
  // WHERE c.contribution = "Director"\
  const sqlData =
    'SELECT m.*, \
                    JSON_OBJECT( \
                        "gender", c.gender,\
                        "firstname", c.firstname,\
                        "lastname", c.lastname\
                      )  AS director\
              FROM movie m \
              INNER JOIN collaborator c ON m.id = c.movie_id \
              WHERE c.is_director = true\
              AND m.english_title LIKE ? \
              AND( m.is_hybrid = ? OR m.is_hybrid = ? )\
              LIMIT 20 OFFSET ?';

  search = '%' + search + '%';
  const [data] = await db.query<Movie[]>(sqlData, [
    search,
    isHybridFirst,
    isHybridSecond,
    offset,
  ]);
  const count = await db.query<MovieCount[]>(sqlCount, [
    search,
    isHybridFirst,
    isHybridSecond,
    offset,
  ]);
  const resCount: number = count[0][0]!.total;

  return { total: resCount, data } as MovieFindAllResponse;
};

const getById = async (id: number): Promise<MovieWithDirector | null> => {
  const sql =
    'SELECT m.*, \
    (SELECT JSON_ARRAYAGG(i.path) FROM image i WHERE i.movie_id = m.id) AS stills, \
    JSON_OBJECT( \
        "gender", dir.gender,\
        "firstname", dir.firstname,\
        "lastname", dir.lastname,\
        "contribution", dir.contribution,\
        "email", dir.email,\
        "job", dir.job,\
        "address", dir.address,\
        "zipcode", dir.zipcode,\
        "city", dir.city,\
        "region", dir.region,\
        "country", dir.country,\
        "phone", dir.phone,\
        "birthdate", dir.birthdate,\
        "facebook_url", dir.facebook_url,\
        "instagram_url", dir.instagram_url,\
        "youtube_url", dir.youtube_url,\
        "linkedin_url", dir.linkedin_url,\
        "twitter_url", dir.twitter_url\
            ) AS director, \
    JSON_ARRAYAGG( \
        JSON_OBJECT( \
            "gender", c.gender,\
            "firstname", c.firstname,\
            "lastname", c.lastname,\
            "contribution", c.contribution,\
            "email", c.email\
    )) AS collaborators \
    FROM movie m \
    LEFT JOIN collaborator c ON m.id = c.movie_id AND c.is_director = false\
    INNER JOIN collaborator dir ON m.id = dir.movie_id AND dir.is_director = true\
    WHERE m.id = ? \
    GROUP BY dir.id';

  const [result] = await db.query<MovieWithDirector[]>(sql, [id]);
  const movie = (result[0] as MovieWithDirector) ?? null;
  if (movie && movie.collaborators[0]?.email === null) {
    movie.collaborators = [];
  }
  return movie;
};

const getBySlug = async (slug: string): Promise<Movie | null> => {
  const sql = 'SELECT * FROM movie where slug = ?';
  const [result] = await db.query<Movie[]>(sql, [slug]);
  return result[0] ?? null;
};

const remove = async (id: number): Promise<number> => {
  const sql = 'DELETE FROM movie WHERE id = :id';

  const [result] = await db.execute<ResultSetHeader>(sql, { id });

  return result.affectedRows;
};

const update = async (
  id: number,
  movie: Partial<MovieRequest>,
): Promise<number> => {
  const fields: string[] = [];
  const values: (string | number | Date | boolean)[] = [];

  const {
    token: _token,
    stillsUrls: _stills,
    director: _dir,
    collaborators: _collab,
    ...movieCleaned
  } = movie;
  for (const [key, value] of Object.entries(movieCleaned)) {
    if (value === undefined) continue;
    fields.push(`${toSnakeCase(key)} = ?`);
    values.push(value as string | number | Date | boolean);
  }
  if (fields.length === 0) {
    return 0; // No fields to update
  }

  values.push(id); // Add id for the WHERE clause

  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE movie SET ${fields.join(', ')} WHERE id = ?`,
    values,
  );

  return result.affectedRows;
};

const getAllSorted = async (
  page: number,
  sort: string,
  order: string,
  onlyDrafts: boolean,
  search: string,
): Promise<MovieFindAllResponse> => {
  const offset: number = (page - 1) * 20;

  const sqlCount = `SELECT COUNT(m.id) AS total \
                    FROM movie m \
                    INNER JOIN collaborator c ON m.id = c.movie_id \
                WHERE c.is_director = true\
              ${onlyDrafts ? "AND m.status = 'draft'" : ''} \
              AND ( m.english_title LIKE :search \
                    OR m.original_title LIKE :search \
                    OR c.firstname LIKE :search \
                    OR c.lastname LIKE :search )`;

  const sqlData = `SELECT m.*, \
                    JSON_OBJECT( \
                        "gender", c.gender,\
                        "firstname", c.firstname,\
                        "lastname", c.lastname\
                      )  AS director\
              FROM movie m \
              INNER JOIN collaborator c ON m.id = c.movie_id \
              WHERE c.is_director = true\
              ${onlyDrafts ? "AND m.status = 'draft'" : ''} \
              AND ( m.english_title LIKE :search \
                    OR m.original_title LIKE :search \
                    OR c.firstname LIKE :search \
                    OR c.lastname LIKE :search ) \
                    ORDER BY ${sort} ${order} \
                    LIMIT 20 OFFSET :offset`;

  search = '%' + search + '%';
  const [data] = await db.query<Movie[]>(sqlData, {
    search: search,
    offset: offset,
  });
  const count = await db.execute<MovieCount[]>(sqlCount, { search: search });
  const resCount: number = count[0][0]!.total;

  return { total: resCount, data } as MovieFindAllResponse;
};

// SELECT column FROM table
// ORDER BY RAND()
// LIMIT 1

const getRandom = async (qt: number): Promise<Movie[]> => {
  const sqlData =
    'SELECT m.*, \
                    JSON_OBJECT( \
                        "gender", c.gender,\
                        "firstname", c.firstname,\
                        "lastname", c.lastname\
                      )  AS director\
              FROM movie m \
              INNER JOIN collaborator c ON m.id = c.movie_id \
              WHERE c.is_director = true\
              ORDER BY RAND() \
              LIMIT ?';

  const [data] = await db.query<Movie[]>(sqlData, [qt]);
  return data;
};

const movieModel = {
  create,
  getAll,
  getById,
  getBySlug,
  remove,
  update,
  getAllSorted,
  getRandom,
};

export default movieModel;
