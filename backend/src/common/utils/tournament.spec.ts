import { DEFAULT_TOURNAMENT as D, capped, nextWeekKey, normalizeTournament, pointsFor, prevWeekKey, rank, settle, tierFor, weekKeyOfDay } from './tournament';

const row = (userId: string, points: number, lastAt = 0) => ({ userId, points, lastAt });

describe('tournoi de la semaine', () => {
  it('nettoie les réglages et corrige les prix qui se chevauchent', () => {
    expect(normalizeTournament(undefined)).toEqual(D);
    const n = normalizeTournament({ weeklyCap: 1, minAccountDays: -2, weights: { wheel: 99999, quiz: 'x' }, prizes: [{ from: 1, to: 3, points: 100 }, { from: 2, to: 5, points: 50 }, { from: 4, to: 2, points: 10 }] });
    expect(n.weeklyCap).toBe(10); expect(n.minAccountDays).toBe(0); expect(n.weights.wheel).toBe(500); expect(n.weights.quiz).toBe(D.weights.quiz);
    expect(n.prizes.map((p) => [p.from, p.to, p.points])).toEqual([[1, 3, 100], [4, 5, 50]]);
  });
  it('points par événement (une bonne réponse = un multiple)', () => {
    expect(pointsFor('wheel', undefined, D)).toBe(5);
    expect(pointsFor('quiz_correct', 4, D)).toBe(16);
    expect(pointsFor('quiz_correct', 999, D)).toBe(200);
    expect(pointsFor('slots', 1, D)).toBe(0);
    expect(pointsFor('free_play', 1, { ...D, weights: { ...D.weights, free_play: 0 } })).toBe(0);
  });
  it('plafond de la semaine', () => {
    expect(capped(590, 20, 600)).toBe(10);
    expect(capped(600, 5, 600)).toBe(0);
    expect(capped(0, 5, 600)).toBe(5);
  });
  it('classement : points, puis premier arrivé, puis identifiant ; minimum de points', () => {
    const r = rank([row('c', 50, 5), row('a', 80, 9), row('b', 80, 3), row('z', 10, 1)], 20);
    expect(r.map((x) => [x.userId, x.rank])).toEqual([['b', 1], ['a', 2], ['c', 3]]);
    expect(rank([row('b', 40, 1), row('a', 40, 1)], 1).map((x) => x.userId)).toEqual(['a', 'b']);
  });
  it('prix de rang', () => {
    expect(tierFor(1, D)?.points).toBe(300); expect(tierFor(7, D)?.points).toBe(40); expect(tierFor(11, D)).toBeNull();
  });
  it('règlement : prix de rang, participation, gros lot au premier assez fort', () => {
    const rows = [row('a', 200, 1), row('b', 120, 2), row('c', 60, 3), row('d', 35, 4), row('e', 22, 5), row('f', 25, 6), row('g', 12, 7)];
    const r = settle(rows, D, 300);
    expect(r.ranked.map((x) => x.userId)).toEqual(['a', 'b', 'c', 'd', 'f', 'e']);
    const by = (id: string) => r.awards.find((a) => a.userId === id)!;
    expect(by('a')).toMatchObject({ rank: 1, prizePoints: 300, tokens: 3, packs: 1, jackpot: 400 }); // 300 reportés + 100 de la semaine
    expect(by('b')).toMatchObject({ rank: 2, prizePoints: 200, jackpot: 0 });
    expect(by('f')).toMatchObject({ rank: 5, prizePoints: 40 });
    expect(r.awards.some((a) => a.userId === 'g')).toBe(false); // sous le minimum de participation
    expect(r.jackpotPaid).toBe(400); expect(r.nextJackpot).toBe(0);
  });
  it('gros lot reporté quand le premier n\'a pas assez de points, et plafonné', () => {
    const weak = settle([row('a', 100, 1), row('b', 50, 2)], D, 50);
    expect(weak.jackpotPaid).toBe(0); expect(weak.nextJackpot).toBe(150);
    expect(weak.awards.find((a) => a.userId === 'a')?.jackpot).toBe(0);
    expect(settle([], D, 1990).nextJackpot).toBe(2000);
    expect(settle([], D, 0).awards).toEqual([]);
  });
  it('un participant sans rang (sous le minimum du classement mais au-dessus de la participation) reçoit le petit prix', () => {
    const cfg = { ...D, minPointsToRank: 50, participation: { minPoints: 30, points: 10 } };
    const r = settle([row('a', 80, 1), row('b', 35, 2)], cfg, 0);
    expect(r.awards.find((a) => a.userId === 'b')).toMatchObject({ rank: null, prizePoints: 10 });
  });
  it('clés de semaine (lundi)', () => {
    expect(weekKeyOfDay('2026-10-19')).toBe('2026-10-19');
    expect(weekKeyOfDay('2026-10-25')).toBe('2026-10-19');
    expect(weekKeyOfDay('2026-10-18')).toBe('2026-10-12');
    expect(nextWeekKey('2026-10-12')).toBe('2026-10-19');
    expect(prevWeekKey('2026-10-19')).toBe('2026-10-12');
    expect(weekKeyOfDay('2026-01-01')).toBe('2025-12-29');
  });
});
