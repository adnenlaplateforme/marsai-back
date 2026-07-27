// Ces deux requêtes portent toute la logique des listes jury : le service ne
// fait que déléguer. Les tester contre la vraie base est le seul moyen de
// vérifier la jointure réalisateur et le LEFT JOIN ... IS NULL, qu'un mock du
// modèle laisserait entièrement hors de portée.
import { describe, it, expect, beforeEach } from 'vitest';
import type { ResultSetHeader } from 'mysql2/promise';
import db from '../database/connection.js';
import ratingModel from './rating.model.js';
import { resetDatabase } from '../helpers/resetDatabase.js';
import { createUser } from '../helpers/test-factories.js';
import { Role } from '../types/enums/role.enum.js';

/**
 * Insère un film minimal, avec ou sans réalisateur.
 *
 * Volontairement local plutôt que dans test-factories : le cas sans
 * réalisateur est justement ce qu'on veut provoquer ici, alors qu'une factory
 * partagée doit produire des films visibles par l'API.
 */
const insertMovie = async (
  slug: string,
  withDirector = true,
): Promise<number> => {
  const [res] = await db.execute<ResultSetHeader>(
    `INSERT INTO movie (original_title, english_title, slug, cover_path, duration,
      is_hybrid, language, original_synopsis, english_synopsis, creative_process,
      ai_tools, has_subs)
     VALUES (?, ?, ?, 'cover.jpg', 90, false, 'FR', 'syn', 'syn', 'proc', 'tools', false)`,
    [slug, slug, slug],
  );
  if (withDirector) {
    await db.execute(
      `INSERT INTO collaborator (firstname, lastname, is_director, movie_id)
       VALUES ('Jane', 'Realisatrice', true, ?)`,
      [res.insertId],
    );
  }
  return res.insertId;
};

beforeEach(async () => {
  await resetDatabase();
});

describe('SQL des listes jury', () => {
  it('sépare les films notés des films restant à noter', async () => {
    const jury = await createUser({
      email: 'jury@test.com',
      roles: [Role.Jury],
    });
    const rated = await insertMovie('film-note');
    const toRate = await insertMovie('film-a-noter');

    await ratingModel.create(jury.id, rated, 7, 'pas mal');

    const ratedList = await ratingModel.findRatedMoviesByUserId(jury.id);
    const toRateList = await ratingModel.findMoviesToRateByUserId(jury.id);

    expect(ratedList.map((m) => m.id)).toEqual([rated]);
    expect(ratedList[0]!.note).toBe(7);
    expect(ratedList[0]!.comment).toBe('pas mal');
    expect(ratedList[0]!.rated_at).toBeInstanceOf(Date);
    expect(ratedList[0]!.director.firstname).toBe('Jane');

    expect(toRateList.map((m) => m.id)).toEqual([toRate]);
  });

  it("ignore la note d'un autre juré", async () => {
    const jury = await createUser({ email: 'a@test.com', roles: [Role.Jury] });
    const other = await createUser({ email: 'b@test.com', roles: [Role.Jury] });
    const movie = await insertMovie('film-partage');

    await ratingModel.create(other.id, movie, 3);

    expect(await ratingModel.findRatedMoviesByUserId(jury.id)).toEqual([]);
    expect(
      (await ratingModel.findMoviesToRateByUserId(jury.id)).map((m) => m.id),
    ).toEqual([movie]);
  });

  it('exclut les films sans réalisateur des deux listes', async () => {
    const jury = await createUser({ email: 'c@test.com', roles: [Role.Jury] });
    const orphan = await insertMovie('film-sans-realisateur', false);

    await ratingModel.create(jury.id, orphan, 5);

    expect(await ratingModel.findRatedMoviesByUserId(jury.id)).toEqual([]);
    expect(await ratingModel.findMoviesToRateByUserId(jury.id)).toEqual([]);
  });
});
