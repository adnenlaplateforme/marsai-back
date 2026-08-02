import type { RequestHandler } from 'express';
import { parseId } from '../helpers/parse-id.js';
import juryAssignmentService from '../services/jury-assignment.service.js';

/**
 * Lance l'attribution. 201 et non 200 : l'appel crée des lignes, et le corps de
 * la réponse décrit ce qui a réellement été écrit.
 */
const distribute: RequestHandler = async (_req, res, next) => {
  try {
    const summary = await juryAssignmentService.distribute();
    res.status(201).send(summary);
  } catch (e) {
    next(e);
  }
};

const findProgress: RequestHandler = async (_req, res, next) => {
  try {
    const progress = await juryAssignmentService.findProgress();
    res.send(progress);
  } catch (e) {
    next(e);
  }
};

const reset: RequestHandler = async (_req, res, next) => {
  try {
    await juryAssignmentService.reset();
    res.status(204).send();
  } catch (e) {
    next(e);
  }
};

const assign: RequestHandler = async (req, res, next) => {
  try {
    const juryId = parseId(req.params.juryId, 'jury');
    const movieId = parseId(req.params.movieId, 'movie');

    await juryAssignmentService.assign(juryId, movieId);
    res.status(201).send();
  } catch (e) {
    next(e);
  }
};

const unassign: RequestHandler = async (req, res, next) => {
  try {
    const juryId = parseId(req.params.juryId, 'jury');
    const movieId = parseId(req.params.movieId, 'movie');

    await juryAssignmentService.unassign(juryId, movieId);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
};

const juryAssignmentController = {
  distribute,
  findProgress,
  reset,
  assign,
  unassign,
};

export default juryAssignmentController;
