import type { RequestHandler } from 'express';
import eventService from '../services/event.service.js';
import { parseId } from '../helpers/parse-id.js';

const create: RequestHandler = async (req, res, next) => {
  try {
    const id = await eventService.create(req.body);
    return res.status(201).json({ id });
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
      parseId(req.params.id, 'event'),
      lang as string,
    );
    return res.json(event);
  } catch (err) {
    next(err);
  }
};

const remove: RequestHandler = async (req, res, next) => {
  try {
    await eventService.remove(parseId(req.params.id, 'event'));
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
};

const update: RequestHandler = async (req, res, next) => {
  try {
    await eventService.update(parseId(req.params.id, 'event'), req.body);
    return res.status(200).send();
  } catch (err) {
    next(err);
  }
};

const getRemainingSeats: RequestHandler = async (req, res, next) => {
  try {
    const remainingSeats = await eventService.getRemainingSeats(
      parseId(req.params.id, 'event'),
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
