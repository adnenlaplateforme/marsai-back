import type { RequestHandler } from 'express';
import movieService from '../services/movie.service.js';
import { removeUploads } from '../helpers/remove-uploads.js';
import AppError from '../helpers/AppError.js';
import { parseId } from '../helpers/parse-id.js';

import movieUpdateService from '../services/movie-update.service.js';

/**
 * `search` est facultatif pour le client, mais obligatoire pour le modèle, qui
 * l'entoure de `%` sans le vérifier. Absent, la concaténation donnait
 * `'%undefined%'` : la liste sortait vide alors que la base contenait des
 * films, et le front devait envoyer un `search=` vide pour voir quoi que ce
 * soit. Une chaîne vide donne `'%%'`, qui laisse tout passer.
 *
 * Le type d'Express admet aussi un tableau (`?search=a&search=b`) : la chaîne
 * vide est plus honnête que la concaténation qu'en ferait le modèle.
 */
const parseSearch = (value: unknown): string =>
  typeof value === 'string' ? value : '';

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
      parseSearch(search),
    );
    return res.send(response);
  } catch (e) {
    next(e);
  }
};

const remove: RequestHandler = async (req, res, next) => {
  try {
    await movieService.remove(parseId(req.params.id, 'movie'));

    return res.status(204).json({ message: 'film delete with success.' });
  } catch (e) {
    next(e);
  }
};

const getById: RequestHandler = async (req, res, next) => {
  try {
    const response = await movieService.getById(
      parseId(req.params.id, 'movie'),
    );
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
    const idAsInt = parseId(req.params.id, 'movie');
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
      parseSearch(search),
    );
    return res.send(response);
  } catch (e) {
    next(e);
  }
};

const adminUpdate: RequestHandler = async (req, res, next) => {
  try {
    if (!req.body) throw new AppError(400, 'Request body is required');
    const response = await movieService.adminUpdate(
      parseId(req.params.id, 'movie'),
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
