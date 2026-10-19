import { RANGES, Sample, hourStart, incidentSpan, parseRange, summarize, toPoints } from './site-history';

const S = (iso: string, o: Partial<Sample> = {}): Sample => ({ hour: new Date(iso), requests: 100, errors: 1, announces: 50, onlinePeak: 10, rssMB: 300, lagMs: 20, ...o });

describe('historique du site', () => {
  it('périodes', () => {
    expect(parseRange('7d')).toBe('7d');
    expect(parseRange('xx')).toBe('24h');
    expect(RANGES['30d']).toBe(720);
  });
  it('heure de début', () => {
    expect(hourStart(new Date('2026-10-18T22:47:13Z').getTime()).toISOString()).toBe('2026-10-18T22:00:00.000Z');
  });
  it('24 h et 7 jours : une valeur par heure, triée', () => {
    const p = toPoints([S('2026-10-18T10:00:00Z'), S('2026-10-18T09:00:00Z', { requests: 5 })], '24h');
    expect(p.map((x) => x.requests)).toEqual([5, 100]);
  });
  it('30 jours : sommes, pics et maximums par jour (heure de Montréal)', () => {
    const p = toPoints([S('2026-10-18T14:00:00Z', { onlinePeak: 12, rssMB: 310 }), S('2026-10-18T15:00:00Z', { onlinePeak: 40, rssMB: 280, lagMs: 90 }), S('2026-10-19T15:00:00Z')], '30d');
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ label: '2026-10-18', requests: 200, errors: 2, onlinePeak: 40, rssMB: 310, lagMs: 90 });
    expect(p[1].label).toBe('2026-10-19');
  });
  it('chiffres clés', () => {
    expect(summarize([])).toEqual({ requests: 0, errors: 0, errorRate: 0, peakOnline: 0, maxLagMs: 0, maxRssMB: 0 });
    expect(summarize([S('2026-10-18T10:00:00Z', { requests: 1000, errors: 5 }), S('2026-10-18T11:00:00Z', { requests: 1000, errors: 15, onlinePeak: 33 })])).toMatchObject({ requests: 2000, errors: 20, errorRate: 1, peakOnline: 33 });
  });
  it('durée d\'un incident', () => {
    const t = new Date('2026-10-18T10:00:00Z');
    expect(incidentSpan(t, new Date(t.getTime() + 20_000))).toBe('moins d\'une minute');
    expect(incidentSpan(t, new Date(t.getTime() + 25 * 60_000))).toBe('25 min');
    expect(incidentSpan(t, new Date(t.getTime() + 5 * 3_600_000))).toBe('5 h');
    expect(incidentSpan(t, new Date(t.getTime() + 4 * 86_400_000))).toBe('4 j');
    expect(incidentSpan(t, null, new Date(t.getTime() + 3 * 60_000))).toBe('3 min');
  });
});
