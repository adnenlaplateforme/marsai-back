// L'attribution est de l'arithmétique pure : aucune base, aucun mock. C'est
// précisément la partie qu'un test d'intégration couvrirait mal — l'équilibrage
// des charges ne se lit pas dans une réponse HTTP, alors qu'ici on peut
// l'énumérer exhaustivement.
import { describe, it, expect } from 'vitest';
import { assignJuries } from './assign-juries.js';
import type { JuryAssignment } from './assign-juries.js';

/** Le nombre de jurés attribués à chaque film. */
const juriesPerMovie = (assignments: JuryAssignment[]): Map<number, number> => {
  const counts = new Map<number, number>();
  for (const { movieId } of assignments) {
    counts.set(movieId, (counts.get(movieId) ?? 0) + 1);
  }
  return counts;
};

/** Le nombre de films confiés à chaque juré, dans l'ordre des `juryIds`. */
const loadPerJury = (
  assignments: JuryAssignment[],
  juryIds: number[],
): number[] =>
  juryIds.map((id) => assignments.filter((a) => a.userId === id).length);

describe('assignJuries', () => {
  it('donne deux jurés distincts à chaque film', () => {
    const assignments = assignJuries({
      movieIds: [10, 20],
      juryIds: [1, 2, 3],
    });

    expect(assignments).toHaveLength(4);
    expect([...juriesPerMovie(assignments).values()]).toEqual([2, 2]);

    const pairs = assignments.map((a) => `${a.movieId}-${a.userId}`);
    expect(new Set(pairs).size).toBe(4);
  });

  /**
   * La raison d'être de l'algorithme : sans équilibrage, servir les jurés dans
   * l'ordre donnerait tous les films aux deux premiers et rien au troisième.
   */
  it('répartit la charge à parts égales quand le compte tombe juste', () => {
    const juryIds = [1, 2, 3];

    const assignments = assignJuries({ movieIds: [10, 20, 30], juryIds });

    expect(assignments).toHaveLength(6);
    expect(loadPerJury(assignments, juryIds)).toEqual([2, 2, 2]);
  });

  /**
   * Deux jurés par film est un plancher, pas une règle fixe : quand les jurés
   * sont plus nombreux que les places, le film part chez tout le monde plutôt
   * que de laisser un juré sans rien à noter.
   */
  it('élargit la couverture quand les films sont peu nombreux', () => {
    const juryIds = [1, 2, 3];

    const assignments = assignJuries({ movieIds: [10], juryIds });

    expect(assignments).toHaveLength(3);
    expect(juriesPerMovie(assignments).get(10)).toBe(3);
    expect(loadPerJury(assignments, juryIds)).toEqual([1, 1, 1]);
  });

  /**
   * 5 films × 2 jurés = 10 places pour 3 jurés : le compte ne tombe pas rond.
   * Un juré prend une place de plus, jamais deux — c'est la garantie que le
   * glouton du moins chargé apporte et qu'un tourniquet naïf perdrait.
   */
  it("ne laisse jamais plus d'un film d'écart entre deux jurés", () => {
    const juryIds = [1, 2, 3];

    const assignments = assignJuries({
      movieIds: [10, 20, 30, 40, 50],
      juryIds,
    });

    expect(assignments).toHaveLength(10);
    expect(loadPerJury(assignments, juryIds)).toEqual([4, 3, 3]);
    expect([...juriesPerMovie(assignments).values()]).toEqual([2, 2, 2, 2, 2]);
  });

  /**
   * Le service refuse ce cas en 422 avant d'appeler l'algorithme, mais celui-ci
   * ne doit pas pour autant produire d'attribution fantôme s'il y arrive.
   */
  it("ne produit rien quand il n'y a aucun film", () => {
    expect(assignJuries({ movieIds: [], juryIds: [1, 2] })).toEqual([]);
  });
});
