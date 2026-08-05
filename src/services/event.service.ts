import eventModel from '../models/event.model.js';
import type { CreateEventRequest } from '../types/schemas/create-event-request.schema.js';
import type { UpdateEventRequest } from '../types/schemas/update-event-request.schema.js';
import type { Event } from '../types/interfaces/event.interface.js';
import AppError from '../helpers/AppError.js';
import { generateUniqueSlug } from '../helpers/string-utils.js';

const create = async (body: CreateEventRequest): Promise<number> => {
  if (!body.slug) {
    body.slug = await generateUniqueSlug(body.title, async (slug) => {
      const exists = await eventModel.findBySlug(slug);
      return !!exists;
    });
  }
  return await eventModel.create(body);
};

const findAll = async (lang?: string): Promise<Event[]> => {
  return eventModel.findAll(lang);
};

const findById = async (id: number, lang?: string): Promise<Event> => {
  const event = await eventModel.findById(id, lang);
  if (!event) throw new AppError(404, 'Event not found');
  return event;
};

const getRemainingSeats = async (id: number): Promise<number> => {
  const seats = await eventModel.getRemainingSeats(id);
  if (seats === null) throw new AppError(404, 'Event not found');
  return seats;
};

const remove = async (id: number): Promise<void> => {
  const affectedRows = await eventModel.remove(id);
  if (affectedRows === 0) throw new AppError(404, 'Event not found');
};

/**
 * L'existence est vérifiée d'abord, et le 404 n'est plus déduit du nombre de
 * lignes modifiées : MySQL ne compte que les lignes *changées*, si bien qu'un
 * formulaire d'édition renvoyant des valeurs identiques recevait « Event not
 * found » alors que l'événement était bien là.
 */
const update = async (id: number, event: UpdateEventRequest): Promise<void> => {
  const exists = await eventModel.existsById(id);
  if (!exists) throw new AppError(404, 'Event not found');

  if (event.title && !event.slug) {
    event.slug = await generateUniqueSlug(event.title, async (slug) => {
      const existing = await eventModel.findBySlug(slug);
      return !!existing && existing.id !== id;
    });
  }
  await eventModel.update(id, event);
};

const eventService = {
  create,
  findAll,
  update,
  remove,
  findById,
  getRemainingSeats,
};

export default eventService;
