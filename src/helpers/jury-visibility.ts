import { MovieStatus } from '../types/enums/movie-status.enum.js';

/**
 * Le seul statut de film ouvert au jury.
 *
 * Un juré ne délibère que sur les films retenus par l'admin : ni les
 * soumissions encore en attente (`pending_review`, `pending_change`), ni les
 * refus (`rejected`). `selected` et `winner` sont volontairement exclus eux
 * aussi — ce sont des décisions postérieures à la délibération, et un film qui
 * les porte n'a plus à être noté.
 *
 * Partagé entre `rating.model` (les listes du jury) et `rating.service` (la
 * pose d'une note) : c'est la même règle, elle ne doit exister qu'une fois.
 */
export const JURY_VISIBLE_STATUS = MovieStatus.ACCEPTED;
