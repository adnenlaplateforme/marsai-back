import { describe, it, expect, vi, beforeEach } from 'vitest';
import AppError from '../helpers/AppError.js';

vi.mock('../models/event.model.js', () => ({
  default: {
    create: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    findBySlug: vi.fn(),
    existsById: vi.fn(),
    getRemainingSeats: vi.fn(),
    remove: vi.fn(),
    update: vi.fn(),
  },
}));

import eventService from './event.service.js';
import eventModel from '../models/event.model.js';

describe('eventService.create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('génère un slug depuis le titre quand aucun slug fourni', async () => {
    vi.mocked(eventModel.findBySlug).mockResolvedValue(null);

    const body = { title: 'Mon Événement' } as never;
    await eventService.create(body);

    expect(eventModel.create).toHaveBeenCalledTimes(1);
    const created = vi.mocked(eventModel.create).mock.calls[0]?.[0] as {
      slug: string;
    };
    expect(created.slug).toBe('mon-evenement');
  });

  it('conserve le slug fourni sans en générer un nouveau', async () => {
    const body = { title: 'Mon Événement', slug: 'slug-perso' } as never;
    await eventService.create(body);

    expect(eventModel.findBySlug).not.toHaveBeenCalled();
    const created = vi.mocked(eventModel.create).mock.calls[0]?.[0] as {
      slug: string;
    };
    expect(created.slug).toBe('slug-perso');
  });
});

describe('eventService.findById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lève une AppError 404 quand l'événement n'existe pas", async () => {
    vi.mocked(eventModel.findById).mockResolvedValue(null);

    await expect(eventService.findById(1)).rejects.toThrowError(
      new AppError(404, 'Event not found'),
    );
  });

  it("retourne l'événement quand il existe", async () => {
    const event = { id: 1, title: 'Projection' } as never;
    vi.mocked(eventModel.findById).mockResolvedValue(event);

    const result = await eventService.findById(1, 'fr');

    expect(eventModel.findById).toHaveBeenCalledWith(1, 'fr');
    expect(result).toBe(event);
  });
});

describe('eventService.getRemainingSeats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lève une AppError 404 quand l'événement n'existe pas (null)", async () => {
    vi.mocked(eventModel.getRemainingSeats).mockResolvedValue(null);

    await expect(eventService.getRemainingSeats(1)).rejects.toThrowError(
      new AppError(404, 'Event not found'),
    );
  });

  it('retourne le nombre de places restantes', async () => {
    vi.mocked(eventModel.getRemainingSeats).mockResolvedValue(12);

    const result = await eventService.getRemainingSeats(1);

    expect(result).toBe(12);
  });
});

describe('eventService.remove', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lève une AppError 404 quand aucune ligne affectée', async () => {
    vi.mocked(eventModel.remove).mockResolvedValue(0);

    await expect(eventService.remove(1)).rejects.toThrowError(
      new AppError(404, 'Event not found'),
    );
  });

  it('ne lève pas quand la suppression a affecté une ligne', async () => {
    vi.mocked(eventModel.remove).mockResolvedValue(1);

    await expect(eventService.remove(1)).resolves.toBeUndefined();
  });
});

describe('eventService.update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('génère un slug quand le titre change sans slug fourni', async () => {
    vi.mocked(eventModel.existsById).mockResolvedValue(true);
    vi.mocked(eventModel.findBySlug).mockResolvedValue(null);
    vi.mocked(eventModel.update).mockResolvedValue(1);

    const body = { title: 'Nouveau Titre' } as never;
    await eventService.update(5, body);

    const updated = vi.mocked(eventModel.update).mock.calls[0]?.[1] as {
      slug: string;
    };
    expect(updated.slug).toBe('nouveau-titre');
  });

  /**
   * Le 404 se lit sur l'existence de l'événement, et non plus sur le nombre de
   * lignes affectées : MySQL ne compte que les lignes réellement *changées*, si
   * bien qu'un formulaire d'édition renvoyant des valeurs identiques passait
   * pour un événement introuvable.
   */
  it("lève une AppError 404 quand l'événement n'existe pas", async () => {
    vi.mocked(eventModel.existsById).mockResolvedValue(false);

    const body = { location: 'Paris' } as never;
    await expect(eventService.update(5, body)).rejects.toThrowError(
      new AppError(404, 'Event not found'),
    );
    expect(eventModel.update).not.toHaveBeenCalled();
  });

  it('accepte une modification qui ne change aucune valeur', async () => {
    vi.mocked(eventModel.existsById).mockResolvedValue(true);
    vi.mocked(eventModel.update).mockResolvedValue(0);

    const body = { location: 'Paris' } as never;
    await expect(eventService.update(5, body)).resolves.toBeUndefined();
  });
});
