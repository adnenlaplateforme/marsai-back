import { describe, it, expect, vi, beforeEach } from 'vitest';
import AppError from '../helpers/AppError.js';

vi.mock('../models/jury-invite.model.js', () => ({
  default: { create: vi.fn() },
}));
vi.mock('../models/jury.model.js', () => ({
  default: { findInEmails: vi.fn() },
}));
vi.mock('./email.service.js', () => ({
  default: { sendJuryInvites: vi.fn() },
}));

import juryInviteService from './jury-invite.service.js';
import juryInviteModel from '../models/jury-invite.model.js';
import juryModel from '../models/jury.model.js';
import emailService from './email.service.js';

const request = {
  juries: [{ email: 'a@test.com' }, { email: 'b@test.com' }],
} as never;

describe('juryInviteService.create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lève une AppError 409 quand un email existe déjà (vérification préalable)", async () => {
    vi.mocked(juryModel.findInEmails).mockResolvedValue([
      { email: 'a@test.com' },
    ] as never);

    await expect(juryInviteService.create(request)).rejects.toThrowError(
      new AppError(409, 'Email already used', {
        field: 'email',
        value: 'a@test.com',
      }),
    );
    expect(juryInviteModel.create).not.toHaveBeenCalled();
  });

  it('crée les invitations avec un token puis envoie les emails', async () => {
    vi.mocked(juryModel.findInEmails).mockResolvedValue([]);

    await juryInviteService.create(request);

    const invites = vi.mocked(juryInviteModel.create).mock.calls[0]?.[0] as {
      email: string;
      token: string;
    }[];
    expect(invites).toHaveLength(2);
    expect(invites[0]?.email).toBe('a@test.com');
    expect(invites[0]?.token).toEqual(expect.any(String));
    expect(emailService.sendJuryInvites).toHaveBeenCalledWith(invites);
  });

  it('traduit une erreur MySQL doublon (1062) en AppError 409', async () => {
    vi.mocked(juryModel.findInEmails).mockResolvedValue([]);
    vi.mocked(juryInviteModel.create).mockRejectedValue({
      errno: 1062,
      code: 'ER_DUP_ENTRY',
      sqlState: '23000',
      sqlMessage: "Duplicate entry 'dup@test.com' for key 'email'",
    });

    await expect(juryInviteService.create(request)).rejects.toThrowError(
      new AppError(409, 'Email already used', {
        field: 'email',
        value: 'dup@test.com',
      }),
    );
    expect(emailService.sendJuryInvites).not.toHaveBeenCalled();
  });

  it('propage une erreur non-MySQL telle quelle', async () => {
    vi.mocked(juryModel.findInEmails).mockResolvedValue([]);
    const genericError = new Error('boom');
    vi.mocked(juryInviteModel.create).mockRejectedValue(genericError);

    await expect(juryInviteService.create(request)).rejects.toThrow(
      genericError,
    );
  });
});
