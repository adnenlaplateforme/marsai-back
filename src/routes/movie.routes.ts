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
// La liste de gestion des soumissions : tous les films, tous les statuts, y
// compris les refusés et ceux encore en attente. `isLogged` seul l'ouvrait au
// jury, qui ne doit voir que les films acceptés — il a `/to-rate` et `/rated`
// pour cela. La recherche publique de la galerie passe par `GET /movies`, pas
// par ici : la fermer ne l'affecte pas.
movieRouter.get('/sort', isLogged, isAdmin, movieController.getAllSorted);
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

// Les notes individuelles posées sur un film : la note, le commentaire et
// l'`user_id` de chaque juré. Même sensibilité que `/ratings/average`, en plus
// détaillé — la moyenne agrège, celle-ci nomme. N'avait aucun middleware : elle
// s'ouvrait à un visiteur anonyme en pleine délibération.
movieRouter.get('/:id/ratings', isLogged, isAdmin, ratingController.getRatings);

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
