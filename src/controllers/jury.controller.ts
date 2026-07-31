import type { RequestHandler } from 'express';
import juryService from '../services/jury.service.js';

const create: RequestHandler = async (req, res, next) => {
  try {
    await juryService.create(req.body);
    res.status(201).send();
  } catch (e) {
    next(e);
  }
};

const findAll: RequestHandler = async (_req, res, next) => {
  try {
    const juries = await juryService.findAll();
    res.send(juries);
  } catch (e) {
    next(e);
  }
};

const findProgress: RequestHandler = async (_req, res, next) => {
  try {
    const progress = await juryService.findProgress();
    res.send(progress);
  } catch (e) {
    next(e);
  }
};

const juryController = { findAll, findProgress, create };

export default juryController;
