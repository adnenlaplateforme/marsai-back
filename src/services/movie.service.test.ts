import { describe, it, expect, vi, beforeEach } from 'vitest';
import AppError from '../helpers/AppError.js';

vi.mock('../database/connection.js', () => ({
  default: {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
  },
}));
vi.mock('../models/movie.model.js', () => ({
  default: {
    getBySlug: vi.fn(),
    create: vi.fn(),
    getAll: vi.fn(),
    getById: vi.fn(),
    remove: vi.fn(),
    update: vi.fn(),
    getAllSorted: vi.fn(),
    getRandom: vi.fn(),
  },
}));
vi.mock('../models/collaborator.model.js', () => ({
  default: { createDirector: vi.fn(), create: vi.fn(), remove: vi.fn() },
}));
vi.mock('../models/image.model.js', () => ({
  default: { insertMultiple: vi.fn(), remove: vi.fn() },
}));
vi.mock('../models/movie_update.model.js', () => ({
  default: { create: vi.fn(), deleteByToken: vi.fn() },
}));
vi.mock('./email.service.js', () => ({
  default: { statusUpdatePendingMail: vi.fn(), statusUpdateMail: vi.fn() },
}));

import movieService from './movie.service.js';
import db from '../database/connection.js';
import movieModel from '../models/movie.model.js';
import collaboratorModel from '../models/collaborator.model.js';
import imageModel from '../models/image.model.js';
import movieUpdateModel from '../models/movie_update.model.js';
import emailService from './email.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('movieService.create', () => {
  const movieRequest = {
    originalTitle: 'The Movie',
    director: { firstname: 'Jane', lastname: 'Doe' },
    collaborators: [{ firstname: 'Bob' }],
    stillsUrls: ['a.jpg', 'b.jpg'],
  } as never;

  it('crée le film dans une transaction et retourne son id', async () => {
    vi.mocked(movieModel.getBySlug).mockResolvedValue(null);
    vi.mocked(movieModel.create).mockResolvedValue(10);

    const result = await movieService.create(movieRequest);

    expect(db.beginTransaction).toHaveBeenCalledOnce();
    const created = vi.mocked(movieModel.create).mock.calls[0]?.[0] as {
      slug: string;
    };
    expect(created.slug).toBe('the-movie');
    expect(collaboratorModel.createDirector).toHaveBeenCalledWith(
      { firstname: 'Jane', lastname: 'Doe' },
      10,
    );
    expect(collaboratorModel.create).toHaveBeenCalledWith(
      [{ firstname: 'Bob' }],
      10,
    );
    expect(imageModel.insertMultiple).toHaveBeenCalledWith(
      ['a.jpg', 'b.jpg'],
      10,
    );
    expect(db.commit).toHaveBeenCalledOnce();
    expect(result).toEqual({ movieId: 10 });
  });

  it("effectue un rollback et propage l'erreur en cas d'échec", async () => {
    vi.mocked(movieModel.getBySlug).mockResolvedValue(null);
    const dbError = new Error('insert failed');
    vi.mocked(movieModel.create).mockRejectedValue(dbError);

    await expect(movieService.create(movieRequest)).rejects.toThrow(dbError);

    expect(db.rollback).toHaveBeenCalledOnce();
    expect(db.commit).not.toHaveBeenCalled();
  });
});

describe('movieService.getById', () => {
  it("lève une AppError 404 quand le film n'existe pas", async () => {
    vi.mocked(movieModel.getById).mockResolvedValue(null);

    await expect(movieService.getById(1)).rejects.toThrowError(
      new AppError(404, 'film not found'),
    );
  });

  it('retourne le film quand il existe', async () => {
    const movie = { id: 1, originalTitle: 'The Movie' };
    vi.mocked(movieModel.getById).mockResolvedValue(movie as never);

    const result = await movieService.getById(1);

    expect(result).toBe(movie);
  });
});

describe('movieService.remove', () => {
  it('supprime le film et ses dépendances dans une transaction', async () => {
    vi.mocked(movieModel.remove).mockResolvedValue(1);

    await movieService.remove(5);

    expect(collaboratorModel.remove).toHaveBeenCalledWith(5);
    expect(imageModel.remove).toHaveBeenCalledWith(5);
    expect(movieModel.remove).toHaveBeenCalledWith(5);
    expect(db.commit).toHaveBeenCalledOnce();
    expect(db.rollback).not.toHaveBeenCalled();
  });

  it('effectue un rollback et lève 404 quand aucune ligne affectée', async () => {
    vi.mocked(movieModel.remove).mockResolvedValue(0);

    await expect(movieService.remove(5)).rejects.toThrowError(
      new AppError(404, 'film not found'),
    );
    expect(db.rollback).toHaveBeenCalledOnce();
    expect(db.commit).not.toHaveBeenCalled();
  });
});

describe('movieService.update', () => {
  it('génère un slug, remplace les stills et supprime le token', async () => {
    vi.mocked(movieModel.getBySlug).mockResolvedValue(null);
    vi.mocked(movieModel.update).mockResolvedValue(1);

    const request = {
      originalTitle: 'New Title',
      stillsUrls: ['x.jpg'],
    } as never;
    const result = await movieService.update(3, request, 'tok');

    const updated = vi.mocked(movieModel.update).mock.calls[0]?.[1] as {
      slug: string;
    };
    expect(updated.slug).toBe('new-title');
    expect(imageModel.remove).toHaveBeenCalledWith(3);
    expect(imageModel.insertMultiple).toHaveBeenCalledWith(['x.jpg'], 3);
    expect(movieUpdateModel.deleteByToken).toHaveBeenCalledWith('tok');
    expect(result).toBe(1);
  });

  it('ne régénère pas de slug ni ne touche aux images sans titre ni stills', async () => {
    vi.mocked(movieModel.update).mockResolvedValue(1);

    const request = { synopsis: 'maj' } as never;
    await movieService.update(3, request, 'tok');

    expect(movieModel.getBySlug).not.toHaveBeenCalled();
    expect(imageModel.remove).not.toHaveBeenCalled();
    expect(imageModel.insertMultiple).not.toHaveBeenCalled();
    expect(movieUpdateModel.deleteByToken).toHaveBeenCalledWith('tok');
  });
});

describe('movieService.adminUpdate', () => {
  it("lève une AppError 404 quand le film n'existe pas", async () => {
    vi.mocked(movieModel.getById).mockResolvedValue(null);

    await expect(
      movieService.adminUpdate(1, {
        adminData: { adminStatus: 'accepted' },
      } as never),
    ).rejects.toThrowError(new AppError(404, 'film not found'));
  });

  it('envoie un mail de demande de modification et crée un token pour pending_change', async () => {
    vi.mocked(movieModel.getById).mockResolvedValue({ id: 7 } as never);
    vi.mocked(movieModel.update).mockResolvedValue(1);

    const request = {
      adminData: { adminStatus: 'pending_change', adminText: 'à revoir' },
    } as never;
    const result = await movieService.adminUpdate(7, request);

    expect(emailService.statusUpdatePendingMail).toHaveBeenCalledOnce();
    expect(movieUpdateModel.create).toHaveBeenCalledWith(7, expect.any(String));
    expect(emailService.statusUpdateMail).not.toHaveBeenCalled();
    expect(movieModel.update).toHaveBeenCalledWith(7, {});
    expect(result).toBe(1);
  });

  it('envoie un mail de statut pour un statut final (accepted)', async () => {
    vi.mocked(movieModel.getById).mockResolvedValue({ id: 7 } as never);
    vi.mocked(movieModel.update).mockResolvedValue(1);

    const request = {
      adminData: { adminStatus: 'accepted', adminText: 'bravo' },
    } as never;
    await movieService.adminUpdate(7, request);

    expect(emailService.statusUpdateMail).toHaveBeenCalledOnce();
    expect(emailService.statusUpdatePendingMail).not.toHaveBeenCalled();
    expect(movieUpdateModel.create).not.toHaveBeenCalled();
  });

  it('lève une AppError 400 pour un statut inconnu', async () => {
    vi.mocked(movieModel.getById).mockResolvedValue({ id: 7 } as never);

    const request = {
      adminData: { adminStatus: 'unknown', adminText: '' },
    } as never;
    await expect(movieService.adminUpdate(7, request)).rejects.toThrowError(
      new AppError(400, 'wrong movie status'),
    );
    expect(movieModel.update).not.toHaveBeenCalled();
  });
});

describe('movieService.getRandom', () => {
  it("lève une AppError 404 quand aucun film n'est retourné", async () => {
    vi.mocked(movieModel.getRandom).mockResolvedValue(null as never);

    await expect(movieService.getRandom(3)).rejects.toThrowError(
      new AppError(404, 'film not found'),
    );
  });

  it('retourne les films aléatoires', async () => {
    const movies = [{ id: 1 }, { id: 2 }];
    vi.mocked(movieModel.getRandom).mockResolvedValue(movies as never);

    const result = await movieService.getRandom(2);

    expect(movieModel.getRandom).toHaveBeenCalledWith(2);
    expect(result).toBe(movies);
  });
});
