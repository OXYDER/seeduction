import { PicksService } from './picks.service';
import { DEFAULT_PICKS, addDays } from '../common/utils/picks';
import type { Game } from '../common/utils/nhl';

const game = (over: Partial<Game> & { id: number; date: string }): Game => ({
  startUtc: `${over.date}T23:00:00Z`, state: 'FUT', kind: 'SAISON', home: { abbrev: 'MTL', name: 'Canadiens', score: null, sog: null }, away: { abbrev: 'TOR', name: 'Maple Leafs', score: null, sog: null },
  venue: null, tv: [], period: null, clock: null, outcome: null, won: null, side: 'home', ...over,
});

function setup(opts: { picks?: { all: any[]; wins: any[] }; openGames?: any[]; existing?: any[]; paidRanks?: Set<number> } = {}) {
  const created: any[] = [];
  const credited = new Map<string, number>();
  const prizes: any[] = [];
  const paid = opts.paidRanks ?? new Set<number>();
  const tx: any = {
    nhlWeekPrize: { createMany: jest.fn(async ({ data }: any) => { if (paid.has(data[0].rank)) return { count: 0 }; paid.add(data[0].rank); prizes.push(data[0]); return { count: 1 }; }) },
    user: { update: jest.fn(async ({ where, data }: any) => { credited.set(where.id, (credited.get(where.id) ?? 0) + data.bonusPoints.increment); return {}; }) },
  };
  let call = 0;
  const prisma: any = {
    nhlPick: { groupBy: jest.fn(async () => (call++ % 2 === 0 ? opts.picks?.all ?? [] : opts.picks?.wins ?? [])) },
    nhlGame: {
      findMany: jest.fn(async (q: any) => (q?.where?.status === 'OPEN' ? opts.openGames ?? [] : opts.existing ?? [])),
      create: jest.fn(async ({ data }: any) => { created.push(data); return data; }),
      update: jest.fn(async () => ({})),
    },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const settings: any = { get: jest.fn(async () => null) };
  const notes: any[] = [];
  const notifications: any = { notify: jest.fn(async (n: any) => { notes.push(n); return n; }) };
  const svc = new PicksService(prisma, settings, { log: jest.fn() } as any, notifications, {} as any);
  return { svc, prisma, created, credited, prizes, notes };
}

describe('Pronostics LNH : prix de la semaine', () => {
  const all = [
    { userId: 'a', _count: { _all: 10 } }, { userId: 'b', _count: { _all: 10 } }, { userId: 'c', _count: { _all: 8 } },
    { userId: 'd', _count: { _all: 6 } }, { userId: 'e', _count: { _all: 4 } }, { userId: 'f', _count: { _all: 9 } },
  ];
  const wins = [
    { userId: 'a', _count: { _all: 7 } }, { userId: 'b', _count: { _all: 8 } }, { userId: 'c', _count: { _all: 7 } },
    { userId: 'd', _count: { _all: 5 } }, { userId: 'e', _count: { _all: 4 } }, { userId: 'f', _count: { _all: 0 } },
  ];

  it('classe par bonnes prédictions puis par pourcentage, et verse 100, 60 et 40 points', async () => {
    const t = setup({ picks: { all, wins } });
    await t.svc.payWeeklyPrizes('2026-10-05');
    // b (8), puis a (7 sur 10) devant c (7 sur 8)? c a un meilleur pourcentage : 7/8 > 7/10
    expect(t.prizes.map((p) => [p.userId, p.rank, p.points])).toEqual([['b', 1, 100], ['c', 2, 60], ['a', 3, 40]]);
    expect(t.credited.get('b')).toBe(100);
    expect(t.notes).toHaveLength(3);
  });

  it('écarte les membres avec trop peu de prédictions (e : 4) ou sans aucune bonne (f)', async () => {
    const t = setup({ picks: { all, wins } });
    await t.svc.payWeeklyPrizes('2026-10-05');
    expect(t.prizes.map((p) => p.userId)).not.toContain('e');
    expect(t.prizes.map((p) => p.userId)).not.toContain('f');
  });

  it('ne verse jamais deux fois le même rang', async () => {
    const t = setup({ picks: { all, wins }, paidRanks: new Set([1, 2, 3]) });
    await t.svc.payWeeklyPrizes('2026-10-05');
    expect(t.credited.size).toBe(0);
    expect(t.notes).toHaveLength(0);
  });

  it('la semaine visée par défaut est la précédente (du lundi au dimanche)', async () => {
    const t = setup({ picks: { all, wins } });
    await t.svc.payWeeklyPrizes();
    const where = t.prisma.nhlPick.groupBy.mock.calls[0][0].where;
    expect(addDays(where.day.gte, 6)).toBe(where.day.lte);
    expect(new Date(`${where.day.gte}T12:00:00Z`).getUTCDay()).toBe(1); // lundi
  });
});

describe('Pronostics LNH : synchronisation et règlement', () => {
  const today = '2026-10-17';

  it('crée les matchs de la fenêtre (saison et séries), pas la pré-saison ni les jours trop lointains', async () => {
    const t = setup();
    await t.svc.sync(DEFAULT_PICKS, [
      game({ id: 1, date: '2026-10-16', state: 'FINAL' }), game({ id: 2, date: today }), game({ id: 3, date: '2026-10-19' }),
      game({ id: 4, date: '2026-10-20' }), // hors fenêtre (3 jours)
      game({ id: 5, date: today, kind: 'PRESAISON' }), game({ id: 6, date: today, kind: 'SERIES' }),
    ], today);
    expect(t.created.map((c) => c.id).sort()).toEqual([1, 2, 3, 6]);
  });

  it('ne recrée pas un match déjà connu', async () => {
    const t = setup({ existing: [{ id: 2, startUtc: new Date('2026-10-17T23:00:00Z'), status: 'OPEN' }] });
    await t.svc.sync(DEFAULT_PICKS, [game({ id: 2, date: today })], today);
    expect(t.created).toHaveLength(0);
  });

  it('règle un match terminé, annule un match reporté et un match introuvable depuis trois jours', async () => {
    const now = new Date('2026-10-17T12:00:00Z');
    const t = setup({ openGames: [
      { id: 10, startUtc: new Date('2026-10-17T01:00:00Z') }, { id: 11, startUtc: new Date('2026-10-17T01:00:00Z') },
      { id: 12, startUtc: new Date('2026-10-10T01:00:00Z') }, { id: 13, startUtc: new Date('2026-10-16T20:00:00Z') },
    ] });
    const settle = jest.spyOn(t.svc, 'settleGame').mockResolvedValue(true);
    const voided = jest.spyOn(t.svc, 'voidGame').mockResolvedValue(true);
    const fin = game({ id: 10, date: today, state: 'FINAL', outcome: 'Final (prolongation)' });
    fin.home.score = 3; fin.away.score = 2;
    await t.svc.settleDue(DEFAULT_PICKS, [fin, game({ id: 11, date: today, state: 'PPD' })], now);
    expect(settle).toHaveBeenCalledWith(10, { home: 3, away: 2, outcome: 'Final (prolongation)' }, DEFAULT_PICKS);
    expect(voided).toHaveBeenCalledWith(11, 'Match reporté ou annulé');
    expect(voided).toHaveBeenCalledWith(12, expect.stringContaining('introuvable'));
    expect(voided).not.toHaveBeenCalledWith(13, expect.anything()); // introuvable depuis moins de trois jours : on attend
  });

  it('attend le score final avant de régler', async () => {
    const t = setup({ openGames: [{ id: 10, startUtc: new Date('2026-10-17T01:00:00Z') }] });
    const settle = jest.spyOn(t.svc, 'settleGame').mockResolvedValue(true);
    await t.svc.settleDue(DEFAULT_PICKS, [game({ id: 10, date: today, state: 'FINAL' })], new Date('2026-10-17T12:00:00Z'));
    expect(settle).not.toHaveBeenCalled();
  });
});
