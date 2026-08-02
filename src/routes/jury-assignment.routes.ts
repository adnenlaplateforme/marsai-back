import { Router } from 'express';
import juryAssignmentController from '../controllers/jury-assignment.controller.js';
import { isAdmin } from '../middlewares/is-admin.js';
import { isLogged } from '../middlewares/is-logged.js';

const juryAssignmentRouter = Router();

// Toutes réservées à l'admin : c'est lui qui décide qui note quoi. Un juré qui
// pourrait se composer son propre lot, ou lire celui des autres, viderait
// l'attribution de son sens.
juryAssignmentRouter.post(
  '/',
  isLogged,
  isAdmin,
  juryAssignmentController.distribute,
);
juryAssignmentRouter.get(
  '/',
  isLogged,
  isAdmin,
  juryAssignmentController.findProgress,
);
juryAssignmentRouter.delete(
  '/',
  isLogged,
  isAdmin,
  juryAssignmentController.reset,
);

// Les ajustements à l'unité : rattraper un film accepté après l'attribution,
// ou déplacer un film d'un juré à l'autre (un retrait puis un ajout).
juryAssignmentRouter.post(
  '/:juryId/movies/:movieId',
  isLogged,
  isAdmin,
  juryAssignmentController.assign,
);
juryAssignmentRouter.delete(
  '/:juryId/movies/:movieId',
  isLogged,
  isAdmin,
  juryAssignmentController.unassign,
);

export default juryAssignmentRouter;
