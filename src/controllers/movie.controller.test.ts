import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

/**
 * `PUT /movies/:id` avec un `adminData` notifie le réalisateur. `.env.test`
 * pointe un MAILER_HOST injoignable : sans ce mock, tout test de changement de
 * statut échouerait sur l'envoi.
 */
vi.mock('../services/email.service.js', () => ({
  default: {
    statusUpdateMail: vi.fn(),
    statusUpdatePendingMail: vi.fn(),
  },
}));

import app from '../app.js';
import db from '../database/connection.js';
import emailService from '../services/email.service.js';
import { resetDatabase } from '../helpers/resetDatabase.js';
import {
  authCookie,
  createMovie,
  createMovieUpdateToken,
} from '../helpers/test-factories.js';
import { Role } from '../types/enums/role.enum.js';
import type { RowDataPacket } from 'mysql2';

/**
 * Aucune route movie ne consulte la table `user` : isLogged et isAdmin lisent
 * le JWT et rien d'autre. Un cookie forgé suffit, sans créer d'utilisateur.
 */
const adminCookie = authCookie({ id: 1, roles: [Role.Admin] });
const juryCookie = authCookie({ id: 2, roles: [Role.Jury] });

const countRows = async (
  table: 'movie' | 'collaborator' | 'image' | 'movie_update',
): Promise<number> => {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS count FROM \`${table}\``,
  );
  return rows[0]!.count as number;
};

beforeEach(async () => {
  await resetDatabase();
  vi.clearAllMocks();
});

describe('GET /movies', () => {
  it('renvoie les films avec leur réalisateur et le total', async () => {
    await createMovie({
      englishTitle: 'Test Movie',
      director: { firstname: 'Agnès', lastname: 'Varda' },
    });

    const res = await request(app).get('/movies?page=1&type=all&search=');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      english_title: 'Test Movie',
      director: { firstname: 'Agnès', lastname: 'Varda' },
    });
  });

  it('filtre sur le titre anglais via search', async () => {
    await createMovie({ slug: 'un', englishTitle: 'The Journey' });
    await createMovie({ slug: 'deux', englishTitle: 'Silent Machines' });

    const res = await request(app).get('/movies?page=1&type=all&search=Silent');

    expect(res.body.total).toBe(1);
    expect(res.body.data[0].english_title).toBe('Silent Machines');
  });

  it('type=fullai écarte les films hybrides', async () => {
    await createMovie({ slug: 'pur', englishTitle: 'Pure', isHybrid: false });
    await createMovie({ slug: 'mixte', englishTitle: 'Mixed', isHybrid: true });

    const res = await request(app).get('/movies?page=1&type=fullai&search=');

    expect(res.body.total).toBe(1);
    expect(res.body.data[0].english_title).toBe('Pure');
  });

  it('type=hybrid ne garde que les hybrides', async () => {
    await createMovie({ slug: 'pur', englishTitle: 'Pure', isHybrid: false });
    await createMovie({ slug: 'mixte', englishTitle: 'Mixed', isHybrid: true });

    const res = await request(app).get('/movies?page=1&type=hybrid&search=');

    expect(res.body.total).toBe(1);
    expect(res.body.data[0].english_title).toBe('Mixed');
  });

  /**
   * `total` compte hors LIMIT : la page 2 est vide mais le total reste juste,
   * c'est ce qui permet au front d'afficher la pagination.
   */
  it('pagine par 20 en conservant le total', async () => {
    await createMovie({ slug: 'unique' });

    const res = await request(app).get('/movies?page=2&type=all&search=');

    expect(res.body.total).toBe(1);
    expect(res.body.data).toEqual([]);
  });

  /**
   * Le paramètre est facultatif : l'omettre doit lister tous les films, pas
   * en renvoyer zéro.
   */
  it('liste tous les films quand search est absent', async () => {
    await createMovie({ slug: 'un', englishTitle: 'Un' });
    await createMovie({ slug: 'deux', englishTitle: 'Deux' });

    const res = await request(app).get('/movies?page=1&type=all');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.data).toHaveLength(2);
  });

  it('refuse une page non numérique', async () => {
    const res = await request(app).get('/movies?page=abc&type=all&search=');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Wrong query params' });
  });

  it('refuse une page nulle ou négative', async () => {
    const res = await request(app).get('/movies?page=0&type=all&search=');

    expect(res.status).toBe(400);
  });

  it('refuse un type inconnu', async () => {
    const res = await request(app).get('/movies?page=1&type=cinema&search=');

    expect(res.status).toBe(400);
  });
});

describe('GET /movies/sort', () => {
  const sorted = (query: string) =>
    request(app).get(`/movies/sort?${query}`).set('Cookie', adminCookie);

  it('refuse un visiteur anonyme', async () => {
    const res = await request(app).get(
      '/movies/sort?page=1&sort=id&order=ASC&onlyDrafts=false&search=',
    );

    expect(res.status).toBe(401);
  });

  it('trie sur le titre anglais en ordre croissant', async () => {
    await createMovie({ slug: 'b', englishTitle: 'Beta' });
    await createMovie({ slug: 'a', englishTitle: 'Alpha' });

    const res = await sorted(
      'page=1&sort=english_title&order=ASC&onlyDrafts=false&search=',
    );

    expect(res.status).toBe(200);
    expect(
      res.body.data.map((m: { english_title: string }) => m.english_title),
    ).toEqual(['Alpha', 'Beta']);
  });

  it('inverse le tri avec order=DESC', async () => {
    await createMovie({ slug: 'b', englishTitle: 'Beta' });
    await createMovie({ slug: 'a', englishTitle: 'Alpha' });

    const res = await sorted(
      'page=1&sort=english_title&order=DESC&onlyDrafts=false&search=',
    );

    expect(
      res.body.data.map((m: { english_title: string }) => m.english_title),
    ).toEqual(['Beta', 'Alpha']);
  });

  it('liste tous les films quand search est absent', async () => {
    await createMovie({ slug: 'un', englishTitle: 'Un' });
    await createMovie({ slug: 'deux', englishTitle: 'Deux' });

    const res = await sorted('page=1&sort=id&order=ASC&onlyDrafts=false');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });

  /**
   * `sort` et `order` sont interpolés directement dans le `ORDER BY` : cette
   * liste blanche est la seule chose qui sépare la route d'une injection SQL.
   */
  it('refuse une colonne de tri hors liste blanche', async () => {
    const res = await sorted(
      'page=1&sort=video_path&order=ASC&onlyDrafts=false&search=',
    );

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Wrong query params' });
  });

  it('refuse un ordre hors ASC/DESC', async () => {
    const res = await sorted(
      'page=1&sort=id&order=DROP&onlyDrafts=false&search=',
    );

    expect(res.status).toBe(400);
  });

  it('refuse un onlyDrafts non booléen', async () => {
    const res = await sorted('page=1&sort=id&order=ASC&onlyDrafts=oui&search=');

    expect(res.status).toBe(400);
  });
});

describe('GET /movies/random', () => {
  it('renvoie le nombre de films demandé', async () => {
    await createMovie({ slug: 'un', englishTitle: 'Un' });
    await createMovie({ slug: 'deux', englishTitle: 'Deux' });

    const res = await request(app).get('/movies/random?qt=2');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('ne renvoie pas plus de films que la base n’en contient', async () => {
    await createMovie();

    const res = await request(app).get('/movies/random?qt=5');

    expect(res.body).toHaveLength(1);
  });

  /**
   * `validateParamsAndQuery` a sa propre forme d'erreur : la clé est `msg`,
   * pas `message` comme partout ailleurs dans l'API.
   */
  it('refuse un qt non numérique, avec la clé msg propre à ce middleware', async () => {
    const res = await request(app).get('/movies/random?qt=abc');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('msg');
  });

  it('refuse un qt nul', async () => {
    const res = await request(app).get('/movies/random?qt=0');

    expect(res.status).toBe(400);
  });
});

describe('GET /movies/:id', () => {
  it('renvoie le film et son réalisateur', async () => {
    const movie = await createMovie({
      originalTitle: 'Le Voyage',
      director: { firstname: 'Agnès', lastname: 'Varda' },
    });

    const res = await request(app).get(`/movies/${movie.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: movie.id,
      original_title: 'Le Voyage',
      director: { firstname: 'Agnès', lastname: 'Varda' },
    });
  });

  it("répond 404 quand le film n'existe pas", async () => {
    const res = await request(app).get('/movies/999999');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ message: 'film not found' });
  });

  it('refuse un id nul ou négatif', async () => {
    expect((await request(app).get('/movies/0')).status).toBe(400);
    expect((await request(app).get('/movies/-1')).status).toBe(400);
  });
});

describe('POST /movies', () => {
  /**
   * Le seul chemin atteignable sans S3 ni ffprobe : `MovieRequestSchema` exige
   * de vrais objets fichier, et multer laisse passer une requête non-multipart
   * sans y toucher. La création complète relève du test manuel.
   */
  it('refuse une requête sans les fichiers attendus', async () => {
    const res = await request(app)
      .post('/movies')
      .send({ originalTitle: 'Sans fichiers' });

    expect(res.status).toBe(400);
    expect(await countRows('movie')).toBe(0);
  });
});

describe('DELETE /movies/:id', () => {
  it('refuse un visiteur anonyme', async () => {
    const movie = await createMovie();

    const res = await request(app).delete(`/movies/${movie.id}`);

    expect(res.status).toBe(401);
    expect(await countRows('movie')).toBe(1);
  });

  it('refuse un juré : supprimer une candidature est un geste admin', async () => {
    const movie = await createMovie();

    const res = await request(app)
      .delete(`/movies/${movie.id}`)
      .set('Cookie', juryCookie);

    expect(res.status).toBe(403);
    expect(await countRows('movie')).toBe(1);
  });

  it('supprime le film et répond 204', async () => {
    const movie = await createMovie();

    const res = await request(app)
      .delete(`/movies/${movie.id}`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(204);
    expect(await countRows('movie')).toBe(0);
  });

  it('supprime aussi les collaborateurs et les photos du film', async () => {
    const movie = await createMovie({
      collaborators: [{ firstname: 'Bob' }],
      stills: ['https://s3.test/still-1.jpg'],
    });

    await request(app).delete(`/movies/${movie.id}`).set('Cookie', adminCookie);

    expect(await countRows('collaborator')).toBe(0);
    expect(await countRows('image')).toBe(0);
  });

  it("répond 404 quand le film n'existe pas", async () => {
    const res = await request(app)
      .delete('/movies/999999')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ message: 'film not found' });
  });
});

describe('PUT /movies/:id', () => {
  it('refuse un visiteur anonyme', async () => {
    const movie = await createMovie();

    const res = await request(app)
      .put(`/movies/${movie.id}`)
      .send({ englishTitle: 'Piraté' });

    expect(res.status).toBe(401);
  });

  it('refuse un juré : seul un admin modifie une fiche', async () => {
    const movie = await createMovie();

    const res = await request(app)
      .put(`/movies/${movie.id}`)
      .set('Cookie', juryCookie)
      .send({ englishTitle: 'Piraté' });

    expect(res.status).toBe(403);
  });

  it('refuse une requête sans corps', async () => {
    const movie = await createMovie();

    const res = await request(app)
      .put(`/movies/${movie.id}`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Request body is required' });
  });

  it("répond 404 quand le film n'existe pas", async () => {
    const res = await request(app)
      .put('/movies/999999')
      .set('Cookie', adminCookie)
      .send({ englishTitle: 'Fantôme' });

    expect(res.status).toBe(404);
  });

  /** La route répond le nombre de lignes touchées en corps brut, pas un objet. */
  it('modifie le film et répond le nombre de lignes affectées', async () => {
    const movie = await createMovie({ englishTitle: 'Avant' });

    const res = await request(app)
      .put(`/movies/${movie.id}`)
      .set('Cookie', adminCookie)
      .send({ englishTitle: 'Après' });

    expect(res.status).toBe(200);
    expect(res.text).toBe('1');

    const after = await request(app).get(`/movies/${movie.id}`);
    expect(after.body.english_title).toBe('Après');
  });

  it('refuse un statut administratif inconnu', async () => {
    const movie = await createMovie();

    const res = await request(app)
      .put(`/movies/${movie.id}`)
      .set('Cookie', adminCookie)
      .send({ adminData: { adminStatus: 'peut-être' } });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'wrong movie status' });
  });

  it('notifie le réalisateur quand le film est accepté', async () => {
    const movie = await createMovie();

    const res = await request(app)
      .put(`/movies/${movie.id}`)
      .set('Cookie', adminCookie)
      .send({ adminData: { adminStatus: 'accepted' }, status: 'accepted' });

    expect(res.status).toBe(200);
    expect(emailService.statusUpdateMail).toHaveBeenCalledTimes(1);
  });

  /**
   * `pending_change` est le seul statut qui ouvre une demande de modification :
   * il crée le token que le réalisateur recevra par mail et consommera en PATCH.
   */
  it('ouvre une demande de modification et envoie le token au réalisateur', async () => {
    const movie = await createMovie();

    const res = await request(app)
      .put(`/movies/${movie.id}`)
      .set('Cookie', adminCookie)
      .send({
        adminData: { adminStatus: 'pending_change' },
        status: 'pending_change',
      });

    expect(res.status).toBe(200);
    expect(await countRows('movie_update')).toBe(1);
    expect(emailService.statusUpdatePendingMail).toHaveBeenCalledTimes(1);
  });
});

/**
 * Le garde partagé sur `:id`, vu depuis chaque route qui le consomme. Groupé
 * ici plutôt que dispersé : c'est un seul comportement, et le dispersant on
 * perdrait de vue qu'il doit être le même partout.
 */
describe('identifiant de film malformé', () => {
  it('refuse un id non numérique sur la lecture', async () => {
    const res = await request(app).get('/movies/abc');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Invalid movie id' });
  });

  /** `parseInt` tronquait : `/movies/1abc` servait le film 1. */
  it('refuse un id à suffixe non numérique plutôt que de le tronquer', async () => {
    const movie = await createMovie();

    const res = await request(app).get(`/movies/${movie.id}abc`);

    expect(res.status).toBe(400);
  });

  it('refuse un id décimal', async () => {
    const res = await request(app).get('/movies/1.5');

    expect(res.status).toBe(400);
  });

  it('refuse un id non numérique sur la suppression', async () => {
    const res = await request(app)
      .delete('/movies/abc')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(400);
  });

  it('refuse un id non numérique sur la mise à jour admin', async () => {
    const res = await request(app)
      .put('/movies/abc')
      .set('Cookie', adminCookie)
      .send({ englishTitle: 'Peu importe' });

    expect(res.status).toBe(400);
  });

  it('refuse un id non numérique sur la demande de modification', async () => {
    const movie = await createMovie();
    const token = await createMovieUpdateToken(movie.id);

    const res = await request(app)
      .patch('/movies/abc')
      .set('Authorization', `Bearer ${token}`)
      .send({ originalTitle: 'Peu importe' });

    expect(res.status).toBe(400);
  });
});

describe('PATCH /movies/:id', () => {
  it('refuse une requête sans en-tête Authorization', async () => {
    const movie = await createMovie();

    const res = await request(app)
      .patch(`/movies/${movie.id}`)
      .send({ originalTitle: 'Nouveau titre' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      message: 'Token missing from Authorization header',
    });
  });

  it('refuse un token inconnu', async () => {
    const movie = await createMovie();

    const res = await request(app)
      .patch(`/movies/${movie.id}`)
      .set('Authorization', 'Bearer token-inconnu')
      .send({ originalTitle: 'Nouveau titre' });

    expect(res.status).toBe(404);
  });

  /**
   * Le token est lié à un film : le présenter sur un autre film est refusé,
   * sans quoi un réalisateur modifierait la fiche du voisin.
   */
  it('refuse un token valide présenté sur un autre film', async () => {
    const movie = await createMovie({ slug: 'le-mien' });
    const other = await createMovie({ slug: 'celui-du-voisin' });
    const token = await createMovieUpdateToken(movie.id);

    const res = await request(app)
      .patch(`/movies/${other.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ originalTitle: 'Nouveau titre' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Invalid token' });
  });

  it('modifie le film et consomme le token', async () => {
    const movie = await createMovie({ originalTitle: 'Avant' });
    const token = await createMovieUpdateToken(movie.id);

    const res = await request(app)
      .patch(`/movies/${movie.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ originalTitle: 'Après' });

    expect(res.status).toBe(200);
    expect(await countRows('movie_update')).toBe(0);

    const after = await request(app).get(`/movies/${movie.id}`);
    expect(after.body.original_title).toBe('Après');
  });

  it('refuse un token déjà consommé', async () => {
    const movie = await createMovie();
    const token = await createMovieUpdateToken(movie.id);

    await request(app)
      .patch(`/movies/${movie.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ originalTitle: 'Première modification' });

    const res = await request(app)
      .patch(`/movies/${movie.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ originalTitle: 'Seconde modification' });

    expect(res.status).toBe(404);
  });
});
