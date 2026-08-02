/** Un film confié à un juré — une ligne de `jury_assignment`. */
export interface JuryAssignment {
  userId: number;
  movieId: number;
}

export interface AssignJuriesInput {
  movieIds: number[];
  juryIds: number[];
}

/**
 * Le plancher fixé par le festival : un film est jugé sur au moins deux avis.
 */
export const MIN_JURIES_PER_MOVIE = 2;

/**
 * Combien de jurés reçoit chaque film.
 *
 * Deux au minimum, davantage quand les jurés sont plus nombreux que les places
 * que ce plancher créerait : sans ça, un juré n'aurait aucun film à noter. En
 * production (des centaines de films, une poignée de jurés) le rapport est
 * toujours inférieur à 1 et la valeur retombe sur le plancher de deux.
 *
 * Plafonné au nombre de jurés : un film ne peut pas être confié deux fois au
 * même juré, la contrainte UNIQUE de `jury_assignment` le refuserait.
 */
const juriesPerMovieFor = (movieCount: number, juryCount: number): number => {
  const spread = Math.ceil(juryCount / movieCount);
  return Math.min(Math.max(MIN_JURIES_PER_MOVIE, spread), juryCount);
};

/**
 * Répartit les films entre les jurés.
 *
 * Glouton du moins chargé : chaque film part chez les jurés qui ont le moins de
 * films à cet instant. C'est ce qui garantit l'équilibre — servir les jurés
 * dans l'ordre donnerait tout aux premiers et rien aux derniers. L'écart de
 * charge final ne dépasse jamais une unité.
 *
 * L'égalité se tranche sur l'id, pour que deux appels sur les mêmes données
 * donnent le même résultat : un algorithme d'attribution qu'on ne peut pas
 * rejouer à l'identique est intestable.
 *
 * Fonction pure : elle n'écrit rien, elle décrit les lignes à insérer. Les
 * films et les jurés sont lus en base par le service, l'écriture s'y fait en
 * transaction.
 */
export const assignJuries = ({
  movieIds,
  juryIds,
}: AssignJuriesInput): JuryAssignment[] => {
  const perMovie = juriesPerMovieFor(movieIds.length, juryIds.length);
  const load = new Map<number, number>(juryIds.map((id) => [id, 0]));
  const assignments: JuryAssignment[] = [];

  for (const movieId of movieIds) {
    const leastLoaded = [...load.entries()]
      .sort(([idA, loadA], [idB, loadB]) => loadA - loadB || idA - idB)
      .slice(0, perMovie);

    for (const [userId] of leastLoaded) {
      assignments.push({ userId, movieId });
      load.set(userId, (load.get(userId) ?? 0) + 1);
    }
  }

  return assignments;
};
