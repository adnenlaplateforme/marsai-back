import type { RequestHandler } from 'express';
import movieService from '../services/movie.service.js';
import { removeUploads } from '../helpers/remove-uploads.js';
import AppError from '../helpers/AppError.js';

import movieUpdateService from '../services/movie-update.service.js';

const create: RequestHandler = async (req, res, next) => {
  try {
    console.info(req.body);
    const response = await movieService.create(req.body);
    return res.status(201).send(response);
  } catch (e) {
    await removeUploads(req);
    next(e);
  }
};

const getAll: RequestHandler = async (req, res, next) => {
  try {
    const { page, type, search } = req.query;
    const pageAsInt = parseInt(page as string);
    if (
      isNaN(pageAsInt) ||
      pageAsInt <= 0 ||
      ((type as string) !== 'fullai' &&
        (type as string) !== 'hybrid' &&
        (type as string) !== 'all')
    ) {
      throw new AppError(400, 'Wrong query params');
    }
    const response = await movieService.getAll(
      pageAsInt,
      type as string,
      search as string,
    );
    return res.send(response);
  } catch (e) {
    next(e);
  }
};

const remove: RequestHandler = async (req, res, next) => {
  try {
    const movieId = Number(req.params.id);
    await movieService.remove(movieId);

    return res.status(204).json({ message: 'film delete with success.' });
  } catch (e) {
    next(e);
  }
};

const getById: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    const idAsInt = parseInt(id as string);
    if (isNaN(idAsInt) || idAsInt <= 0) {
      throw new AppError(400, 'Wrong query params');
    }
    const response = await movieService.getById(idAsInt);
    return res.send(response);
  } catch (e) {
    next(e);
  }
};

const update: RequestHandler = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;
    if (!token)
      throw new AppError(400, 'Token missing from Authorization header');

    const movieId = (await movieUpdateService.getByToken(token))
      .movie_id as number;
    const { id } = req.params;
    const idAsInt = parseInt(id as string);
    if (movieId !== idAsInt) throw new AppError(400, 'Invalid token');

    const response = await movieService.update(idAsInt, req.body, token);
    return res.status(200).send(response);
  } catch (e) {
    next(e);
  }
};

const getAllSorted: RequestHandler = async (req, res, next) => {
  try {
    const { page, sort, order, onlyDrafts, search } = req.query;
    const pageAsInt = parseInt(page as string);

    if (
      isNaN(pageAsInt) ||
      pageAsInt <= 0 ||
      ((order as string) !== 'ASC' && (order as string) !== 'DESC') ||
      ((sort as string) !== 'id' &&
        (sort as string) !== 'english_title' &&
        (sort as string) !== 'submitted_at' &&
        (sort as string) !== 'c.lastname' &&
        (sort as string) !== 'status') ||
      ((onlyDrafts as string) !== 'true' && (onlyDrafts as string) !== 'false')
    ) {
      throw new AppError(400, 'Wrong query params');
    }
    const onlyDraftsAsBool: boolean = onlyDrafts === 'true' ? true : false;
    const response = await movieService.getAllSorted(
      pageAsInt,
      sort as string,
      order as string,
      onlyDraftsAsBool,
      search as string,
    );
    return res.send(response);
  } catch (e) {
    next(e);
  }
};

const adminUpdate: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!req.body) throw new AppError(400, 'Request body is required');
    const response = await movieService.adminUpdate(
      parseInt(id as string),
      req.body,
    );
    return res.status(200).send(response);
  } catch (e) {
    next(e);
  }
};

const getRandom: RequestHandler = async (req, res, next) => {
  try {
    const { qt } = req.query;
    const qtAsInt = parseInt(qt as string);
    const response = await movieService.getRandom(qtAsInt);
    return res.send(response);
  } catch (e) {
    next(e);
  }
};

const movieController = {
  getAll,
  getById,
  create,
  remove,
  update,
  getAllSorted,
  adminUpdate,
  getRandom,
};

export default movieController;
