import { describe, it, expect, vi, beforeEach } from 'vitest';
import AppError from '../helpers/AppError.js';

vi.mock('../models/movie_update.model.js', () => ({
  default: { findByToken: vi.fn() },
}));

import movieUpdateService from './movie-update.service.js';
import movieUpdateModel from '../models/movie_update.model.js';

describe('movieUpdateService.getByToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lève une AppError 404 quand le token n'existe pas", async () => {
    vi.mocked(movieUpdateModel.findByToken).mockResolvedValue(null);

    await expect(movieUpdateService.getByToken('unknown')).rejects.toThrowError(
      new AppError(404, 'movie update token not found'),
    );
  });

  it('retourne la demande de mise à jour associée au token', async () => {
    const movieUpdate = { id: 1, movie_id: 5, token: 'abc' };
    vi.mocked(movieUpdateModel.findByToken).mockResolvedValue(
      movieUpdate as never,
    );

    const result = await movieUpdateService.getByToken('abc');

    expect(movieUpdateModel.findByToken).toHaveBeenCalledWith('abc');
    expect(result).toBe(movieUpdate);
  });
});
