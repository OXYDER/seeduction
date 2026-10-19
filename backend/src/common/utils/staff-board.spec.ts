import { QUEUES, delayStats, hoursSince, levelOf } from './staff-board';

describe('tableau de bord de l\'équipe', () => {
  it('calcule médiane et 90e centile', () => {
    expect(delayStats([])).toBeNull();
    expect(delayStats([NaN, -1])).toBeNull();
    expect(delayStats([2])).toEqual({ median: 2, p90: 2, sample: 1 });
    expect(delayStats([1, 2, 3, 4, 100])).toEqual({ median: 3, p90: 100, sample: 5 });
    expect(delayStats([4, 1, 3, 2])).toEqual({ median: 2, p90: 4, sample: 4 });
    expect(delayStats([1.26, 1.24])?.median).toBe(1.2);
  });
  it('niveau d\'urgence selon l\'attente', () => {
    expect(levelOf(0, null, 12, 48)).toBe('ok');
    expect(levelOf(0, 99, 12, 48)).toBe('ok'); // file vide : jamais d'alerte
    expect(levelOf(3, 5, 12, 48)).toBe('ok');
    expect(levelOf(3, 12, 12, 48)).toBe('warn');
    expect(levelOf(3, 47.9, 12, 48)).toBe('warn');
    expect(levelOf(3, 48, 12, 48)).toBe('late');
    expect(levelOf(1, null, 12, 48)).toBe('ok');
  });
  it('heures écoulées', () => {
    const now = new Date('2026-10-18T12:00:00Z');
    expect(hoursSince(new Date('2026-10-18T06:00:00Z'), now)).toBe(6);
    expect(hoursSince(null, now)).toBeNull();
    expect(hoursSince(new Date('2026-10-19T00:00:00Z'), now)).toBe(0);
  });
  it('clés de files uniques et seuils cohérents', () => {
    expect(new Set(QUEUES.map((q) => q.key)).size).toBe(QUEUES.length);
    for (const q of QUEUES) expect(q.lateHours).toBeGreaterThan(q.warnHours);
  });
});
