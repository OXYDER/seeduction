import { DEFAULT_POT, nextAtHour, normalizePotConfig } from './pot.config';

describe('réglages du pot commun', () => {
  it('valeurs par défaut : pot fermé, « Le Pot du Plaisir »', () => {
    const c = normalizePotConfig({});
    expect(c).toEqual(DEFAULT_POT);
    expect(c.enabled).toBe(false);
    expect(c.name).toBe('Le Pot du Plaisir');
  });

  it('chaque valeur est ramenée dans des limites raisonnables', () => {
    const c = normalizePotConfig({ goal: -5, rewardHours: 99999, donorRefundPct: 500, goalGrowthPct: -3, startDelayHours: 1000, name: '   ', minDonation: 0 });
    expect(c.goal).toBe(100);
    expect(c.rewardHours).toBe(720);
    expect(c.donorRefundPct).toBe(100);
    expect(c.goalGrowthPct).toBe(0);
    expect(c.startDelayHours).toBe(72);
    expect(c.name).toBe('Le Pot du Plaisir');
    expect(c.minDonation).toBe(1);
  });

  it('le don minimum et maximum ne dépassent jamais l’objectif ; une saisie partielle garde le reste', () => {
    const base = normalizePotConfig({ goal: 1000, rewardHours: 12, enabled: true });
    const c = normalizePotConfig({ minDonation: 5000, maxDonation: 99999 }, base);
    expect(c.minDonation).toBe(1000);
    expect(c.maxDonation).toBe(1000);
    expect(c.rewardHours).toBe(12);
    expect(c.enabled).toBe(true);
  });

  it('durées et options de récompense bornées', () => {
    const c = normalizePotConfig({ rewardHours: 5000, doubleUploadHours: -1, fastFillHours: 10, fastFillBonusHours: 99999, rewardTokens: 999, rainPoints: -5, startAtHour: 30, cooldownHours: 1, minAccountDays: 9999 });
    expect(c.rewardHours).toBe(720);
    expect(c.doubleUploadHours).toBe(0);
    expect(c.fastFillBonusHours).toBe(720);
    expect(c.rewardTokens).toBe(50);
    expect(c.rainPoints).toBe(0);
    expect(c.startAtHour).toBe(23);
    expect(c.minAccountDays).toBe(365);
  });

  it('heure de départ fixe : prochaine occurrence à Montréal', () => {
    // 23 h 10 à Montréal (EDT, UTC-4) -> 9 h le lendemain = 13 h UTC
    expect(nextAtHour(new Date('2026-10-08T03:10:00Z'), 9).toISOString()).toBe('2026-10-08T13:00:00.000Z');
    // pile à l'heure voulue : tout de suite
    expect(nextAtHour(new Date('2026-10-08T13:00:00Z'), 9).toISOString()).toBe('2026-10-08T13:00:00.000Z');
    // heure d'hiver (EST, UTC-5)
    expect(nextAtHour(new Date('2026-12-10T10:00:00Z'), 18).toISOString()).toBe('2026-12-10T23:00:00.000Z');
  });
});
