import type { RequestHandler } from 'express';
import eventService from '../services/event.service.js';
import AppError from '../helpers/AppError.js';

/**
 * Convertit le paramètre :id en entier, ou rejette la requête.
 *
 * Sans cette garde, un id non numérique produit NaN. Les modèles qui passent
 * par db.query l'interpolent tel quel dans le SQL, où MySQL le prend pour un
 * nom de colonne : la route répondait alors 500 au lieu de 400.
 *
 * Number est préféré à parseInt, qui s'arrête au premier caractère non
 * numérique et ferait passer « 12abc » pour l'événement 12.
 */
const parseId = (value: unknown): number => {
  if (typeof value !== 'string') throw new AppError(400, 'Invalid event id');

  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw new AppError(400, 'Invalid event id');
  }
  return id;
};

const create: RequestHandler = async (req, res, next) => {
  try {
    await eventService.create(req.body);
    return res.status(201).send();
  } catch (err) {
    next(err);
  }
};

const findAll: RequestHandler = async (req, res, next) => {
  try {
    const { lang } = req.query;
    const events = await eventService.findAll(lang as string);
    return res.json(events);
  } catch (err) {
    next(err);
  }
};

const findById: RequestHandler = async (req, res, next) => {
  try {
    const { lang } = req.query;
    const event = await eventService.findById(
      parseId(req.params.id),
      lang as string,
    );
    return res.json(event);
  } catch (err) {
    next(err);
  }
};

const remove: RequestHandler = async (req, res, next) => {
  try {
    await eventService.remove(parseId(req.params.id));
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
};

const update: RequestHandler = async (req, res, next) => {
  try {
    await eventService.update(parseId(req.params.id), req.body);
    return res.status(200).send();
  } catch (err) {
    next(err);
  }
};

const getRemainingSeats: RequestHandler = async (req, res, next) => {
  try {
    const remainingSeats = await eventService.getRemainingSeats(
      parseId(req.params.id),
    );
    return res.json({ remainingSeats });
  } catch (err) {
    next(err);
  }
};

const eventController = {
  create,
  findAll,
  remove,
  update,
  findById,
  getRemainingSeats,
};

export default eventController;
