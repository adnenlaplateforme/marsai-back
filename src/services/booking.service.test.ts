import { describe, it, expect, vi, beforeEach } from 'vitest';
import AppError from '../helpers/AppError.js';
import type { Event } from '../types/interfaces/event.interface.js';

vi.mock('../models/booking.model.js', () => ({
  default: {
    countByEventId: vi.fn(),
    findByParticipantAndEvent: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
  },
}));
vi.mock('../models/event.model.js', () => ({
  default: { findById: vi.fn() },
}));
vi.mock('../models/participant.model.js', () => ({
  default: { findById: vi.fn() },
}));
vi.mock('./jwt.service.js', () => ({
  default: { signSubscribeEventToken: vi.fn(), verify: vi.fn() },
}));
vi.mock('./email.service.js', () => ({
  default: { sendMailSubscribeEvent: vi.fn() },
}));

import bookingService from './booking.service.js';
import bookingModel from '../models/booking.model.js';
import eventModel from '../models/event.model.js';
import participantModel from '../models/participant.model.js';
import jwtService from './jwt.service.js';
import emailService from './email.service.js';

const bookableEvent = {
  id: 1,
  title: 'Projection',
  description: 'Une belle projection',
  is_bookable: true,
  capacity: 100,
  // Event étend RowDataPacket : on ne renseigne que les champs utilisés ici.
} as unknown as Event;

describe('bookingService.create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lève une AppError 404 quand l'événement n'existe pas", async () => {
    vi.mocked(eventModel.findById).mockResolvedValue(null);

    await expect(bookingService.create(1, 10)).rejects.toThrowError(
      new AppError(404, 'Event not found'),
    );
    expect(bookingModel.create).not.toHaveBeenCalled();
  });

  it("lève une AppError 400 quand l'événement n'est pas réservable", async () => {
    vi.mocked(eventModel.findById).mockResolvedValue({
      ...bookableEvent,
      is_bookable: false,
    });

    await expect(bookingService.create(1, 10)).rejects.toThrowError(
      new AppError(400, 'This event is not bookable'),
    );
  });

  it("lève une AppError 409 quand l'événement est complet", async () => {
    vi.mocked(eventModel.findById).mockResolvedValue({
      ...bookableEvent,
      capacity: 2,
    });
    vi.mocked(bookingModel.countByEventId).mockResolvedValue(2);

    await expect(bookingService.create(1, 10)).rejects.toThrowError(
      new AppError(409, 'Event is full'),
    );
    expect(bookingModel.create).not.toHaveBeenCalled();
  });

  it('lève une AppError 409 quand le participant est déjà inscrit', async () => {
    vi.mocked(eventModel.findById).mockResolvedValue(bookableEvent);
    vi.mocked(bookingModel.countByEventId).mockResolvedValue(5);
    vi.mocked(bookingModel.findByParticipantAndEvent).mockResolvedValue({
      id: 3,
    } as never);

    await expect(bookingService.create(1, 10)).rejects.toThrowError(
      new AppError(409, 'Participant is already registered for this event'),
    );
    expect(bookingModel.create).not.toHaveBeenCalled();
  });

  it("crée la réservation et envoie l'email de confirmation", async () => {
    vi.mocked(eventModel.findById).mockResolvedValue(bookableEvent);
    vi.mocked(bookingModel.countByEventId).mockResolvedValue(5);
    vi.mocked(bookingModel.findByParticipantAndEvent).mockResolvedValue(null);
    vi.mocked(bookingModel.create).mockResolvedValue(42);
    vi.mocked(participantModel.findById).mockResolvedValue({
      id: 10,
      email: 'participant@test.com',
    } as never);
    vi.mocked(jwtService.signSubscribeEventToken).mockReturnValue('sub-token');

    const result = await bookingService.create(1, 10);

    expect(bookingModel.create).toHaveBeenCalledWith(1, 10);
    expect(jwtService.signSubscribeEventToken).toHaveBeenCalledWith({ id: 42 });
    expect(emailService.sendMailSubscribeEvent).toHaveBeenCalledWith(
      'participant@test.com',
      'Projection',
      'Une belle projection',
      'sub-token',
    );
    expect(result).toBe(42);
  });

  it('crée la réservation sans email quand le participant est introuvable', async () => {
    vi.mocked(eventModel.findById).mockResolvedValue(bookableEvent);
    vi.mocked(bookingModel.countByEventId).mockResolvedValue(5);
    vi.mocked(bookingModel.findByParticipantAndEvent).mockResolvedValue(null);
    vi.mocked(bookingModel.create).mockResolvedValue(42);
    vi.mocked(participantModel.findById).mockResolvedValue(null);

    const result = await bookingService.create(1, 10);

    expect(result).toBe(42);
    expect(emailService.sendMailSubscribeEvent).not.toHaveBeenCalled();
  });
});

describe('bookingService.unsubscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('vérifie le token et supprime la réservation correspondante', async () => {
    vi.mocked(jwtService.verify).mockReturnValue({ id: 7 } as never);
    vi.mocked(bookingModel.remove).mockResolvedValue(1);

    const result = await bookingService.unsubscribe('some-token');

    expect(jwtService.verify).toHaveBeenCalledWith('some-token');
    expect(bookingModel.remove).toHaveBeenCalledWith(7);
    expect(result).toBe(1);
  });
});
