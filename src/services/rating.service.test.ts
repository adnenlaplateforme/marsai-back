import { describe, it, expect, vi, beforeEach } from 'vitest';
import AppError from '../helpers/AppError.js';

vi.mock('../models/movie.model.js', () => ({
  default: { getById: vi.fn() },
}));
vi.mock('../models/rating.model.js', () => ({
  default: {
    getByMovieIdAndUserId: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    findAllByMovieId: vi.fn(),
    findRatedMoviesByUserId: vi.fn(),
    findMoviesToRateByUserId: vi.fn(),
    findMoviesWithRatingAverage: vi.fn(),
  },
}));
vi.mock('../models/jury-assignment.model.js', () => ({
  default: { isAssigned: vi.fn() },
}));

import ratingService from './rating.service.js';
import movieModel from '../models/movie.model.js';
import ratingModel from '../models/rating.model.js';
import juryAssignmentModel from '../models/jury-assignment.model.js';
import { JURY_RATABLE_STATUS } from '../helpers/jury-visibility.js';
import { MovieStatus } from '../types/enums/movie-status.enum.js';

const ratingRequest = { note: 4, comment: 'super' };

/**
 * Les deux routes du jury vérifient le statut du film : sans lui sur le film
 * mocké, elles s'arrêteraient sur un 403 avant même d'atteindre le modèle de
 * notes.
 */
const acceptedMovie = { id: 5, status: JURY_RATABLE_STATUS };

describe('ratingService.rateMovieById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Le film est dans le lot par défaut : les cas ci-dessous portent sur
    // l'existence, le statut et l'écrasement de la note, pas sur l'attribution,
    // qui a son propre bloc plus bas.
    vi.mocked(juryAssignmentModel.isAssigned).mockResolvedValue(true);
  });

  it("lève une AppError 404 quand le film n'existe pas", async () => {
    vi.mocked(movieModel.getById).mockResolvedValue(null);

    await expect(
      ratingService.rateMovieById(1, 10, ratingRequest),
    ).rejects.toThrowError(new AppError(404, 'Movie not found'));
    expect(ratingModel.create).not.toHaveBeenCalled();
    expect(ratingModel.update).not.toHaveBeenCalled();
  });

  it('met à jour la note quand une note existe déjà', async () => {
    vi.mocked(movieModel.getById).mockResolvedValue(acceptedMovie as never);
    vi.mocked(ratingModel.getByMovieIdAndUserId).mockResolvedValue({
      id: 99,
    } as never);

    await ratingService.rateMovieById(5, 10, ratingRequest);

    expect(ratingModel.getByMovieIdAndUserId).toHaveBeenCalledWith(10, 5);
    expect(ratingModel.update).toHaveBeenCalledWith(10, 5, 4, 'super');
    expect(ratingModel.create).not.toHaveBeenCalled();
  });

  it("crée une note quand il n'en existe pas encore", async () => {
    vi.mocked(movieModel.getById).mockResolvedValue(acceptedMovie as never);
    vi.mocked(ratingModel.getByMovieIdAndUserId).mockResolvedValue(null);

    await ratingService.rateMovieById(5, 10, ratingRequest);

    expect(ratingModel.create).toHaveBeenCalledWith(10, 5, 4, 'super');
    expect(ratingModel.update).not.toHaveBeenCalled();
  });

  /**
   * Le film existe mais n'est pas ouvert à la délibération. 403 et non 404 :
   * `/movies/:id` est public, l'existence du film n'est pas un secret.
   */
  it.each([
    MovieStatus.PENDING_REVIEW,
    MovieStatus.PENDING_CHANGE,
    MovieStatus.REJECTED,
    MovieStatus.SELECTED,
    MovieStatus.WINNER,
  ])('refuse de noter un film au statut %s', async (status) => {
    vi.mocked(movieModel.getById).mockResolvedValue({ id: 5, status } as never);

    await expect(
      ratingService.rateMovieById(5, 10, ratingRequest),
    ).rejects.toThrowError(new AppError(403, 'Movie not open to jury rating'));
    expect(ratingModel.create).not.toHaveBeenCalled();
    expect(ratingModel.update).not.toHaveBeenCalled();
  });

  /**
   * Le lot fait partie des gardes de la notation, au même titre que le statut.
   * La route prend un id dans l'URL : elle ne peut pas se reposer sur le filtre
   * de `/movies/to-rate` pour la borner.
   */
  it("refuse de noter un film qui n'est pas dans le lot du juré", async () => {
    vi.mocked(movieModel.getById).mockResolvedValue(acceptedMovie as never);
    vi.mocked(juryAssignmentModel.isAssigned).mockResolvedValue(false);

    await expect(
      ratingService.rateMovieById(5, 10, ratingRequest),
    ).rejects.toThrowError(new AppError(403, 'Movie not assigned to you'));
    expect(juryAssignmentModel.isAssigned).toHaveBeenCalledWith(10, 5);
    expect(ratingModel.create).not.toHaveBeenCalled();
    expect(ratingModel.update).not.toHaveBeenCalled();
  });

  /**
   * Le refus est le même qu'il y ait ou non une note antérieure : une note
   * posée avant l'attribution devient figée, pas rouvrable. Le lot commande ce
   * qu'un juré peut noter, pas ce qu'il peut relire — `/ratings/me` et
   * `/movies/rated` continuent de la lui montrer.
   */
  it('refuse aussi de corriger une note déjà posée hors du lot', async () => {
    vi.mocked(movieModel.getById).mockResolvedValue(acceptedMovie as never);
    vi.mocked(juryAssignmentModel.isAssigned).mockResolvedValue(false);
    vi.mocked(ratingModel.getByMovieIdAndUserId).mockResolvedValue({
      id: 99,
    } as never);

    await expect(
      ratingService.rateMovieById(5, 10, ratingRequest),
    ).rejects.toThrowError(new AppError(403, 'Movie not assigned to you'));
    expect(ratingModel.update).not.toHaveBeenCalled();
  });

  /**
   * Le statut passe avant le lot : sur un film refusé et non attribué, « le vote
   * est clos » est la raison la plus fondamentale, et c'est celle que le juré
   * doit lire. Sans cet ordre, le message dépendrait de l'ordre des `await`.
   */
  it('annonce le statut plutôt que le lot quand les deux manquent', async () => {
    vi.mocked(movieModel.getById).mockResolvedValue({
      id: 5,
      status: MovieStatus.REJECTED,
    } as never);
    vi.mocked(juryAssignmentModel.isAssigned).mockResolvedValue(false);

    await expect(
      ratingService.rateMovieById(5, 10, ratingRequest),
    ).rejects.toThrowError(new AppError(403, 'Movie not open to jury rating'));
  });
});

describe('ratingService.getRatingsByMovieId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lève une AppError 404 quand le film n'existe pas", async () => {
    vi.mocked(movieModel.getById).mockResolvedValue(null);

    await expect(ratingService.getRatingsByMovieId(1)).rejects.toThrowError(
      new AppError(404, 'Movie not found'),
    );
    expect(ratingModel.findAllByMovieId).not.toHaveBeenCalled();
  });

  it('retourne les notes du film', async () => {
    const ratings = [{ note: 5 }, { note: 3 }];
    vi.mocked(movieModel.getById).mockResolvedValue({ id: 7 } as never);
    vi.mocked(ratingModel.findAllByMovieId).mockResolvedValue(ratings as never);

    const result = await ratingService.getRatingsByMovieId(7);

    expect(ratingModel.findAllByMovieId).toHaveBeenCalledWith(7);
    expect(result).toBe(ratings);
  });
});

describe('ratingService.getCurrentJuryRatingByMovieId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lève une AppError 404 quand le film n'existe pas", async () => {
    vi.mocked(movieModel.getById).mockResolvedValue(null);

    await expect(
      ratingService.getCurrentJuryRatingByMovieId(1, 10),
    ).rejects.toThrowError(new AppError(404, 'Movie not found'));
    expect(ratingModel.getByMovieIdAndUserId).not.toHaveBeenCalled();
  });

  it("lève une AppError 404 quand le juré n'a pas encore noté le film", async () => {
    vi.mocked(movieModel.getById).mockResolvedValue(acceptedMovie as never);
    vi.mocked(ratingModel.getByMovieIdAndUserId).mockResolvedValue(null);

    await expect(
      ratingService.getCurrentJuryRatingByMovieId(5, 10),
    ).rejects.toThrowError(new AppError(404, 'Rating not found'));
  });

  it('retourne la note du juré courant', async () => {
    const rating = { id: 99, note: 8, comment: 'bien' };
    vi.mocked(movieModel.getById).mockResolvedValue(acceptedMovie as never);
    vi.mocked(ratingModel.getByMovieIdAndUserId).mockResolvedValue(
      rating as never,
    );

    const result = await ratingService.getCurrentJuryRatingByMovieId(5, 10);

    expect(ratingModel.getByMovieIdAndUserId).toHaveBeenCalledWith(10, 5);
    expect(result).toBe(rating);
  });

  /**
   * Un garde plus large que celui de la notation : ces trois statuts-là
   * ferment le vote, pas la lecture. C'est ce qui permet à un juré de relire
   * la note qu'il a posée sur un film que l'admin a promu depuis.
   */
  it.each([MovieStatus.SELECTED, MovieStatus.WINNER])(
    'laisse relire la note sur un film au statut %s',
    async (status) => {
      const rating = { id: 99, note: 8 };
      vi.mocked(movieModel.getById).mockResolvedValue({
        id: 5,
        status,
      } as never);
      vi.mocked(ratingModel.getByMovieIdAndUserId).mockResolvedValue(
        rating as never,
      );

      await expect(
        ratingService.getCurrentJuryRatingByMovieId(5, 10),
      ).resolves.toBe(rating);
    },
  );

  it.each([
    MovieStatus.PENDING_REVIEW,
    MovieStatus.PENDING_CHANGE,
    MovieStatus.REJECTED,
  ])('refuse la lecture sur un film au statut %s', async (status) => {
    vi.mocked(movieModel.getById).mockResolvedValue({ id: 5, status } as never);

    await expect(
      ratingService.getCurrentJuryRatingByMovieId(5, 10),
    ).rejects.toThrowError(new AppError(403, 'Movie not visible to jury'));
    expect(ratingModel.getByMovieIdAndUserId).not.toHaveBeenCalled();
  });
});

describe('ratingService.getRatedMoviesByJury', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retourne les films notés par le juré', async () => {
    const movies = [
      { id: 1, english_title: 'First', note: 8 },
      { id: 2, english_title: 'Second', note: 5 },
    ];
    vi.mocked(ratingModel.findRatedMoviesByUserId).mockResolvedValue(
      movies as never,
    );

    const result = await ratingService.getRatedMoviesByJury(10);

    expect(ratingModel.findRatedMoviesByUserId).toHaveBeenCalledWith(10);
    expect(result).toBe(movies);
  });

  it("retourne un tableau vide quand le juré n'a rien noté", async () => {
    vi.mocked(ratingModel.findRatedMoviesByUserId).mockResolvedValue([]);

    await expect(ratingService.getRatedMoviesByJury(10)).resolves.toEqual([]);
  });
});

describe('ratingService.getMoviesToRateByJury', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retourne les films restant à noter', async () => {
    const movies = [{ id: 3, english_title: 'Third' }];
    vi.mocked(ratingModel.findMoviesToRateByUserId).mockResolvedValue(
      movies as never,
    );

    const result = await ratingService.getMoviesToRateByJury(10);

    expect(ratingModel.findMoviesToRateByUserId).toHaveBeenCalledWith(10);
    expect(result).toBe(movies);
  });

  it('retourne un tableau vide quand tout est noté', async () => {
    vi.mocked(ratingModel.findMoviesToRateByUserId).mockResolvedValue([]);

    await expect(ratingService.getMoviesToRateByJury(10)).resolves.toEqual([]);
  });
});

describe('ratingService.getMoviesRatingAverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retourne le classement des films par moyenne', async () => {
    const ranking = [
      { id: 1, english_title: 'First', average: 8.5, votes: 4 },
      { id: 2, english_title: 'Second', average: 6.25, votes: 4 },
    ];
    vi.mocked(ratingModel.findMoviesWithRatingAverage).mockResolvedValue(
      ranking as never,
    );

    const result = await ratingService.getMoviesRatingAverage();

    expect(ratingModel.findMoviesWithRatingAverage).toHaveBeenCalledWith();
    expect(result).toBe(ranking);
  });

  it("retourne un tableau vide quand aucun film n'existe", async () => {
    vi.mocked(ratingModel.findMoviesWithRatingAverage).mockResolvedValue([]);

    await expect(ratingService.getMoviesRatingAverage()).resolves.toEqual([]);
  });
});
