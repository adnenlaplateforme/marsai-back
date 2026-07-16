import { describe, it, expect, vi, beforeEach } from 'vitest';
import AppError from '../helpers/AppError.js';

vi.mock('../models/subscriber.model.js', () => ({
  default: { create: vi.fn(), remove: vi.fn() },
}));

import subscriberService from './subscriber.service.js';
import subscriberModel from '../models/subscriber.model.js';

const sub = { email: 'sub@test.com' } as never;

describe('subscriberService.subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retourne l'id du nouvel abonné", async () => {
    vi.mocked(subscriberModel.create).mockResolvedValue(7);

    const result = await subscriberService.subscribe(sub);

    expect(subscriberModel.create).toHaveBeenCalledWith(sub);
    expect(result).toBe(7);
  });

  it('traduit une erreur MySQL doublon (1062) en AppError 409', async () => {
    vi.mocked(subscriberModel.create).mockRejectedValue({
      errno: 1062,
      code: 'ER_DUP_ENTRY',
      sqlState: '23000',
      sqlMessage: "Duplicate entry 'sub@test.com'",
    });

    await expect(subscriberService.subscribe(sub)).rejects.toThrowError(
      new AppError(409, 'Email already used'),
    );
  });

  it('propage une erreur non-MySQL telle quelle', async () => {
    const genericError = new Error('boom');
    vi.mocked(subscriberModel.create).mockRejectedValue(genericError);

    await expect(subscriberService.subscribe(sub)).rejects.toThrow(
      genericError,
    );
  });
});

describe('subscriberService.unsubscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('supprime l\'abonné et retourne le nombre de lignes affectées', async () => {
    vi.mocked(subscriberModel.remove).mockResolvedValue(1);

    const result = await subscriberService.unsubscribe(sub);

    expect(subscriberModel.remove).toHaveBeenCalledWith(sub);
    expect(result).toBe(1);
  });
});
