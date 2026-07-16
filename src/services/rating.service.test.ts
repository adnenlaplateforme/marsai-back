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
