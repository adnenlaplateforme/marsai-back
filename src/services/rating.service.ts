import movieModel from '../models/movie.model.js';
import ratingModel from '../models/rating.model.js';
import AppError from '../helpers/AppError.js';
import {
  JURY_RATABLE_STATUS,
  JURY_VISIBLE_STATUSES,
} from '../helpers/jury-visibility.js';
import type { RatingRequest } from '../types/schemas/rating-request.schema.js';
import type Rate from '../types/interfaces/rate.interface.js';
import type {
  MovieRatingAverage,
  MovieWithDirector,
  MovieWithRating,
} from '../types/interfaces/Movie.interface.js';

/**
 * Le film existe-t-il ?
 *
 * Le filtre de statut des listes du jury ne protège rien à lui seul : les
 * routes de notation prennent un id dans l'URL et n'ont aucune raison de faire
 * confiance à la liste dont il sort. Chacune doit rejouer la règle, d'où les
 * deux gardes ci-dessous.
 *
 * 403 et non 404 quand le statut ne convient pas : le film est public sur
 * `/movies/:id`, son existence n'est pas un secret — c'est bien un refus
 * d'accès, et le front peut l'expliquer.
 */
const getExistingMovie = async (id: number): Promise<MovieWithDirector> => {
  const movie = await movieModel.getById(id);
  if (!movie) {
    throw new AppError(404, 'Movie not found');
  }

  return movie;
};

/** Un film sur lequel le vote est encore ouvert. */
const getMovieRatableByJury = async (
  id: number,
): Promise<MovieWithDirector> => {
  const movie = await getExistingMovie(id);
  if (movie.status !== JURY_RATABLE_STATUS) {
    throw new AppError(403, 'Movie not open to jury rating');
  }

  return movie;
};

/**
 * Un film qu'un juré a le droit de consulter.
 *
 * Plus large que le précédent : après une sélection, le juré doit pouvoir
 * relire la note qu'il a posée, même s'il ne peut plus la changer.
 */
const getMovieVisibleToJury = async (
  id: number,
): Promise<MovieWithDirector> => {
  const movie = await getExistingMovie(id);
  if (!JURY_VISIBLE_STATUSES.includes(movie.status)) {
    throw new AppError(403, 'Movie not visible to jury');
  }

  return movie;
};

const rateMovieById = async (
  id: number,
  userId: number,
  ratingRequest: RatingRequest,
): Promise<void> => {
  const movie = await getMovieRatableByJury(id);

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
  const movie = await getExistingMovie(id);

  return await ratingModel.findAllByMovieId(movie.id!);
};

/**
 * Renvoie la note posée par le juré courant sur un film.
 *
 * Sert au front à savoir s'il doit proposer un formulaire vierge ou préremplir
 * la note existante : `rateMovieById` écrase une note déjà posée plutôt que
 * d'en créer une seconde. Le garde est celui de la consultation, pas celui de
 * la notation : une note reste lisible sur un film passé en sélection.
 */
const getCurrentJuryRatingByMovieId = async (
  id: number,
  userId: number,
): Promise<Rate> => {
  const movie = await getMovieVisibleToJury(id);

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
