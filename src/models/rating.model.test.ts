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
import type { MovieStatusValue } from '../helpers/test-factories.js';
import { Role } from '../types/enums/role.enum.js';

/**
 * Insère un film minimal, avec ou sans réalisateur.
 *
 * Volontairement local plutôt que dans test-factories : le cas sans
 * réalisateur est justement ce qu'on veut provoquer ici, alors qu'une factory
 * partagée doit produire des films visibles par l'API.
 *
 * Le statut vaut `accepted` par défaut, et non celui de la base
 * (`pending_review`) : c'est le seul que les listes du jury servent, un défaut
 * différent rendrait vide la quasi-totalité des cas testés ici.
 */
const insertMovie = async (
  slug: string,
  withDirector = true,
  country = 'France',
  status: MovieStatusValue = 'accepted',
): Promise<number> => {
  const [res] = await db.execute<ResultSetHeader>(
    `INSERT INTO movie (original_title, english_title, slug, cover_path, duration,
      is_hybrid, language, original_synopsis, english_synopsis, creative_process,
      ai_tools, has_subs, status)
     VALUES (?, ?, ?, 'cover.jpg', 90, false, 'FR', 'syn', 'syn', 'proc', 'tools', false, ?)`,
    [slug, slug, slug, status],
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
    expect(ranking.find((m) => m.id === rated)!.director.country).toBe(
      'Sénégal',
    );
  });

  /**
   * La file de visionnage ne propose que des films sur lesquels le vote est
   * ouvert : le seul statut `accepted`. Les cinq autres sont testés un par un
   * plutôt qu'en bloc — `selected` et `winner` sont les moins évidents, ils
   * viennent *après* l'acceptation et restent visibles ailleurs.
   */
  it.each([
    'pending_review',
    'pending_change',
    'rejected',
    'selected',
    'winner',
  ] as const)(
    'exclut les films au statut %s de la file à noter',
    async (status) => {
      const jury = await createUser({
        email: `${status}@test.com`,
        roles: [Role.Jury],
      });
      await insertMovie(`film-${status}`, true, 'France', status);

      expect(await ratingModel.findMoviesToRateByUserId(jury.id)).toEqual([]);
    },
  );

  /**
   * L'asymétrie volontaire entre les deux listes : une note posée avant que
   * l'admin ne promeuve le film reste consultable. Sans cela, l'historique du
   * juré rétrécirait à chaque décision de l'admin.
   */
  it.each(['selected', 'winner'] as const)(
    'garde dans les films notés un film promu en %s',
    async (status) => {
      const jury = await createUser({
        email: `note-${status}@test.com`,
        roles: [Role.Jury],
      });
      const movie = await insertMovie(`film-note-${status}`, true, 'France');

      await ratingModel.create(jury.id, movie, 8, 'un beau film');
      await db.execute('UPDATE movie SET status = ? WHERE id = ?', [
        status,
        movie,
      ]);

      const ratedList = await ratingModel.findRatedMoviesByUserId(jury.id);

      expect(ratedList.map((m) => m.id)).toEqual([movie]);
      expect(ratedList[0]!.note).toBe(8);
      expect(ratedList[0]!.comment).toBe('un beau film');
      // Le film quitte en revanche la file à noter, où il n'a plus rien à faire.
      expect(await ratingModel.findMoviesToRateByUserId(jury.id)).toEqual([]);
    },
  );

  it.each(['pending_change', 'rejected'] as const)(
    'retire des films notés un film repassé en %s',
    async (status) => {
      const jury = await createUser({
        email: `retire-${status}@test.com`,
        roles: [Role.Jury],
      });
      const movie = await insertMovie(`film-retire-${status}`);

      await ratingModel.create(jury.id, movie, 8);
      await db.execute('UPDATE movie SET status = ? WHERE id = ?', [
        status,
        movie,
      ]);

      expect(await ratingModel.findRatedMoviesByUserId(jury.id)).toEqual([]);
      // La note reste en base, et le classement admin la compte toujours : ce
      // sont les listes du juré qui se ferment, pas la délibération.
      const ranking = await ratingModel.findMoviesWithRatingAverage();
      expect(ranking.map((m) => m.id)).toEqual([movie]);
      expect(ranking[0]!.votes).toBe(1);
    },
  );

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

/**
 * « Un juré ne pose qu'une note par film » est une règle que le service applique
 * en deux temps — `getByMovieIdAndUserId` puis `create` ou `update` — avec un
 * `await` entre les deux. Deux requêtes concurrentes du même juré peuvent donc
 * lire toutes les deux « aucune note » et insérer toutes les deux.
 *
 * La règle doit tenir en base, sans quoi le doublon fausserait `AVG(r.note)` et
 * `votes` du classement, qui comptent des lignes.
 */
describe('unicité (user_id, movie_id) de rating', () => {
  it('refuse une seconde note du même juré sur le même film', async () => {
    const jury = await createUser({
      email: 'unicite@test.com',
      roles: [Role.Jury],
    });
    const movie = await insertMovie('film-unicite');

    await ratingModel.create(jury.id, movie, 7, 'première note');

    await expect(
      ratingModel.create(jury.id, movie, 9, 'doublon'),
    ).rejects.toThrow();

    const notes = await ratingModel.findAllByMovieId(movie);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.note).toBe(7);
  });

  it('laisse deux jurés différents noter le même film', async () => {
    const premier = await createUser({
      email: 'unicite-a@test.com',
      roles: [Role.Jury],
    });
    const second = await createUser({
      email: 'unicite-b@test.com',
      roles: [Role.Jury],
    });
    const movie = await insertMovie('film-deux-jures');

    await ratingModel.create(premier.id, movie, 7);
    await ratingModel.create(second.id, movie, 9);

    expect(await ratingModel.findAllByMovieId(movie)).toHaveLength(2);
  });

  it('laisse un juré noter deux films différents', async () => {
    const jury = await createUser({
      email: 'unicite-c@test.com',
      roles: [Role.Jury],
    });

    await ratingModel.create(jury.id, await insertMovie('film-un'), 7);
    await ratingModel.create(jury.id, await insertMovie('film-deux'), 9);

    expect(await ratingModel.findRatedMoviesByUserId(jury.id)).toHaveLength(2);
  });
});
