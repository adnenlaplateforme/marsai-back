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
  country = 'France',
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
      `INSERT INTO collaborator (firstname, lastname, country, is_director, movie_id)
       VALUES ('Jane', 'Realisatrice', ?, true, ?)`,
      [country, res.insertId],
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

  /**
   * `directorJson` est partagé par les trois requêtes de ce modèle : un champ
   * oublié disparaît des listes jury *et* du classement admin à la fois. Le
   * type `Director` promet `country`, la requête doit le livrer.
   */
  it('expose le pays du réalisateur dans les trois listes', async () => {
    const jury = await createUser({
      email: 'pays@test.com',
      roles: [Role.Jury],
    });
    const rated = await insertMovie('film-note-pays', true, 'Sénégal');
    await insertMovie('film-a-noter-pays', true, 'Japon');

    await ratingModel.create(jury.id, rated, 7);

    const ratedList = await ratingModel.findRatedMoviesByUserId(jury.id);
    const toRateList = await ratingModel.findMoviesToRateByUserId(jury.id);
    const ranking = await ratingModel.findMoviesWithRatingAverage();

    expect(ratedList[0]!.director.country).toBe('Sénégal');
    expect(toRateList[0]!.director.country).toBe('Japon');
    expect(
      ranking.find((m) => m.id === rated)!.director.country,
    ).toBe('Sénégal');
  });

  it('exclut les films sans réalisateur des deux listes', async () => {
    const jury = await createUser({ email: 'c@test.com', roles: [Role.Jury] });
    const orphan = await insertMovie('film-sans-realisateur', false);

    await ratingModel.create(jury.id, orphan, 5);

    expect(await ratingModel.findRatedMoviesByUserId(jury.id)).toEqual([]);
    expect(await ratingModel.findMoviesToRateByUserId(jury.id)).toEqual([]);
  });
});

// Toute la logique du classement admin tient dans une seule requête : moyenne,
// comptage, films non notés conservés par le LEFT JOIN et ordre du palmarès.
// Un mock du modèle ne vérifierait rien de tout cela.
describe('SQL du classement par moyenne', () => {
  it('classe les films du mieux noté au moins bien noté', async () => {
    const first = await createUser({
      email: 'j1@test.com',
      roles: [Role.Jury],
    });
    const second = await createUser({
      email: 'j2@test.com',
      roles: [Role.Jury],
    });
    const best = await insertMovie('film-favori');
    const worst = await insertMovie('film-mal-note');

    await ratingModel.create(first.id, best, 8);
    await ratingModel.create(second.id, best, 9);
    await ratingModel.create(first.id, worst, 5);
    await ratingModel.create(second.id, worst, 6);

    const ranking = await ratingModel.findMoviesWithRatingAverage();

    expect(ranking.map((m) => m.id)).toEqual([best, worst]);
    expect(ranking[0]!.average).toBe(8.5);
    expect(ranking[0]!.votes).toBe(2);
    expect(ranking[0]!.director.firstname).toBe('Jane');
    expect(ranking[1]!.average).toBe(5.5);
  });

  it('exclut les films sans réalisateur, comme partout ailleurs dans l’API', async () => {
    const jury = await createUser({ email: 'j7@test.com', roles: [Role.Jury] });
    const orphan = await insertMovie('film-classement-sans-realisateur', false);

    await ratingModel.create(jury.id, orphan, 9);

    expect(await ratingModel.findMoviesWithRatingAverage()).toEqual([]);
  });

  it("garde les films qu'aucun juré n'a notés, en fin de classement", async () => {
    const jury = await createUser({ email: 'j3@test.com', roles: [Role.Jury] });
    const rated = await insertMovie('film-note-classement');
    const unrated = await insertMovie('film-jamais-note');

    await ratingModel.create(jury.id, rated, 4);

    const ranking = await ratingModel.findMoviesWithRatingAverage();

    expect(ranking.map((m) => m.id)).toEqual([rated, unrated]);
    expect(ranking[1]!.average).toBeNull();
    expect(ranking[1]!.votes).toBe(0);
  });

  it('arrondit la moyenne à deux décimales et la renvoie en nombre', async () => {
    const first = await createUser({
      email: 'j4@test.com',
      roles: [Role.Jury],
    });
    const second = await createUser({
      email: 'j5@test.com',
      roles: [Role.Jury],
    });
    const third = await createUser({
      email: 'j6@test.com',
      roles: [Role.Jury],
    });
    const movie = await insertMovie('film-moyenne-longue');

    await ratingModel.create(first.id, movie, 1);
    await ratingModel.create(second.id, movie, 2);
    await ratingModel.create(third.id, movie, 2);

    const [result] = await ratingModel.findMoviesWithRatingAverage();

    // mysql2 rend les DECIMAL en chaîne : « 1.67 » passerait toEqual mais pas
    // toBe, et se comparerait mal côté front.
    expect(result!.average).toBe(1.67);
    expect(typeof result!.votes).toBe('number');
  });
});
