import { MovieStatus } from '../types/enums/movie-status.enum.js';

/**
 * Le seul statut sur lequel un juré peut poser ou modifier une note.
 *
 * Ni les soumissions en attente (`pending_review`, `pending_change`), ni les
 * refus (`rejected`), ni les décisions postérieures à la délibération
 * (`selected`, `winner`) : sur celles-ci, le vote est clos.
 */
export const JURY_RATABLE_STATUS = MovieStatus.ACCEPTED;

/**
 * Les statuts qu'un juré peut consulter — plus larges que ceux qu'il peut
 * noter.
 *
 * `selected` et `winner` viennent *après* l'acceptation : un film que le jury a
 * noté et que l'admin promeut ensuite doit rester dans sa liste « Notés », avec
 * sa note, sinon son historique rétrécit à chaque décision de l'admin. Il n'y
 * est plus que consultable — la notation, elle, se ferme.
 *
 * L'ordre compte peu, mais l'ensemble est délibérément fermé : un nouveau
 * statut n'est pas visible par défaut, il faut l'ajouter ici.
 */
export const JURY_VISIBLE_STATUSES: MovieStatus[] = [
  MovieStatus.ACCEPTED,
  MovieStatus.SELECTED,
  MovieStatus.WINNER,
];
