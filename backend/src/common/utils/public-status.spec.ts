import { componentStates, dayStatuses, lastDays, overallState, uptimePercent, StatusIncident } from './public-status';

const NOW = Date.parse('2026-06-10T15:00:00Z');
const inc = (checkId: string, level: string, start: string, end: string | null): StatusIncident => ({ checkId, level, startedAt: new Date(start), resolvedAt: end ? new Date(end) : null });

describe('componentStates', () => {
  it('tout va bien sans incident ouvert', () => {
    const s = componentStates([]);
    expect(Object.values(s).every((v) => v === 'ok')).toBe(true);
    expect(overallState(s)).toBe('ok');
  });
  it('la base injoignable met aussi le tracker en panne', () => {
    const s = componentStates([inc('database', 'error', '2026-06-10T14:00:00Z', null)]);
    expect(s.database).toBe('outage');
    expect(s.tracker).toBe('outage');
    expect(overallState(s)).toBe('outage');
  });
  it('un service secondaire dégradé ne touche pas le tracker ; un incident résolu ne compte plus ; un contrôle interne n\'apparaît jamais', () => {
    const s = componentStates([inc('smtp', 'warn', '2026-06-10T14:00:00Z', null), inc('database', 'error', '2026-06-09T10:00:00Z', '2026-06-09T10:20:00Z'), inc('secret', 'error', '2026-06-10T14:00:00Z', null), inc('memory', 'warn', '2026-06-10T14:00:00Z', null)]);
    expect(s.mail).toBe('degraded');
    expect(s.tracker).toBe('ok');
    expect(s.database).toBe('ok');
    expect(overallState(s)).toBe('degraded');
  });
});

describe('dayStatuses', () => {
  const days = lastDays(4, NOW);
  const full = (n: number) => new Map(days.map((d) => [d, n]));
  it('liste les jours du plus ancien à aujourd\'hui', () => {
    expect(days).toEqual(['2026-06-07', '2026-06-08', '2026-06-09', '2026-06-10']);
  });
  it('avant le premier jour de fonctionnement : pas de données', () => {
    const r = dayStatuses({ days, incidents: [], hoursSeen: full(24), traffic: new Map(), firstDay: '2026-06-09', now: NOW });
    expect(r.map((d) => d.status)).toEqual(['nodata', 'nodata', 'ok', 'ok']);
  });
  it('une panne de 20 minutes de la base : jour en panne ; une courte (5 min) : dégradé', () => {
    const r = dayStatuses({ days, incidents: [inc('database', 'error', '2026-06-08T10:00:00Z', '2026-06-08T10:20:00Z'), inc('database', 'error', '2026-06-09T10:00:00Z', '2026-06-09T10:05:00Z')], hoursSeen: new Map(days.map((d) => [d, d === '2026-06-10' ? 15 : 24])), traffic: new Map(), firstDay: '2026-06-07', now: NOW });
    expect(r.map((d) => d.status)).toEqual(['ok', 'down', 'degraded', 'ok']);
    expect(r[1].downMinutes).toBe(20);
  });
  it('un contrôle interne (mémoire, sécurité) ne dégrade jamais la page publique', () => {
    const r = dayStatuses({ days, incidents: [inc('memory', 'error', '2026-06-09T00:00:00Z', '2026-06-09T20:00:00Z')], hoursSeen: new Map(days.map((d) => [d, d === '2026-06-10' ? 15 : 24])), traffic: new Map(), firstDay: '2026-06-07', now: NOW });
    expect(r.every((d) => d.status === 'ok')).toBe(true);
  });
  it('des heures sans enregistrement (site éteint) comptent comme une panne, sauf le tout premier jour', () => {
    const seen = new Map(days.map((d) => [d, d === '2026-06-10' ? 15 : 24]));
    seen.set('2026-06-08', 20); seen.set('2026-06-07', 3);
    const r = dayStatuses({ days, incidents: [], hoursSeen: seen, traffic: new Map(), firstDay: '2026-06-07', now: NOW });
    expect(r[0].status).toBe('ok');
    expect(r[1].status).toBe('down');
    expect(r[1].downMinutes).toBe(240);
  });
  it('beaucoup d\'erreurs dans la journée : dégradé', () => {
    const r = dayStatuses({ days, incidents: [], hoursSeen: new Map(days.map((d) => [d, d === '2026-06-10' ? 15 : 24])), traffic: new Map([['2026-06-09', { requests: 10000, errors: 400 }]]), firstDay: '2026-06-07', now: NOW });
    expect(r[2].status).toBe('degraded');
  });
});

describe('uptimePercent', () => {
  it('sans donnée : rien', () => {
    expect(uptimePercent([{ date: 'x', status: 'nodata', downMinutes: 0 }])).toBeNull();
  });
  it('se calcule sur les jours qui ont des données', () => {
    const u = uptimePercent([{ date: 'a', status: 'nodata', downMinutes: 0 }, { date: 'b', status: 'ok', downMinutes: 0 }, { date: 'c', status: 'down', downMinutes: 144 }]);
    expect(u).toBe(95);
  });
});
