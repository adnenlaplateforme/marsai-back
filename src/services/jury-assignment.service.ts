import AppError from '../helpers/AppError.js';
import { isMysqlError } from '../helpers/is-mysql-error.js';
import {
  assignJuries,
  MIN_JURIES_PER_MOVIE,
} from '../helpers/assign-juries.js';
import { JURY_RATABLE_STATUS } from '../helpers/jury-visibility.js';
import juryAssignmentModel from '../models/jury-assignment.model.js';
import juryModel from '../models/jury.model.js';
import movieModel from '../models/movie.model.js';
import type {
  AssignmentProgress,
  default as AssignmentSummary,
} from '../types/interfaces/assignment-summary.interface.js';

/**
 * Lance l'attribution des films aux jurés.
 *
 * Acte unique : l'admin la déclenche une fois, après avoir fini de juger les
 * soumissions. Un second appel est refusé plutôt que d'écraser des lots sur
 * lesquels les jurés ont déjà commencé à travailler — la remise à zéro reste
 * possible, mais c'est un geste conscient.
 */
const distribute = async (): Promise<AssignmentSummary> => {
  if ((await juryAssignmentModel.count()) > 0) {
    throw new AppError(
      409,
      'Films already assigned, reset the assignments first',
    );
  }

  const movieIds = await juryAssignmentModel.findAssignableMovieIds();
  const juries = await juryModel.findAll();

  if (juries.length < MIN_JURIES_PER_MOVIE) {
    throw new AppError(
      422,
      `At least ${MIN_JURIES_PER_MOVIE} juries are required to assign movies`,
    );
  }

  if (movieIds.length === 0) {
    throw new AppError(422, 'No accepted movie to assign');
  }

  const juryIds = juries.map((jury) => jury.id);
  const assignments = assignJuries({ movieIds, juryIds });

  try {
    await juryAssignmentModel.createMany(assignments);
  } catch (err) {
    // Deux requêtes simultanées lisent toutes deux « rien d'attribué » avant
    // que l'une n'ait inséré : la contrainte UNIQUE arrête la seconde. Le refus
    // est le même que celui du compte plus haut, l'admin n'a pas à distinguer.
    if (isMysqlError(err) && err.errno === 1062) {
      throw new AppError(
        409,
        'Films already assigned, reset the assignments first',
      );
    }
    throw err;
  }

  return {
    movies: movieIds.length,
    juries: juries.length,
    assignments: assignments.length,
    perJury: juryIds.map((userId) => ({
      user_id: userId,
      assigned: assignments.filter((a) => a.userId === userId).length,
    })),
  };
};

/**
 * L'avancement de chaque juré, plus le nombre de films acceptés qui n'ont pas
 * atteint le minimum de deux jurés.
 *
 * Les deux vont ensemble : sans `unassigned`, un film accepté après
 * l'attribution n'aurait aucun juré et rien ne le signalerait à l'admin.
 */
const findProgress = async (): Promise<AssignmentProgress> => {
  const juries = await juryAssignmentModel.findProgress();
  const unassigned = await juryAssignmentModel.countUnassignedMovies();

  return { juries, unassigned };
};

/** Remet l'attribution à zéro. Les notes déjà posées ne sont pas touchées. */
const reset = async (): Promise<number> => {
  return await juryAssignmentModel.deleteAll();
};

/**
 * Confie un film à un juré, à l'unité — le rattrapage d'un film accepté après
 * l'attribution, ou un ajustement de l'admin.
 *
 * `juryModel.findById` filtre sur le rôle : un id d'administrateur en sort nul.
 * La clé étrangère, elle, n'y verrait qu'un `user` valide et accepterait
 * l'insertion.
 */
const assign = async (juryId: number, movieId: number): Promise<void> => {
  const jury = await juryModel.findById(juryId);
  if (!jury) {
    throw new AppError(404, 'Jury not found');
  }

  const movie = await movieModel.getById(movieId);
  if (!movie) {
    throw new AppError(404, 'Movie not found');
  }

  // Un film hors du statut notable remplirait la file du juré d'une entrée que
  // `POST /movies/:id/ratings` refuse : un lot faux plutôt qu'une erreur.
  if (movie.status !== JURY_RATABLE_STATUS) {
    throw new AppError(422, 'Only accepted movies can be assigned');
  }

  try {
    await juryAssignmentModel.create(juryId, movieId);
  } catch (err) {
    if (isMysqlError(err) && err.errno === 1062) {
      throw new AppError(409, 'Movie already assigned to this jury');
    }
    throw err;
  }
};

/**
 * Retire un film de la file d'un juré.
 *
 * Le 404 sur une ligne absente n'est pas du zèle : sans lui, l'admin qui se
 * trompe de juré reçoit un succès et croit avoir agi sur le bon lot.
 */
const unassign = async (juryId: number, movieId: number): Promise<void> => {
  const removed = await juryAssignmentModel.remove(juryId, movieId);

  if (removed === 0) {
    throw new AppError(404, 'Assignment not found');
  }
};

const juryAssignmentService = {
  distribute,
  findProgress,
  reset,
  assign,
  unassign,
};

export default juryAssignmentService;
