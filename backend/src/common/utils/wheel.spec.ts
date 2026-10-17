import { DEFAULT_SEGMENTS, DEFAULT_WHEEL, dayBefore, expectedValue, nextStreak, normalizeWheel, pickSegment, rewardFor, streakMultiplier } from './wheel';

describe('Roue de la fortune : tirage', () => {
  it('seize secteurs', () => {
    expect(DEFAULT_SEGMENTS).toHaveLength(16);
  });

  it('le tirage respecte les poids', () => {
    const segs = [{ label: 'a', points: 10, tokens: 0, weight: 1, color: '#000000' }, { label: 'b', points: 20, tokens: 0, weight: 3, color: '#000000' }];
    expect(pickSegment(segs, 0)).toBe(0);
    expect(pickSegment(segs, 0.24)).toBe(0);
    expect(pickSegment(segs, 0.26)).toBe(1);
    expect(pickSegment(segs, 0.9999)).toBe(1);
  });

  it('un secteur au poids nul ne sort jamais', () => {
    const segs = [{ label: 'a', points: 10, tokens: 0, weight: 0, color: '#000000' }, { label: 'b', points: 20, tokens: 0, weight: 2, color: '#000000' }];
    for (const r of [0, 0.3, 0.7, 0.99]) expect(pickSegment(segs, r)).toBe(1);
  });

  it('une simulation de 200 000 tours colle aux poids', () => {
    let seed = 777;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const counts = new Array(16).fill(0);
    const n = 200_000;
    for (let i = 0; i < n; i++) counts[pickSegment(DEFAULT_SEGMENTS, rnd())]++;
    const total = DEFAULT_SEGMENTS.reduce((s, x) => s + x.weight, 0);
    DEFAULT_SEGMENTS.forEach((s, i) => {
      const expected = s.weight / total;
      expect(Math.abs(counts[i] / n - expected)).toBeLessThan(0.006);
    });
  });
});

describe('Roue de la fortune : série et lots', () => {
  it('calcule le jour précédent, y compris autour des changements de mois et d\'année', () => {
    expect(dayBefore('2026-10-17')).toBe('2026-10-16');
    expect(dayBefore('2026-11-01')).toBe('2026-10-31');
    expect(dayBefore('2027-01-01')).toBe('2026-12-31');
    expect(dayBefore('2028-03-01')).toBe('2028-02-29');
    expect(dayBefore('2026-03-08')).toBe('2026-03-07'); // changement d'heure : le calendrier n'est pas touché
  });

  it('la série continue si le dernier tour était hier, sinon elle repart de 1', () => {
    expect(nextStreak('2026-10-16', 4, '2026-10-17')).toBe(5);
    expect(nextStreak('2026-10-15', 4, '2026-10-17')).toBe(1);
    expect(nextStreak(null, 0, '2026-10-17')).toBe(1);
    expect(nextStreak('2026-10-17', 3, '2026-10-17')).toBe(1);
  });

  it('le bonus de série monte puis plafonne', () => {
    expect(streakMultiplier(1, DEFAULT_WHEEL)).toBe(1);
    expect(streakMultiplier(3, DEFAULT_WHEEL)).toBeCloseTo(1.1);
    expect(streakMultiplier(11, DEFAULT_WHEEL)).toBeCloseTo(1.5);
    expect(streakMultiplier(100, DEFAULT_WHEEL)).toBeCloseTo(1.5);
  });

  it('le lot est augmenté par la série et reçoit un bonus tous les 7 jours', () => {
    const s = DEFAULT_SEGMENTS[1]; // 50 points
    expect(rewardFor(s, 1, DEFAULT_WHEEL)).toEqual({ points: 50, tokens: 0, streakBonus: 0, total: 50 });
    expect(rewardFor(s, 3, DEFAULT_WHEEL).points).toBe(55);
    const seven = rewardFor(s, 7, DEFAULT_WHEEL);
    expect(seven.streakBonus).toBe(DEFAULT_WHEEL.streak.weeklyBonus);
    expect(seven.total).toBe(seven.points + DEFAULT_WHEEL.streak.weeklyBonus);
    expect(rewardFor(s, 14, DEFAULT_WHEEL).streakBonus).toBe(DEFAULT_WHEEL.streak.weeklyBonus);
  });

  it('les jetons freeleech sont rendus tels quels', () => {
    const token = DEFAULT_SEGMENTS.find((x) => x.tokens === 1)!;
    expect(rewardFor(token, 9, DEFAULT_WHEEL).tokens).toBe(1);
  });

  it('la valeur moyenne d\'un tour reste raisonnable (coût connu)', () => {
    const ev = expectedValue(DEFAULT_WHEEL, 1);
    expect(ev).toBeGreaterThan(30);
    expect(ev).toBeLessThan(120);
    expect(expectedValue(DEFAULT_WHEEL, 11)).toBeGreaterThan(ev);
  });
});

describe('Roue de la fortune : réglages', () => {
  it('garde les valeurs précédentes quand une valeur est invalide', () => {
    expect(normalizeWheel({ minAccountDays: -3, streak: { bonusPerDay: 9 }, segments: [{ points: 'x', weight: -4, color: 'rouge' }] })).toEqual(DEFAULT_WHEEL);
  });

  it('règle un secteur sans toucher au nombre de secteurs', () => {
    const c = normalizeWheel({ segments: [{ points: 5, weight: 20, label: '  Cinq  ', color: '#112233' }] });
    expect(c.segments).toHaveLength(16);
    expect(c.segments[0]).toEqual({ label: 'Cinq', points: 5, tokens: 0, weight: 20, color: '#112233' });
    expect(c.segments[1]).toEqual(DEFAULT_SEGMENTS[1]);
  });

  it('refuse de supprimer tous les lots', () => {
    const all = DEFAULT_SEGMENTS.map(() => ({ weight: 0 }));
    expect(normalizeWheel({ segments: all }).segments).toEqual(DEFAULT_SEGMENTS);
  });
});
