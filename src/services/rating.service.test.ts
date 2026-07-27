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
  },
}));

import ratingService from './rating.service.js';
import movieModel from '../models/movie.model.js';
import ratingModel from '../models/rating.model.js';

const ratingRequest = { note: 4, comment: 'super' };

describe('ratingService.rateMovieById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    vi.mocked(movieModel.getById).mockResolvedValue({ id: 5 } as never);
    vi.mocked(ratingModel.getByMovieIdAndUserId).mockResolvedValue({
      id: 99,
    } as never);

    await ratingService.rateMovieById(5, 10, ratingRequest);

    expect(ratingModel.getByMovieIdAndUserId).toHaveBeenCalledWith(10, 5);
    expect(ratingModel.update).toHaveBeenCalledWith(10, 5, 4, 'super');
    expect(ratingModel.create).not.toHaveBeenCalled();
  });

  it("crée une note quand il n'en existe pas encore", async () => {
    vi.mocked(movieModel.getById).mockResolvedValue({ id: 5 } as never);
    vi.mocked(ratingModel.getByMovieIdAndUserId).mockResolvedValue(null);

    await ratingService.rateMovieById(5, 10, ratingRequest);

    expect(ratingModel.create).toHaveBeenCalledWith(10, 5, 4, 'super');
    expect(ratingModel.update).not.toHaveBeenCalled();
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
    vi.mocked(movieModel.getById).mockResolvedValue({ id: 5 } as never);
    vi.mocked(ratingModel.getByMovieIdAndUserId).mockResolvedValue(null);

    await expect(
      ratingService.getCurrentJuryRatingByMovieId(5, 10),
    ).rejects.toThrowError(new AppError(404, 'Rating not found'));
  });

  it('retourne la note du juré courant', async () => {
    const rating = { id: 99, note: 8, comment: 'bien' };
    vi.mocked(movieModel.getById).mockResolvedValue({ id: 5 } as never);
    vi.mocked(ratingModel.getByMovieIdAndUserId).mockResolvedValue(
      rating as never,
    );

    const result = await ratingService.getCurrentJuryRatingByMovieId(5, 10);

    expect(ratingModel.getByMovieIdAndUserId).toHaveBeenCalledWith(10, 5);
    expect(result).toBe(rating);
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
