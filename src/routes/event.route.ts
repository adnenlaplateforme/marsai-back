import express from 'express';
import { validate } from '../middlewares/validate.js';
import eventController from '../controllers/event.controller.js';
import { isLogged } from '../middlewares/is-logged.js';
import { isAdmin } from '../middlewares/is-admin.js';
import { CreateEventRequestSchema } from '../types/schemas/create-event-request.schema.js';
import { UpdateEventRequestSchema } from '../types/schemas/update-event-request.schema.js';

const eventRouter = express.Router();

eventRouter.post(
  '/',
  validate(CreateEventRequestSchema),
  isLogged,
  isAdmin,
  eventController.create,
);

eventRouter.get('/', eventController.findAll);

eventRouter.put(
  '/:id',
  validate(UpdateEventRequestSchema),
  isLogged,
  isAdmin,
  eventController.update,
);

eventRouter.delete('/:id', isLogged, isAdmin, eventController.remove);

eventRouter.get('/:id/remaining-seats', eventController.getRemainingSeats);

eventRouter.get('/:id', eventController.findById);

export default eventRouter;
