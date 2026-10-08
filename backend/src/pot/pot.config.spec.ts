import { DEFAULT_POT, normalizePotConfig } from './pot.config';

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
    expect(c.rewardHours).toBe(168);
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
});
