import type MovieResponse from '../types/interfaces/MovieResponse.interface.js';
import movieModel from '../models/movie.model.js';
import type {
  AdminMovieRequest,
  MovieRequest,
} from '../types/schemas/MovieRequest.schema.js';
import type { UpdateMovieRequest } from '../types/schemas/update-movie-request.js';
import { generateUniqueSlug } from '../helpers/string-utils.js';
import type Movie from '../types/interfaces/Movie.interface.js';
import db from '../database/connection.js';
import collaboratorModel from '../models/collaborator.model.js';
import imageModel from '../models/image.model.js';
import AppError from '../helpers/AppError.js';
import type { MovieFindAllResponse } from '../types/interfaces/MovieFindAllResponse.interface.js';
import emailService from './email.service.js';
import movieUpdateModel from '../models/movie_update.model.js';

const create = async (movieRequest: MovieRequest): Promise<MovieResponse> => {
  try {
    await db.beginTransaction();
    const slug = await generateUniqueSlug(
      movieRequest.originalTitle,
      async (slug) => {
        const exists = await movieModel.getBySlug(slug);
        return !!exists;
      },
    );
    const movieId = await movieModel.create({ ...movieRequest, slug });
    await collaboratorModel.createDirector(movieRequest.director, movieId);
    await collaboratorModel.create(movieRequest.collaborators, movieId);
    await imageModel.insertMultiple(movieRequest.stillsUrls, movieId);
    await db.commit();
    const response: MovieResponse = {
      movieId: movieId,
    };
    return response;
  } catch (err) {
    console.error(err);
    await db.rollback();
    throw err;
  }
};
const getAll = async (
  page: number,
  type: string,
  search: string,
): Promise<MovieFindAllResponse> => {
  return await movieModel.getAll(page, type, search);
};

const getById = async (id: number): Promise<Movie> => {
  const movie = await movieModel.getById(id);
  if (!movie) throw new AppError(404, 'film not found');
  return movie;
};

const remove = async (id: number): Promise<void> => {
  try {
    await db.beginTransaction();
    await collaboratorModel.remove(id);
    await imageModel.remove(id);

    const affectedRows = await movieModel.remove(id);

    if (affectedRows === 0) {
      throw new AppError(404, 'film not found');
    }

    await db.commit();
  } catch (err) {
    console.error(err);
    await db.rollback();
    throw err;
  }
};
const update = async (
  id: number,
  movieRequest: UpdateMovieRequest,
  token: string,
): Promise<number> => {
  const { stillsUrls, ...rest } = movieRequest;
  if (rest.originalTitle) {
    const slug = await generateUniqueSlug(rest.originalTitle, async (slug) => {
      const existing = await movieModel.getBySlug(slug);
      return !!existing && existing.id !== id;
    });
    rest.slug = slug;
  }
  const affectedRows = await movieModel.update(
    id,
    rest as Partial<MovieRequest>,
  );
  if (stillsUrls && stillsUrls.length > 0) {
    await imageModel.remove(id);
    await imageModel.insertMultiple(stillsUrls, id);
  }
  await movieUpdateModel.deleteByToken(token);
  return affectedRows;
};

const getAllSorted = async (
  page: number,
  sort: string,
  order: string,
  onlyDrafts: boolean,
  search: string,
): Promise<MovieFindAllResponse> => {
  return await movieModel.getAllSorted(page, sort, order, onlyDrafts, search);
};

const adminUpdate = async (
  id: number,
  movieRequest: AdminMovieRequest,
): Promise<number> => {
  const { adminData, ...request } = movieRequest;
  const movie = await movieModel.getById(id);
  if (!movie) throw new AppError(404, 'film not found');
  if (adminData) {
    switch (adminData.adminStatus) {
      case 'pending_change': {
        const token = crypto.randomUUID() as string;
        await emailService.statusUpdatePendingMail(adminData, movie, token);
        await movieUpdateModel.create(movie.id!, token);
        break;
      }
      case 'rejected':
      case 'accepted':
      case 'selected':
      case 'winner':
        await emailService.statusUpdateMail(adminData, movie);
        break;
      default:
        throw new AppError(400, `wrong movie status`);
    }
  }

  const affectedRows = await movieModel.update(id, request);
  return affectedRows;
};

const getRandom = async (qt: number) => {
  const movies = await movieModel.getRandom(qt);
  if (!movies) throw new AppError(404, 'film not found');
  return movies;
};

const movieService = {
  create,
  getAll,
  getById,
  remove,
  update,
  getAllSorted,
  adminUpdate,
  getRandom,
};

export default movieService;
