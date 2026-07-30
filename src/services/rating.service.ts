import movieModel from '../models/movie.model.js';
import ratingModel from '../models/rating.model.js';
import AppError from '../helpers/AppError.js';
import { JURY_VISIBLE_STATUS } from '../helpers/jury-visibility.js';
import type { RatingRequest } from '../types/schemas/rating-request.schema.js';
import type Rate from '../types/interfaces/rate.interface.js';
import type {
  MovieRatingAverage,
  MovieWithDirector,
  MovieWithRating,
} from '../types/interfaces/Movie.interface.js';

/**
 * Le film existe-t-il, et est-il ouvert au jury ?
 *
 * Le filtre de statut des listes du jury ne protège rien à lui seul : les
 * routes de notation prennent un id dans l'URL et n'ont aucune raison de faire
 * confiance à la liste dont il sort. Les deux doivent appliquer la même règle.
 *
 * 403 et non 404 : le film est public sur `/movies/:id`, son existence n'est
 * pas un secret — c'est bien un refus d'accès, et le front peut l'expliquer.
 */
const getMovieOpenToJury = async (id: number): Promise<MovieWithDirector> => {
  const movie = await movieModel.getById(id);
  if (!movie) {
    throw new AppError(404, 'Movie not found');
  }
  if (movie.status !== JURY_VISIBLE_STATUS) {
    throw new AppError(403, 'Movie not open to jury rating');
  }

  return movie;
};

const rateMovieById = async (
  id: number,
  userId: number,
  ratingRequest: RatingRequest,
): Promise<void> => {
  const movie = await getMovieOpenToJury(id);

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
  const movie = await getMovieOpenToJury(id);

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

/**
 * Le classement des films par moyenne des notes du jury, réservé à l'admin :
 * il révèle le palmarès en cours de délibération, qu'un juré ne doit pas voir.
 */
const getMoviesRatingAverage = async (): Promise<MovieRatingAverage[]> => {
  return await ratingModel.findMoviesWithRatingAverage();
};

const ratingService = {
  rateMovieById,
  getRatingsByMovieId,
  getCurrentJuryRatingByMovieId,
  getRatedMoviesByJury,
  getMoviesToRateByJury,
  getMoviesRatingAverage,
};

export default ratingService;
