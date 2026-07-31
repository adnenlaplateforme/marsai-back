import type Jury from './jury.interface.js';

/**
 * L'avancement d'un juré dans la délibération : le nombre de films qu'il a
 * notés et sa dernière activité, ajoutés à son identité.
 *
 * `last_rated_at` est nul tant que le juré n'a rien noté — c'est le pendant de
 * `rated = 0`, pas une anomalie.
 */
export default interface JuryProgress extends Jury {
  rated: number;
  last_rated_at: Date | null;
}
