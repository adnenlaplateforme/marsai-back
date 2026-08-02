// L'attribution ne fait presque rien en TypeScript : le lot d'un juré, son
// avancement et le compte des films non couverts sont trois requêtes SQL. Comme
// pour rating.model et jury.model, la vraie base est le seul endroit où le
// GROUP BY, le LEFT JOIN et la contrainte UNIQUE sont réellement exercés — un
// mock du modèle les laisserait entièrement hors de portée.
import { describe, it, expect, beforeEach } from 'vitest';
import type { RowDataPacket } from 'mysql2/promise';
import db from '../database/connection.js';
import juryAssignmentModel from './jury-assignment.model.js';
import ratingModel from './rating.model.js';
import { resetDatabase } from '../helpers/resetDatabase.js';
import { createMovie, createUser } from '../helpers/test-factories.js';
import { Role } from '../types/enums/role.enum.js';

interface AssignmentRow extends RowDataPacket {
  user_id: number;
  movie_id: number;
}

/** Les attributions réellement en base, triées, pour comparer sans ambiguïté. */
const rowsInDb = async (): Promise<[number, number][]> => {
  const [rows] = await db.query<AssignmentRow[]>(
    'SELECT user_id, movie_id FROM jury_assignment ORDER BY user_id, movie_id',
  );
  return rows.map((r) => [r.user_id, r.movie_id]);
};

const createJury = (email: string) => createUser({ email, roles: [Role.Jury] });

beforeEach(async () => {
  await resetDatabase();
});

describe('juryAssignmentModel.createMany', () => {
  it('insère toutes les attributions en une fois', async () => {
    const alice = await createJury('alice@test.com');
    const bob = await createJury('bob@test.com');
    const premier = await createMovie({ slug: 'premier', status: 'accepted' });
    const second = await createMovie({ slug: 'second', status: 'accepted' });

    const inserted = await juryAssignmentModel.createMany([
      { userId: alice.id, movieId: premier.id },
      { userId: alice.id, movieId: second.id },
      { userId: bob.id, movieId: premier.id },
    ]);

    expect(inserted).toBe(3);
    expect(await rowsInDb()).toEqual([
      [alice.id, premier.id],
      [alice.id, second.id],
      [bob.id, premier.id],
    ]);
  });
});

describe('juryAssignmentModel.remove', () => {
  it('retire le film de la file du juré, et de lui seul', async () => {
    const alice = await createJury('alice@test.com');
    const bob = await createJury('bob@test.com');
    const film = await createMovie({ slug: 'film', status: 'accepted' });

    await juryAssignmentModel.createMany([
      { userId: alice.id, movieId: film.id },
      { userId: bob.id, movieId: film.id },
    ]);

    const removed = await juryAssignmentModel.remove(alice.id, film.id);

    expect(removed).toBe(1);
    expect(await rowsInDb()).toEqual([[bob.id, film.id]]);
  });

  /**
   * Le controller distingue 204 et 404 sur ce nombre : retirer un film qui
   * n'était pas dans la file n'est pas une suppression silencieuse.
   */
  it("renvoie 0 quand le film n'était pas dans la file", async () => {
    const alice = await createJury('alice@test.com');
    const film = await createMovie({ slug: 'film', status: 'accepted' });

    expect(await juryAssignmentModel.remove(alice.id, film.id)).toBe(0);
  });
});

describe('juryAssignmentModel.findProgress', () => {
  it('compte les films confiés et ceux déjà notés', async () => {
    const alice = await createJury('alice@test.com');
    const bob = await createJury('bob@test.com');
    const films = [];
    for (const slug of ['un', 'deux', 'trois', 'quatre']) {
      films.push(await createMovie({ slug, status: 'accepted' }));
    }

    await juryAssignmentModel.createMany([
      ...films.map((f) => ({ userId: alice.id, movieId: f.id })),
      { userId: bob.id, movieId: films[0]!.id },
    ]);
    for (const film of films.slice(0, 2)) {
      await ratingModel.create(alice.id, film.id, 7);
    }

    const progress = await juryAssignmentModel.findProgress();

    expect(progress).toEqual([
      { user_id: alice.id, assigned: 4, rated: 2 },
      { user_id: bob.id, assigned: 1, rated: 0 },
    ]);
  });

  /**
   * `rating` est joint sur le couple (juré, film) de l'attribution, pas sur le
   * seul juré : seule une note posée *dans son lot* fait avancer sa barre.
   * Sans cette condition, un juré pourrait afficher plus de films notés que de
   * films confiés.
   */
  it('ignore une note posée sur un film hors du lot', async () => {
    const alice = await createJury('alice@test.com');
    const dansLeLot = await createMovie({ slug: 'dedans', status: 'accepted' });
    const horsLot = await createMovie({ slug: 'dehors', status: 'accepted' });

    await juryAssignmentModel.createMany([
      { userId: alice.id, movieId: dansLeLot.id },
    ]);
    await ratingModel.create(alice.id, horsLot.id, 9);

    const progress = await juryAssignmentModel.findProgress();

    expect(progress).toEqual([{ user_id: alice.id, assigned: 1, rated: 0 }]);
  });

  /**
   * Le juré à qui rien n'a été confié est justement celui que l'admin cherche
   * après une attribution : il doit sortir à zéro, pas disparaître.
   */
  it('garde à zéro un juré sans aucun film', async () => {
    const servi = await createJury('servi@test.com');
    const oublie = await createJury('oublie@test.com');
    const film = await createMovie({ slug: 'film', status: 'accepted' });

    await juryAssignmentModel.createMany([
      { userId: servi.id, movieId: film.id },
    ]);

    const progress = await juryAssignmentModel.findProgress();

    expect(progress).toEqual([
      { user_id: servi.id, assigned: 1, rated: 0 },
      { user_id: oublie.id, assigned: 0, rated: 0 },
    ]);
  });
});

describe('juryAssignmentModel.findAssignableMovieIds', () => {
  /**
   * Seul `accepted` se note — c'est déjà la règle de `JURY_RATABLE_STATUS`, que
   * suit `/movies/to-rate`. Attribuer un film en attente de revue mettrait dans
   * la file d'un juré un film que le formulaire de notation refuse.
   */
  it('ne retient que les films acceptés, dans un ordre stable', async () => {
    const retenu = await createMovie({ slug: 'retenu', status: 'accepted' });
    await createMovie({ slug: 'en-revue', status: 'pending_review' });
    await createMovie({ slug: 'refuse', status: 'rejected' });
    const aussi = await createMovie({ slug: 'aussi', status: 'accepted' });

    const ids = await juryAssignmentModel.findAssignableMovieIds();

    expect(ids).toEqual([retenu.id, aussi.id]);
  });
});

describe('juryAssignmentModel.countUnassignedMovies', () => {
  /**
   * Le chiffre que l'admin lit après l'attribution. Il rend visible le film
   * accepté en retard, qui n'aurait sinon aucun juré et que personne ne
   * remarquerait avant la délibération.
   */
  it('compte les films acceptés sous le minimum de deux jurés', async () => {
    const alice = await createJury('alice@test.com');
    const bob = await createJury('bob@test.com');
    const couvert = await createMovie({ slug: 'couvert', status: 'accepted' });
    const moitie = await createMovie({ slug: 'moitie', status: 'accepted' });
    await createMovie({ slug: 'orphelin', status: 'accepted' });
    await createMovie({ slug: 'refuse', status: 'rejected' });

    await juryAssignmentModel.createMany([
      { userId: alice.id, movieId: couvert.id },
      { userId: bob.id, movieId: couvert.id },
      { userId: alice.id, movieId: moitie.id },
    ]);

    expect(await juryAssignmentModel.countUnassignedMovies()).toBe(2);
  });

  /**
   * Noter ne retire pas la ligne d'attribution : un film que ses deux jurés ont
   * déjà noté reste couvert. C'est ce que le choix de garder les lignes
   * garantit — une file qui s'érode l'aurait fait repasser pour orphelin.
   */
  it('garde couvert un film que ses deux jurés ont noté', async () => {
    const alice = await createJury('alice@test.com');
    const bob = await createJury('bob@test.com');
    const film = await createMovie({ slug: 'note', status: 'accepted' });

    await juryAssignmentModel.createMany([
      { userId: alice.id, movieId: film.id },
      { userId: bob.id, movieId: film.id },
    ]);
    await ratingModel.create(alice.id, film.id, 8);
    await ratingModel.create(bob.id, film.id, 6);

    expect(await juryAssignmentModel.countUnassignedMovies()).toBe(0);
  });
});

describe('juryAssignmentModel.create', () => {
  it('ajoute un film à la file d’un juré', async () => {
    const alice = await createJury('alice@test.com');
    const film = await createMovie({ slug: 'film', status: 'accepted' });

    await juryAssignmentModel.create(alice.id, film.id);

    expect(await rowsInDb()).toEqual([[alice.id, film.id]]);
  });

  /**
   * La contrainte UNIQUE de la table, vérifiée contre la vraie base : c'est le
   * service qui traduira l'erreur 1062 en refus métier. Sans elle, confier deux
   * fois le même film à un juré gonflerait son compte de films attribués.
   */
  it('refuse de confier deux fois le même film au même juré', async () => {
    const alice = await createJury('alice@test.com');
    const film = await createMovie({ slug: 'film', status: 'accepted' });

    await juryAssignmentModel.create(alice.id, film.id);

    await expect(
      juryAssignmentModel.create(alice.id, film.id),
    ).rejects.toMatchObject({ errno: 1062 });
  });
});

describe('juryAssignmentModel.count', () => {
  it('compte les attributions en base', async () => {
    expect(await juryAssignmentModel.count()).toBe(0);

    const alice = await createJury('alice@test.com');
    const film = await createMovie({ slug: 'film', status: 'accepted' });
    await juryAssignmentModel.createMany([
      { userId: alice.id, movieId: film.id },
    ]);

    expect(await juryAssignmentModel.count()).toBe(1);
  });
});

describe('juryAssignmentModel.deleteAll', () => {
  /**
   * La remise à zéro ne touche que `jury_assignment`. C'est ce qui rend « les
   * notes ne sont jamais effacées » vrai par construction : aucune clause WHERE
   * ne peut se tromper de table.
   */
  it('vide les attributions sans toucher aux notes', async () => {
    const alice = await createJury('alice@test.com');
    const film = await createMovie({ slug: 'film', status: 'accepted' });
    await juryAssignmentModel.createMany([
      { userId: alice.id, movieId: film.id },
    ]);
    await ratingModel.create(alice.id, film.id, 7);

    const deleted = await juryAssignmentModel.deleteAll();

    expect(deleted).toBe(1);
    expect(await rowsInDb()).toEqual([]);
    expect(
      await ratingModel.getByMovieIdAndUserId(alice.id, film.id),
    ).not.toBeNull();
  });
});
