import { Router } from 'express';
import bookingController from '../controllers/booking.controller.js';
import { validate } from '../middlewares/validate.js';
import { isAdmin } from '../middlewares/is-admin.js';
import { isLogged } from '../middlewares/is-logged.js';
import { BookingRequestSchema } from '../types/schemas/booking-request.schema.js';

const router = Router();

router.post('/', validate(BookingRequestSchema), bookingController.create);

router.get('/stats', isLogged, isAdmin, bookingController.stats);

router.get('/unsubscribe/:token', bookingController.unsubscribe);

export default router;
