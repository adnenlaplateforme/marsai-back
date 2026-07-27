import { describe, it, expect } from 'vitest';
import AppError from './AppError.js';

describe('AppError', () => {
  it("s'identifie sous le nom AppError", () => {
    expect(new AppError(404, 'Not found').name).toBe('AppError');
  });

  it('préfixe sa stack avec AppError plutôt que Error', () => {
    const error = new AppError(400, 'Wrong query params');

    // C'est l'intérêt du name : distinguer d'un coup d'œil, dans une stack de
    // production, une erreur métier volontaire d'un plantage inattendu.
    expect(error.stack).toMatch(/^AppError: Wrong query params/);
  });

  it('reste une Error et conserve statusCode, message et error', () => {
    const details = { field: 'id' };
    const error = new AppError(422, 'Invalid', details);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(422);
    expect(error.message).toBe('Invalid');
    expect(error.error).toBe(details);
  });
});
