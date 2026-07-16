import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../models/newsletter.model.js', () => ({
  default: { create: vi.fn(), findAll: vi.fn() },
}));
vi.mock('../models/subscriber.model.js', () => ({
  default: { findAll: vi.fn() },
}));
vi.mock('./email.service.js', () => ({
  default: { sendMail: vi.fn() },
}));

import newsletterService from './newsletter.service.js';
import newsletterModel from '../models/newsletter.model.js';
import subscriberModel from '../models/subscriber.model.js';
import emailService from './email.service.js';

describe('newsletterService.create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('envoie immédiatement la newsletter aux abonnés quand sendAt est null', async () => {
    const subscribers = [{ email: 'a@test.com' }, { email: 'b@test.com' }];
    vi.mocked(newsletterModel.create).mockResolvedValue(15);
    vi.mocked(subscriberModel.findAll).mockResolvedValue(subscribers as never);

    const newsletter = { object: 'Objet', content: 'Contenu', sendAt: null };
    const result = await newsletterService.create(newsletter as never);

    expect(subscriberModel.findAll).toHaveBeenCalledOnce();
    expect(emailService.sendMail).toHaveBeenCalledWith(
      { ...newsletter, id: 15, sent: false },
      subscribers,
    );
    expect(result).toBe(15);
  });

  it("n'envoie pas d'email quand la newsletter est planifiée (sendAt défini)", async () => {
    vi.mocked(newsletterModel.create).mockResolvedValue(16);

    const newsletter = {
      object: 'Objet',
      content: 'Contenu',
      sendAt: new Date('2026-12-01'),
    };
    const result = await newsletterService.create(newsletter as never);

    expect(subscriberModel.findAll).not.toHaveBeenCalled();
    expect(emailService.sendMail).not.toHaveBeenCalled();
    expect(result).toBe(16);
  });
});

describe('newsletterService.findAll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retourne la liste des newsletters', async () => {
    const newsletters = [{ id: 1 }, { id: 2 }];
    vi.mocked(newsletterModel.findAll).mockResolvedValue(newsletters as never);

    const result = await newsletterService.findAll();

    expect(result).toBe(newsletters);
  });
});
