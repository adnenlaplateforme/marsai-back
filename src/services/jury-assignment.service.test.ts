// Le service d'attribution n'est pas un pass-through : il refuse les états
// impossibles (pas assez de jurés, aucun film, attribution déjà faite) et
// compose l'algorithme avec les modèles. Ce sont ces branchements qu'on teste
// ici, mocks à l'appui — la sémantique SQL est couverte par le test de modèle,
// contre la vraie base.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AppError from '../helpers/AppError.js';

vi.mock('../models/jury-assignment.model.js', () => ({
  default: {
    createMany: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
    deleteAll: vi.fn(),
    remove: vi.fn(),
    findProgress: vi.fn(),
    findAssignableMovieIds: vi.fn(),
    countUnassignedMovies: vi.fn(),
  },
}));
vi.mock('../models/jury.model.js', () => ({
  default: { findAll: vi.fn(), findById: vi.fn() },
}));
vi.mock('../models/movie.model.js', () => ({
  default: { getById: vi.fn() },
}));

import juryAssignmentService from './jury-assignment.service.js';
import juryAssignmentModel from '../models/jury-assignment.model.js';
import juryModel from '../models/jury.model.js';
import movieModel from '../models/movie.model.js';

/** L'état nominal : rien d'attribué, 3 jurés, 4 films acceptés. */
const nominal = () => {
  vi.mocked(juryAssignmentModel.count).mockResolvedValue(0);
  vi.mocked(juryAssignmentModel.findAssignableMovieIds).mockResolvedValue([
    10, 20, 30, 40,
  ]);
  vi.mocked(juryModel.findAll).mockResolvedValue([
    { id: 1 },
    { id: 2 },
    { id: 3 },
  ] as never);
  vi.mocked(juryAssignmentModel.createMany).mockResolvedValue(8);
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('juryAssignmentService.distribute', () => {
  /**
   * La garde que le front applique déjà côté bouton. Elle doit exister des deux
   * côtés : un film jugé par un seul juré n'a pas de contradiction possible.
   */
  it('refuse en 422 quand il y a moins de deux jurés', async () => {
    nominal();
    vi.mocked(juryModel.findAll).mockResolvedValue([{ id: 1 }] as never);

    await expect(juryAssignmentService.distribute()).rejects.toThrow(AppError);
    await expect(juryAssignmentService.distribute()).rejects.toMatchObject({
      statusCode: 422,
    });
    expect(juryAssignmentModel.createMany).not.toHaveBeenCalled();
  });

  it("refuse en 422 quand aucun film n'est acceptable", async () => {
    nominal();
    vi.mocked(juryAssignmentModel.findAssignableMovieIds).mockResolvedValue([]);

    await expect(juryAssignmentService.distribute()).rejects.toMatchObject({
      statusCode: 422,
    });
    expect(juryAssignmentModel.createMany).not.toHaveBeenCalled();
  });

  /**
   * L'attribution est un acte unique : un second clic ne doit pas pouvoir
   * rebattre les cartes alors que les jurés ont commencé à noter. Passer par la
   * remise à zéro est un geste conscient, ce qu'un doublon de requête n'est pas.
   */
  it("refuse en 409 quand l'attribution a déjà eu lieu", async () => {
    nominal();
    vi.mocked(juryAssignmentModel.count).mockResolvedValue(200);

    await expect(juryAssignmentService.distribute()).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(juryAssignmentModel.createMany).not.toHaveBeenCalled();
  });

  /**
   * Le récap décrit ce qui a été écrit, pas ce qui a été demandé : c'est lui que
   * l'admin lit pour vérifier que l'attribution a couvert tout le monde.
   *
   * 4 films et 3 jurés donnent 8 attributions — deux jurés par film, répartis
   * 3/3/2. L'algorithme est testé à part ; ce qu'on vérifie ici, c'est que le
   * service lui transmet bien les identifiants lus en base et écrit sa sortie
   * telle quelle.
   */
  it('écrit les attributions calculées et en renvoie le récap', async () => {
    nominal();

    const summary = await juryAssignmentService.distribute();

    expect(summary).toEqual({
      movies: 4,
      juries: 3,
      assignments: 8,
      perJury: [
        { user_id: 1, assigned: 3 },
        { user_id: 2, assigned: 3 },
        { user_id: 3, assigned: 2 },
      ],
    });
    expect(juryAssignmentModel.createMany).toHaveBeenCalledOnce();
    expect(
      vi.mocked(juryAssignmentModel.createMany).mock.calls[0]![0],
    ).toHaveLength(8);
  });

  /**
   * Deux requêtes simultanées — un double-clic sur le bouton — lisent toutes
   * deux « rien d'attribué » avant que l'une n'ait inséré. La contrainte UNIQUE
   * arrête la seconde ; sans ce rattrapage, l'admin recevrait un 500 pour un
   * geste anodin.
   */
  it('traduit le doublon concurrent en 409, pas en 500', async () => {
    nominal();
    vi.mocked(juryAssignmentModel.createMany).mockRejectedValue({
      errno: 1062,
      code: 'ER_DUP_ENTRY',
      sqlMessage: 'Duplicate entry',
      sqlState: '23000',
    });

    await expect(juryAssignmentService.distribute()).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe('juryAssignmentService.assign', () => {
  /** Le juré et le film existants, le film notable : l'état qui doit passer. */
  const assignable = () => {
    vi.mocked(juryModel.findById).mockResolvedValue({ id: 1 } as never);
    vi.mocked(movieModel.getById).mockResolvedValue({
      id: 10,
      status: 'accepted',
    } as never);
  };

  it('confie le film au juré', async () => {
    assignable();

    await juryAssignmentService.assign(1, 10);

    expect(juryAssignmentModel.create).toHaveBeenCalledWith(1, 10);
  });

  /**
   * `juryModel.findById` filtre sur le rôle : un id d'admin en sort nul. Sans ce
   * contrôle, la clé étrangère accepterait l'insertion et un administrateur se
   * retrouverait avec une file de films à noter.
   */
  it("refuse en 404 un juré qui n'en est pas un", async () => {
    assignable();
    vi.mocked(juryModel.findById).mockResolvedValue(null);

    await expect(juryAssignmentService.assign(1, 10)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(juryAssignmentModel.create).not.toHaveBeenCalled();
  });

  it('refuse en 404 un film inexistant', async () => {
    assignable();
    vi.mocked(movieModel.getById).mockResolvedValue(null);

    await expect(juryAssignmentService.assign(1, 10)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(juryAssignmentModel.create).not.toHaveBeenCalled();
  });

  /**
   * Seul `accepted` se note. Confier un film en attente de revue remplirait la
   * file du juré d'un film que le formulaire de notation refuse — un lot faux
   * plutôt qu'une erreur visible.
   */
  it('refuse en 422 un film qui ne se note pas', async () => {
    assignable();
    vi.mocked(movieModel.getById).mockResolvedValue({
      id: 10,
      status: 'pending_review',
    } as never);

    await expect(juryAssignmentService.assign(1, 10)).rejects.toMatchObject({
      statusCode: 422,
    });
    expect(juryAssignmentModel.create).not.toHaveBeenCalled();
  });

  it('refuse en 409 un film déjà dans la file du juré', async () => {
    assignable();
    vi.mocked(juryAssignmentModel.create).mockRejectedValue({
      errno: 1062,
      code: 'ER_DUP_ENTRY',
      sqlMessage: 'Duplicate entry',
      sqlState: '23000',
    });

    await expect(juryAssignmentService.assign(1, 10)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe('juryAssignmentService.unassign', () => {
  it('retire le film de la file du juré', async () => {
    vi.mocked(juryAssignmentModel.remove).mockResolvedValue(1);

    await juryAssignmentService.unassign(1, 10);

    expect(juryAssignmentModel.remove).toHaveBeenCalledWith(1, 10);
  });

  /**
   * Retirer un film qui n'était pas dans la file n'est pas un succès : l'admin
   * croirait avoir agi sur un lot alors qu'il s'est trompé de juré.
   */
  it('refuse en 404 un film absent de la file', async () => {
    vi.mocked(juryAssignmentModel.remove).mockResolvedValue(0);

    await expect(juryAssignmentService.unassign(1, 10)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
