import { DEFAULT_DONATION_CONFIG, extendFrom, sanitizeDonationConfig, tierFor } from './donations.config';

describe('dons : réglages et paliers', () => {
  it('palier le plus haut dont le montant est atteint', () => {
    const t = DEFAULT_DONATION_CONFIG.tiers;
    expect(tierFor(t, 4.99)).toBeNull();
    expect(tierFor(t, 5)?.label).toBe('Supporter');
    expect(tierFor(t, 12)?.label).toBe('Soutien');
    expect(tierFor(t, 25)?.label).toBe('Mécène');
    expect(tierFor(t, 500)?.label).toBe('Grand mécène');
  });

  it('prolonge à partir de la fin actuelle si elle est dans le futur, sinon de maintenant', () => {
    const now = new Date('2026-10-12T12:00:00Z');
    expect(extendFrom(null, now, 30)?.toISOString()).toBe('2026-11-11T12:00:00.000Z');
    expect(extendFrom(new Date('2026-10-20T12:00:00Z'), now, 10)?.toISOString()).toBe('2026-10-30T12:00:00.000Z');
    expect(extendFrom(new Date('2026-09-01T12:00:00Z'), now, 1)?.toISOString()).toBe('2026-10-13T12:00:00.000Z');
    const keep = new Date('2026-10-20T12:00:00Z');
    expect(extendFrom(keep, now, 0)).toBe(keep);
  });

  it('nettoie les réglages : liens http(s) seulement, valeurs bornées, paliers triés', () => {
    const c = sanitizeDonationConfig({
      links: [{ label: 'Ko-fi', url: 'https://ko-fi.com/x' }, { label: 'Piège', url: 'javascript:alert(1)' }, { label: '', url: 'https://a.b' }],
      goalMonthly: -5, currency: 'cad',
      tiers: [{ minAmount: 20, label: 'B', days: 99999, freeleechDays: -3, invites: 500 }, { minAmount: 5, label: 'A', days: 10 }],
    });
    expect(c.links).toEqual([{ label: 'Ko-fi', url: 'https://ko-fi.com/x' }]);
    expect(c.goalMonthly).toBe(0);
    expect(c.currency).toBe('CAD');
    expect(c.tiers.map((t) => t.label)).toEqual(['A', 'B']);
    expect(c.tiers[1]).toMatchObject({ days: 3650, freeleechDays: 0, invites: 50 });
  });

  it('une configuration vide donne les valeurs par défaut', () => {
    expect(sanitizeDonationConfig(null).tiers.length).toBe(4);
    expect(sanitizeDonationConfig({}).enabled).toBe(true);
  });
});
