import { DEFAULT_DUELS, addDaysTo, normalizeDuels, periodFor, plan, winnerOf } from './duels';

const s = (main: number, tie = 0) => ({ main, tie });

describe('duels : période', () => {
  it('commence le lendemain de l\'acceptation et dure le bon nombre de jours', () => {
    expect(periodFor('2026-03-10', 3)).toEqual({ startDay: '2026-03-11', endDay: '2026-03-13' });
    expect(periodFor('2026-03-10', 7)).toEqual({ startDay: '2026-03-11', endDay: '2026-03-17' });
  });
  it('traverse les fins de mois et d\'année', () => {
    expect(periodFor('2026-12-30', 3)).toEqual({ startDay: '2026-12-31', endDay: '2027-01-02' });
    expect(addDaysTo('2026-02-27', 3)).toBe('2026-03-02');
  });
});

describe('duels : gagnant', () => {
  it('le plus grand score gagne', () => { expect(winnerOf(s(5), s(3))).toBe('A'); expect(winnerOf(s(2), s(3))).toBe('B'); });
  it('égalité : le départage décide', () => { expect(winnerOf(s(4, 10), s(4, 20))).toBe('B'); });
  it('égalité parfaite : personne', () => { expect(winnerOf(s(4, 10), s(4, 10))).toBeNull(); });
});

describe('duels : récompenses', () => {
  const c = DEFAULT_DUELS;
  it('gagnant et consolation', () => {
    expect(plan(s(6), s(4), c, true, true, true)).toMatchObject({ winner: 'A', pointsA: c.winPoints, pointsB: c.consolationPoints, note: '' });
  });
  it('égalité : les deux reçoivent le lot d\'égalité', () => {
    expect(plan(s(3, 5), s(3, 5), c, true, true, true)).toMatchObject({ winner: null, pointsA: c.tiePoints, pointsB: c.tiePoints });
  });
  it('personne n\'a joué : rien du tout', () => {
    expect(plan(s(0), s(0), c, true, true, true)).toMatchObject({ winner: null, pointsA: 0, pointsB: 0 });
  });
  it('celui qui n\'a rien fait ne reçoit rien, même s\'il perd', () => {
    expect(plan(s(2), s(0), c, true, true, true)).toMatchObject({ winner: 'A', pointsA: c.winPoints, pointsB: 0 });
  });
  it('plafond quotidien : seulement pour le membre concerné', () => {
    const p = plan(s(6), s(4), c, false, true, true);
    expect(p.pointsA).toBe(0); expect(p.pointsB).toBe(c.consolationPoints); expect(p.note).toMatch(/Plafond/);
  });
  it('même paire récompensée récemment : aucune récompense, mais le résultat reste', () => {
    const p = plan(s(6), s(4), c, true, true, false);
    expect(p).toMatchObject({ winner: 'A', pointsA: 0, pointsB: 0 }); expect(p.note).toMatch(/récemment/);
  });
});

describe('duels : réglages', () => {
  it('valeurs hors limites ignorées, valeurs valides gardées', () => {
    const n = normalizeDuels({ winPoints: 50, consolationPoints: -3, maxActive: 0, enabled: false, expireHours: 'abc' });
    expect(n).toMatchObject({ winPoints: 50, consolationPoints: DEFAULT_DUELS.consolationPoints, maxActive: DEFAULT_DUELS.maxActive, enabled: false, expireHours: DEFAULT_DUELS.expireHours });
  });
  it('entrée absurde : réglages précédents', () => { expect(normalizeDuels(null)).toEqual(DEFAULT_DUELS); expect(normalizeDuels('x')).toEqual(DEFAULT_DUELS); });
});
