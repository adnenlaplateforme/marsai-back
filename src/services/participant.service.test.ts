import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../models/participant.model.js', () => ({
  default: { findByEmail: vi.fn(), create: vi.fn() },
}));

import participantService from './participant.service.js';
import participantModel from '../models/participant.model.js';

describe('participantService.findOrCreate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retourne le participant existant sans le recréer", async () => {
    const existing = {
      id: 3,
      firstname: 'Jean',
      lastname: 'Dupont',
      email: 'jean@test.com',
    };
    vi.mocked(participantModel.findByEmail).mockResolvedValue(existing as never);

    const result = await participantService.findOrCreate(
      'Jean',
      'Dupont',
      'jean@test.com',
    );

    expect(result).toBe(existing);
    expect(participantModel.create).not.toHaveBeenCalled();
  });

  it("crée le participant quand il n'existe pas encore", async () => {
    vi.mocked(participantModel.findByEmail).mockResolvedValue(null);
    vi.mocked(participantModel.create).mockResolvedValue(99);

    const result = await participantService.findOrCreate(
      'Alice',
      'Martin',
      'alice@test.com',
    );

    expect(participantModel.create).toHaveBeenCalledWith({
      firstname: 'Alice',
      lastname: 'Martin',
      email: 'alice@test.com',
    });
    expect(result).toEqual({
      id: 99,
      firstname: 'Alice',
      lastname: 'Martin',
      email: 'alice@test.com',
    });
  });
});
