import { describe, it, expect, vi, beforeEach } from 'vitest';
import AppError from '../helpers/AppError.js';

vi.mock('../database/connection.js', () => ({
  default: {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
  },
}));
vi.mock('../models/jury-invite.model.js', () => ({
  default: { findByToken: vi.fn(), deleteByEmail: vi.fn() },
}));
vi.mock('../models/jury.model.js', () => ({
  default: { findAll: vi.fn(), create: vi.fn() },
}));
vi.mock('bcrypt', () => ({
  default: { hash: vi.fn() },
}));

import juryService from './jury.service.js';
import db from '../database/connection.js';
import juryInviteModel from '../models/jury-invite.model.js';
import juryModel from '../models/jury.model.js';
import bcrypt from 'bcrypt';

const body = {
  token: 'invite-token',
  firstname: 'Jean',
  lastname: 'Dupont',
  password: 'secret',
} as never;

describe('juryService.create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lève une AppError 404 quand l'invitation n'existe pas", async () => {
    vi.mocked(juryInviteModel.findByToken).mockResolvedValue(null);

    await expect(juryService.create(body)).rejects.toThrowError(
      new AppError(404, 'Invitation not found'),
    );
    expect(db.beginTransaction).not.toHaveBeenCalled();
  });

  it("crée le jury dans une transaction et supprime l'invitation", async () => {
    vi.mocked(juryInviteModel.findByToken).mockResolvedValue({
      email: 'jury@test.com',
    } as never);
    vi.mocked(bcrypt.hash).mockResolvedValue('hashed-pass' as never);

    await juryService.create(body);

    expect(db.beginTransaction).toHaveBeenCalledOnce();
    expect(juryModel.create).toHaveBeenCalledWith({
      email: 'jury@test.com',
      firstname: 'Jean',
      lastname: 'Dupont',
      password: 'hashed-pass',
    });
    expect(juryInviteModel.deleteByEmail).toHaveBeenCalledWith('jury@test.com');
    expect(db.commit).toHaveBeenCalledOnce();
    expect(db.rollback).not.toHaveBeenCalled();
  });

  it("effectue un rollback et propage l'erreur en cas d'échec", async () => {
    vi.mocked(juryInviteModel.findByToken).mockResolvedValue({
      email: 'jury@test.com',
    } as never);
    vi.mocked(bcrypt.hash).mockResolvedValue('hashed-pass' as never);
    const dbError = new Error('insert failed');
    vi.mocked(juryModel.create).mockRejectedValue(dbError);

    await expect(juryService.create(body)).rejects.toThrow(dbError);

    expect(db.rollback).toHaveBeenCalledOnce();
    expect(db.commit).not.toHaveBeenCalled();
  });
});

describe('juryService.findAll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retourne la liste des jurys', async () => {
    const juries = [{ id: 1 }, { id: 2 }];
    vi.mocked(juryModel.findAll).mockResolvedValue(juries as never);

    const result = await juryService.findAll();

    expect(result).toBe(juries);
  });
});
