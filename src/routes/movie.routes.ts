import express from 'express';
import movieController from '../controllers/movie.controller.js';
import ratingController from '../controllers/rating.controller.js';
import { isLogged } from '../middlewares/is-logged.js';
import { isAdmin } from '../middlewares/is-admin.js';
import { isJury } from '../middlewares/is-jury.js';
import { validate } from '../middlewares/validate.js';
import { MovieRequestSchema } from '../types/schemas/MovieRequest.schema.js';
import { UpdateMovieRequestSchema } from '../types/schemas/update-movie-request.js';
import { RatingRequestSchema } from '../types/schemas/rating-request.schema.js';
import { upload } from '../middlewares/upload.js';
import { validateParamsAndQuery } from '../middlewares/validate-all.js';
import { RandomMovieRequestSchema } from '../types/schemas/random-movie-schema.js';

const movieRouter = express.Router();

movieRouter.get('/', movieController.getAll);
movieRouter.get('/sort', isLogged, movieController.getAllSorted);
movieRouter.get(
  '/random',
  validateParamsAndQuery(RandomMovieRequestSchema),
  movieController.getRandom,
);
// Déclarées avant `/:id` : ce sont des segments uniques, la route paramétrée
// les capterait sinon avec un id valant « rated » ou « to-rate ».
movieRouter.get('/rated', isLogged, isJury, ratingController.getRatedMovies);
movieRouter.get('/to-rate', isLogged, isJury, ratingController.getMoviesToRate);

// Le palmarès en cours de délibération : réservé à l'admin, un juré ne doit pas
// voir les moyennes avant d'avoir posé les siennes.
movieRouter.get(
  '/ratings/average',
  isLogged,
  isAdmin,
  ratingController.getRatingAverages,
);

movieRouter.post(
  '/',
  upload,
  validate(MovieRequestSchema),
  movieController.create,
);

movieRouter.post(
  '/:id/ratings',
  isLogged,
  isJury,
  validate(RatingRequestSchema),
  ratingController.rateMovie,
);

movieRouter.get('/:id/ratings', ratingController.getRatings);

movieRouter.get(
  '/:id/ratings/me',
  isLogged,
  isJury,
  ratingController.getMyRating,
);

movieRouter.delete('/:id', isLogged, isAdmin, movieController.remove);
movieRouter.put('/:id', isLogged, isAdmin, movieController.adminUpdate);
movieRouter.patch(
  '/:id',
  upload,
  validate(UpdateMovieRequestSchema),
  movieController.update,
);
movieRouter.get('/:id', movieController.getById);

export default movieRouter;
