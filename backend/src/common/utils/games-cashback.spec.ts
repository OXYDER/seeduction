import { DEFAULT_CASHBACK, cashbackFor, normalizeCashback } from './games-cashback';

describe('Remise de fidélité des jeux', () => {
  it('rend une part des pertes au-delà du seuil', () => {
    expect(cashbackFor(206, DEFAULT_CASHBACK)).toBe(20);
    expect(cashbackFor(50, DEFAULT_CASHBACK)).toBe(5);
  });

  it('ne rend rien sous le seuil', () => {
    expect(cashbackFor(49, DEFAULT_CASHBACK)).toBe(0);
    expect(cashbackFor(0, DEFAULT_CASHBACK)).toBe(0);
  });

  it('plafonne la remise par jour', () => {
    expect(cashbackFor(50_000, DEFAULT_CASHBACK)).toBe(DEFAULT_CASHBACK.maxPerDay);
  });

  it('désactivée : rien', () => {
    expect(cashbackFor(1000, { ...DEFAULT_CASHBACK, enabled: false })).toBe(0);
  });

  it('garde les anciennes valeurs quand une valeur est invalide', () => {
    expect(normalizeCashback({ rate: 5, minLoss: -3, maxPerDay: 'x', enabled: 'oui' })).toEqual(DEFAULT_CASHBACK);
    expect(normalizeCashback({ rate: 0.2 }).rate).toBe(0.2);
  });
});
