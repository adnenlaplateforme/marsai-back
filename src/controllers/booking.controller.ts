import type { RequestHandler } from 'express';
import bookingService from '../services/booking.service.js';
import participantService from '../services/participant.service.js';
import { type BookingRequest } from '../types/schemas/booking-request.schema.js';
import { parseId } from '../helpers/parse-id.js';

const create: RequestHandler = async (req, res, next) => {
  try {
    const { eventId, firstname, lastname, email } = req.body as BookingRequest;

    const participant = await participantService.findOrCreate(
      firstname,
      lastname,
      email,
    );

    const bookingId = await bookingService.create(eventId, participant.id);
    res.status(201).json({ id: bookingId });
  } catch (error) {
    next(error);
  }
};

const unsubscribe: RequestHandler<{ token: string }> = async (
  req,
  res,
  next,
) => {
  try {
    const { token } = req.params;
    await bookingService.unsubscribe(token);
    res.status(200).send('You have been unsubscribed');
  } catch (error) {
    next(error);
  }
};

const findByEvent: RequestHandler = async (req, res, next) => {
  try {
    const bookings = await bookingService.findByEventId(
      parseId(req.params.id, 'event'),
    );
    return res.json(bookings);
  } catch (error) {
    next(error);
  }
};

const stats: RequestHandler = async (_req, res, next) => {
  try {
    return res.json(await bookingService.getStats());
  } catch (error) {
    next(error);
  }
};

const bookingController = { create, findByEvent, stats, unsubscribe };
export default bookingController;
