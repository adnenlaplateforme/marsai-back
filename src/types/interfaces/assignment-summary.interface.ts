import type JuryAssignmentProgress from './jury-assignment-progress.interface.js';

/**
 * Le récapitulatif d'une attribution — ce qui a réellement été écrit, et non ce
 * que l'admin avait demandé.
 *
 * `perJury` vient de l'algorithme et non d'une relecture en base : c'est la même
 * information, et une requête de plus n'apprendrait rien.
 */
export default interface AssignmentSummary {
  movies: number;
  juries: number;
  assignments: number;
  perJury: { user_id: number; assigned: number }[];
}

/**
 * L'état de l'attribution servi au tableau de bord admin.
 *
 * `unassigned` compte les films acceptés sous le minimum de deux jurés. C'est
 * le seul endroit où un film accepté après l'attribution se signale : sans lui
 * il n'aurait aucun juré, et personne ne s'en apercevrait avant la
 * délibération.
 */
export interface AssignmentProgress {
  juries: JuryAssignmentProgress[];
  unassigned: number;
}
