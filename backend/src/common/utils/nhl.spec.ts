import { Game, inLiveWindow, normalizeGame, outcomeLabel, periodLabel, summarize } from './nhl';

const team = (abbrev: string, name: string, score?: number, sog?: number) => ({ abbrev, commonName: { default: name }, name: { default: name }, score, sog });
const raw = (over: any = {}) => ({
  id: 2026020001, gameType: 2, gameDate: '2026-10-13', startTimeUTC: '2026-10-13T22:30:00Z', venue: { default: 'Centre Bell' }, gameState: 'FUT', gameScheduleState: 'OK',
  tvBroadcasts: [{ countryCode: 'CA', network: 'RDS' }, { countryCode: 'US', network: 'ESPN' }, { countryCode: 'CA', network: 'RDS' }, { countryCode: 'CA', network: 'TVA Sports' }],
  homeTeam: team('MTL', 'Canadiens'), awayTeam: team('BUF', 'Sabres'), ...over,
});

describe('libellés', () => {
  it('périodes en français', () => {
    expect(periodLabel(1, 'REG')).toBe('1re période');
    expect(periodLabel(2, 'REG')).toBe('2e période');
    expect(periodLabel(3, 'REG')).toBe('3e période');
    expect(periodLabel(4, 'OT')).toBe('Prolongation');
    expect(periodLabel(5, 'SO')).toBe('Tirs de barrage');
    expect(periodLabel(undefined)).toBeNull();
  });
  it('issue du match', () => {
    expect(outcomeLabel('REG')).toBe('Final');
    expect(outcomeLabel('OT')).toBe('Final (prolongation)');
    expect(outcomeLabel('SO')).toBe('Final (tirs de barrage)');
  });
});

describe('mise en forme d\'un match', () => {
  it('match à venir', () => {
    const g = normalizeGame(raw());
    expect(g).toMatchObject({ state: 'FUT', kind: 'SAISON', side: 'home', won: null, outcome: null, venue: 'Centre Bell' });
    expect(g.tv).toEqual(['RDS', 'TVA Sports']); // chaînes canadiennes, sans doublon
  });
  it('victoire à domicile après tirs de barrage', () => {
    const g = normalizeGame(raw({ gameState: 'OFF', homeTeam: team('MTL', 'Canadiens', 4), awayTeam: team('BUF', 'Sabres', 3), gameOutcome: { lastPeriodType: 'SO' }, periodDescriptor: { number: 5, periodType: 'SO' } }));
    expect(g).toMatchObject({ state: 'FINAL', won: true, outcome: 'Final (tirs de barrage)', period: null });
  });
  it('défaite à l\'extérieur', () => {
    const g = normalizeGame(raw({ gameState: 'FINAL', homeTeam: team('WSH', 'Capitals', 3), awayTeam: team('MTL', 'Canadiens', 1), gameOutcome: { lastPeriodType: 'REG' } }));
    expect(g).toMatchObject({ side: 'away', won: false, outcome: 'Final' });
  });
  it('match en cours (format « tableau des scores ») : période, chrono, tirs', () => {
    const g = normalizeGame({
      id: 2026020106, gameType: 2, gameDate: '2026-10-14', startTimeUTC: '2026-10-14T23:30:00Z', gameState: 'LIVE',
      awayTeam: { abbrev: 'MTL', name: { default: 'Canadiens' }, score: 2, sog: 7 }, homeTeam: { abbrev: 'WSH', name: { default: 'Capitals' }, score: 1, sog: 7 },
      periodDescriptor: { number: 2, periodType: 'REG' }, clock: { timeRemaining: '02:14', secondsRemaining: 134, running: false, inIntermission: false },
    });
    expect(g).toMatchObject({ state: 'LIVE', side: 'away', period: '2e période', won: null });
    expect(g.clock).toEqual({ remaining: '02:14', running: false, intermission: false });
    expect(g.away).toMatchObject({ score: 2, sog: 7, name: 'Canadiens' });
  });
  it('type de match et match reporté', () => {
    expect(normalizeGame(raw({ gameType: 1 })).kind).toBe('PRESAISON');
    expect(normalizeGame(raw({ gameType: 3 })).kind).toBe('SERIES');
    expect(normalizeGame(raw({ gameScheduleState: 'PPD' })).state).toBe('PPD');
  });
  it('données manquantes : aucune exception', () => {
    expect(() => normalizeGame({ id: 1, homeTeam: {}, awayTeam: {} })).not.toThrow();
  });
});

describe('quoi afficher', () => {
  const g = (id: number, start: string, state: Game['state'], over: Partial<Game> = {}): Game => ({ ...normalizeGame(raw({ id, startTimeUTC: start })), state, ...over });
  const now = new Date('2026-10-14T20:00:00Z');

  it('le match en cours passe en premier', () => {
    const s = summarize([g(1, '2026-10-13T22:30:00Z', 'FINAL'), g(2, '2026-10-14T19:00:00Z', 'LIVE'), g(3, '2026-10-17T23:00:00Z', 'FUT')], now);
    expect(s.live?.id).toBe(2);
    expect(s.featured?.id).toBe(2);
    expect(s.next.map((x) => x.id)).toEqual([3]);
  });
  it('un match qui commence dans moins de 12 h est mis en avant', () => {
    expect(summarize([g(1, '2026-10-13T22:30:00Z', 'FINAL'), g(3, '2026-10-15T01:00:00Z', 'FUT')], now).featured?.id).toBe(3);
  });
  it('un match terminé il y a moins de 14 h reste affiché, plus tard on ne montre rien', () => {
    expect(summarize([g(1, '2026-10-14T14:00:00Z', 'FINAL'), g(3, '2026-10-18T23:00:00Z', 'FUT')], now).featured?.id).toBe(1);
    expect(summarize([g(1, '2026-10-13T14:00:00Z', 'FINAL'), g(3, '2026-10-18T23:00:00Z', 'FUT')], now).featured).toBeNull();
  });
  it('5 derniers résultats (du plus récent) et 3 prochains matchs', () => {
    const games = [...Array.from({ length: 8 }, (_, i) => g(i, `2026-10-0${i + 1}T23:00:00Z`, 'FINAL')), ...Array.from({ length: 5 }, (_, i) => g(100 + i, `2026-11-0${i + 1}T23:00:00Z`, 'FUT'))];
    const s = summarize(games, now);
    expect(s.last.map((x) => x.id)).toEqual([7, 6, 5, 4, 3]);
    expect(s.next.map((x) => x.id)).toEqual([100, 101, 102]);
  });
  it('fenêtre d\'interrogation en direct : 30 min avant à 5 h après', () => {
    const games = [g(1, '2026-10-14T23:30:00Z', 'FUT')];
    expect(inLiveWindow(games, new Date('2026-10-14T22:00:00Z'))).toBe(false);
    expect(inLiveWindow(games, new Date('2026-10-14T23:05:00Z'))).toBe(true);
    expect(inLiveWindow(games, new Date('2026-10-15T04:00:00Z'))).toBe(true);
    expect(inLiveWindow(games, new Date('2026-10-15T05:00:00Z'))).toBe(false);
    expect(inLiveWindow([g(2, '2026-10-14T23:30:00Z', 'PPD')], new Date('2026-10-14T23:40:00Z'))).toBe(false);
  });
});
