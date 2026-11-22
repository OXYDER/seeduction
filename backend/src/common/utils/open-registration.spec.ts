import { DEFAULT_OPEN_REGISTRATION, normalizeOpenRegistration } from './open-registration';

describe('normalizeOpenRegistration', () => {
  it('fermé par défaut, avec des limites prudentes', () => {
    expect(normalizeOpenRegistration(undefined)).toEqual(DEFAULT_OPEN_REGISTRATION);
    expect(DEFAULT_OPEN_REGISTRATION.enabled).toBe(false);
    expect(DEFAULT_OPEN_REGISTRATION.perIpPerDay).toBeGreaterThan(0);
    expect(DEFAULT_OPEN_REGISTRATION.maxPerDay).toBeGreaterThan(0);
  });

  it('garde les valeurs valides, borne les autres', () => {
    expect(normalizeOpenRegistration({ enabled: true, perIpPerDay: 5, maxPerDay: 50 })).toEqual({ enabled: true, perIpPerDay: 5, maxPerDay: 50 });
    expect(normalizeOpenRegistration({ perIpPerDay: 9999, maxPerDay: 99999 })).toMatchObject({ perIpPerDay: 100, maxPerDay: 10_000 });
    expect(normalizeOpenRegistration({ perIpPerDay: -4 }).perIpPerDay).toBe(0);
    expect(normalizeOpenRegistration({ perIpPerDay: '7' }).perIpPerDay).toBe(7);
  });

  it('0 = aucune limite ; une valeur absente ou invalide garde la précédente', () => {
    const prev = { enabled: true, perIpPerDay: 4, maxPerDay: 80 };
    expect(normalizeOpenRegistration({ perIpPerDay: 0, maxPerDay: 0 }, prev)).toEqual({ enabled: true, perIpPerDay: 0, maxPerDay: 0 });
    expect(normalizeOpenRegistration({}, prev)).toEqual(prev);
    expect(normalizeOpenRegistration({ enabled: 'oui', perIpPerDay: 'beaucoup' }, prev)).toEqual(prev);
  });
});
