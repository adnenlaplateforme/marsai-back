// L'avancement du jury est une pure requête d'agrégation : le service ne fait
// que déléguer. Comme pour rating.model, la vraie base est le seul endroit où
// le GROUP BY et le LEFT JOIN sont réellement exercés — un mock du modèle les
// laisserait entièrement hors de portée.
import { describe, it, expect, beforeEach } from 'vitest';
import type { ResultSetHeader } from 'mysql2/promise';
import db from '../database/connection.js';
import juryModel from './jury.model.js';
import ratingModel from './rating.model.js';
import { resetDatabase } from '../helpers/resetDatabase.js';
import { createUser } from '../helpers/test-factories.js';
import { Role } from '../types/enums/role.enum.js';

/**
 * Un film minimal, sans réalisateur : `findProgress` ne joint pas
 * `collaborator`, il ne sert qu'à porter une note.
 */
const insertMovie = async (slug: string): Promise<number> => {
  const [res] = await db.execute<ResultSetHeader>(
    `INSERT INTO movie (original_title, english_title, slug, cover_path, duration,
      is_hybrid, language, original_synopsis, english_synopsis, creative_process,
      ai_tools, has_subs, status)
     VALUES (?, ?, ?, 'cover.jpg', 90, false, 'FR', 'syn', 'syn', 'proc', 'tools', false, 'accepted')`,
    [slug, slug, slug],
  );
  return res.insertId;
};

beforeEach(async () => {
  await resetDatabase();
});

describe('juryModel.findProgress', () => {
  it('compte les films notés par chaque juré', async () => {
    const alice = await createUser({
      email: 'alice@test.com',
      roles: [Role.Jury],
    });
    const bob = await createUser({ email: 'bob@test.com', roles: [Role.Jury] });
    const premier = await insertMovie('premier-film');
    const second = await insertMovie('second-film');

    await ratingModel.create(alice.id, premier, 8);
    await ratingModel.create(alice.id, second, 6);
    await ratingModel.create(bob.id, premier, 4);

    const progress = await juryModel.findProgress();

    expect(progress.map((j) => [j.id, j.rated])).toEqual([
      [alice.id, 2],
      [bob.id, 1],
    ]);
  });

  /**
   * Le juré inactif est justement celui que l'admin cherche : il doit sortir de
   * la requête avec `rated = 0`, pas en être absent.
   */
  it("garde un juré qui n'a rien noté, à zéro", async () => {
    const actif = await createUser({
      email: 'actif@test.com',
      roles: [Role.Jury],
    });
    const inactif = await createUser({
      email: 'inactif@test.com',
      roles: [Role.Jury],
    });
    await ratingModel.create(actif.id, await insertMovie('un-film'), 9);

    const progress = await juryModel.findProgress();

    expect(progress.map((j) => [j.id, j.rated])).toEqual([
      [actif.id, 1],
      [inactif.id, 0],
    ]);
  });

  /**
   * `last_rated_at` alimente la ligne « Activité » de la carte juré. Il est nul
   * tant que rien n'a été noté — pendant exact de `rated = 0`, et non une
   * anomalie que le front devrait traiter comme une erreur.
   */
  it('date la dernière note, et la laisse nulle sans note', async () => {
    const actif = await createUser({
      email: 'date-actif@test.com',
      roles: [Role.Jury],
    });
    const inactif = await createUser({
      email: 'date-inactif@test.com',
      roles: [Role.Jury],
    });
    await ratingModel.create(actif.id, await insertMovie('film-date'), 5);

    const [avecNote, sansNote] = await juryModel.findProgress();

    expect(avecNote!.id).toBe(actif.id);
    expect(avecNote!.last_rated_at).toBeInstanceOf(Date);
    expect(sansNote!.id).toBe(inactif.id);
    expect(sansNote!.last_rated_at).toBeNull();
  });
});

/**
 * `findById` n'avait aucun appelant jusqu'au service d'attribution : la requête
 * n'avait donc jamais été exécutée. Elle échouait sur `AND id = ?`, ambigu
 * entre `user` et `role_user`, qui portent tous deux une colonne `id`.
 */
describe('juryModel.findById', () => {
  it('trouve un juré par son identifiant', async () => {
    const jure = await createUser({
      email: 'jure@test.com',
      roles: [Role.Jury],
    });

    const trouve = await juryModel.findById(jure.id);

    expect(trouve).toMatchObject({ id: jure.id, email: 'jure@test.com' });
  });

  /**
   * Le filtre sur le rôle est la raison d'être de la méthode : le service
   * d'attribution s'en sert pour refuser qu'on confie des films à un admin.
   */
  it("ne trouve pas un utilisateur qui n'est pas juré", async () => {
    const admin = await createUser({
      email: 'admin@test.com',
      roles: [Role.Admin],
    });

    expect(await juryModel.findById(admin.id)).toBeNull();
  });

  it('renvoie null sur un identifiant inconnu', async () => {
    expect(await juryModel.findById(999999)).toBeNull();
  });
});
