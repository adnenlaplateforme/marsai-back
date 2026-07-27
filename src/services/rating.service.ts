import movieModel from '../models/movie.model.js';
import ratingModel from '../models/rating.model.js';
import AppError from '../helpers/AppError.js';
import type { RatingRequest } from '../types/schemas/rating-request.schema.js';
import type Rate from '../types/interfaces/rate.interface.js';
import type {
  MovieWithDirector,
  MovieWithRating,
} from '../types/interfaces/Movie.interface.js';

const rateMovieById = async (
  id: number,
  userId: number,
  ratingRequest: RatingRequest,
): Promise<void> => {
  const movie = await movieModel.getById(id);
  if (!movie) {
    throw new AppError(404, 'Movie not found');
  }

  const existingRating = await ratingModel.getByMovieIdAndUserId(
    userId,
    movie.id!,
  );

  if (existingRating) {
    await ratingModel.update(
      userId,
      movie.id!,
      ratingRequest.note,
      ratingRequest.comment,
    );
  } else {
    await ratingModel.create(
      userId,
      movie.id!,
      ratingRequest.note,
      ratingRequest.comment,
    );
  }
};

const getRatingsByMovieId = async (id: number): Promise<Rate[]> => {
  const movie = await movieModel.getById(id);
  if (!movie) {
    throw new AppError(404, 'Movie not found');
  }

  return await ratingModel.findAllByMovieId(movie.id!);
};

/**
 * Renvoie la note posée par le juré courant sur un film.
 *
 * Sert au front à savoir s'il doit proposer un formulaire vierge ou préremplir
 * la note existante : `rateMovieById` écrase une note déjà posée plutôt que
 * d'en créer une seconde.
 */
const getCurrentJuryRatingByMovieId = async (
  id: number,
  userId: number,
): Promise<Rate> => {
  const movie = await movieModel.getById(id);
  if (!movie) {
    throw new AppError(404, 'Movie not found');
  }

  const rating = await ratingModel.getByMovieIdAndUserId(userId, movie.id!);
  if (!rating) {
    throw new AppError(404, 'Rating not found');
  }

  return rating;
};

const getRatedMoviesByJury = async (
  userId: number,
): Promise<MovieWithRating[]> => {
  return await ratingModel.findRatedMoviesByUserId(userId);
};

const getMoviesToRateByJury = async (
  userId: number,
): Promise<MovieWithDirector[]> => {
  return await ratingModel.findMoviesToRateByUserId(userId);
};

const ratingService = {
  rateMovieById,
  getRatingsByMovieId,
  getCurrentJuryRatingByMovieId,
  getRatedMoviesByJury,
  getMoviesToRateByJury,
};

export default ratingService;
