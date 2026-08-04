import bookingModel from '../models/booking.model.js';
import AppError from '../helpers/AppError.js';
import emailService from './email.service.js';
import eventModel from '../models/event.model.js';
import participantModel from '../models/participant.model.js';
import jwtService from './jwt.service.js';
import type TokenPayload from '../types/interfaces/token-payload.interface.js';
import type { EventBooking } from '../types/interfaces/booking.interface.js';

const create = async (
  eventId: number,
  participantId: number,
): Promise<number> => {
  const event = await eventModel.findById(eventId);
  if (!event) {
    throw new AppError(404, 'Event not found');
  }

  if (!event.is_bookable) {
    throw new AppError(400, 'This event is not bookable');
  }

  const participantCount = await bookingModel.countByEventId(eventId);
  if (participantCount >= event.capacity) {
    throw new AppError(409, 'Event is full');
  }

  const existingBooking = await bookingModel.findByParticipantAndEvent(
    participantId,
    eventId,
  );

  if (existingBooking) {
    throw new AppError(409, 'Participant is already registered for this event');
  }

  const bookingId = await bookingModel.create(eventId, participantId);

  const participant = await participantModel.findById(participantId);

  if (participant) {
    const token = jwtService.signSubscribeEventToken({ id: bookingId });
    await emailService.sendMailSubscribeEvent(
      participant.email,
      event.title,
      event.description,
      token,
    );
  }

  return bookingId;
};

/**
 * Les participants d'un événement.
 *
 * L'existence est vérifiée avant la liste : sans cela, un identifiant erroné
 * rendrait un tableau vide, que l'administration lirait comme « personne n'est
 * inscrit » alors que l'événement n'existe pas.
 */
const findByEventId = async (eventId: number): Promise<EventBooking[]> => {
  const exists = await eventModel.existsById(eventId);
  if (!exists) throw new AppError(404, 'Event not found');

  return await bookingModel.findByEventId(eventId);
};

const getStats = async (): Promise<{ total: number; today: number }> => {
  return await bookingModel.countTotals();
};

const unsubscribe = async (token: string): Promise<number> => {
  // Le lien de désinscription vient d'un email et vit 7 jours : un token
  // expiré ou trafiqué est une erreur d'appelant, pas une erreur serveur.
  let payload: TokenPayload;
  try {
    payload = jwtService.verify(token);
  } catch {
    throw new AppError(400, 'Invalid or expired token');
  }

  return await bookingModel.remove(payload.id);
};

const bookingService = { create, findByEventId, getStats, unsubscribe };

export default bookingService;
