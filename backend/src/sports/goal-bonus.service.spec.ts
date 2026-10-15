import { DEFAULT_GOAL_BONUS, GoalBonusService, normalizeGoalBonus } from './goal-bonus.service';

const DAY = 86400_000;
const game = (score: number, period = '2e période') => ({
  id: 7, state: 'LIVE', side: 'home', period,
  home: { abbrev: 'MTL', name: 'Canadiens', score, sog: 0 }, away: { abbrev: 'BOS', name: 'Bruins', score: 1, sog: 0 },
}) as any;

/** Comme les opérations Prisma : rien ne s'exécute avant qu'on les attende, et une transaction s'arrête à la première erreur. */
const lazy = (fn: () => Promise<any>) => ({ then: (res: any, rej: any) => fn().then(res, rej) }) as any;

function setup(opts: { online?: { id: string }[]; users?: any[]; spent?: any[] } = {}) {
  const rewards: any[] = [];
  const notes: any[] = [];
  const credited: Record<string, number> = {};
  const prisma: any = {
    user: {
      findMany: jest.fn(async ({ where }: any) => (opts.users ?? []).filter((u) => where.id.in.includes(u.id) && (where.parentId === undefined || u.parentId === null))),
      update: jest.fn(({ where, data }: any) => lazy(async () => { credited[where.id] = (credited[where.id] ?? 0) + data.bonusPoints.increment; return {}; })),
    },
    goalReward: {
      create: jest.fn(({ data }: any) => lazy(async () => { if (rewards.some((r) => r.userId === data.userId && r.gameId === data.gameId && r.goal === data.goal)) throw new Error('unique'); rewards.push(data); return data; })),
      groupBy: jest.fn(async () => opts.spent ?? []),
    },
    $transaction: jest.fn(async (ops: any[]) => { const out: any[] = []; for (const op of ops) out.push(await op); return out; }),
  };
  const presence: any = { listOnlineAll: () => opts.online ?? [] };
  const notifications: any = { notify: jest.fn(async (n: any) => { notes.push(n); return n; }) };
  const svc = new GoalBonusService(prisma, presence, notifications);
  const run = async (g: any, cfg = DEFAULT_GOAL_BONUS) => { svc.observe(g, cfg, 'Canadiens de Montréal'); await new Promise((r) => setTimeout(r, 20)); };
  return { svc, run, rewards, notes, credited };
}

const member = (id: string, ageDays = 30, parentId: string | null = null) => ({ id, parentId, createdAt: new Date(Date.now() - ageDays * DAY) });

describe('Buts du Canadien : points aux membres en ligne', () => {
  it('ne verse rien pour le score déjà acquis à la première lecture', async () => {
    const t = setup({ online: [{ id: 'a' }], users: [member('a')] });
    await t.run(game(2));
    expect(t.rewards).toHaveLength(0);
    expect(t.notes).toHaveLength(0);
  });

  it('verse les points et prévient les membres en ligne quand le Canadien marque', async () => {
    const t = setup({ online: [{ id: 'a' }, { id: 'b' }], users: [member('a'), member('b')] });
    await t.run(game(0));
    await t.run(game(1));
    expect(t.credited).toEqual({ a: 5, b: 5 });
    expect(t.notes).toHaveLength(2);
    expect(t.notes[0].title).toContain('+5 points');
    expect(t.notes[0].groupKey).toBe('goal-7');
  });

  it('ne verse pas deux fois pour le même but', async () => {
    const t = setup({ online: [{ id: 'a' }], users: [member('a')] });
    await t.run(game(0));
    await t.run(game(1));
    await t.run(game(1));
    expect(t.credited.a).toBe(5);
  });

  it('un but refusé puis un vrai but ne paie pas deux fois le même numéro', async () => {
    const t = setup({ online: [{ id: 'a' }], users: [member('a')] });
    await t.run(game(0));
    await t.run(game(1));
    await t.run(game(0));
    await t.run(game(1));
    expect(t.credited.a).toBe(5);
  });

  it('un compte trop récent est prévenu mais ne reçoit pas de points', async () => {
    const t = setup({ online: [{ id: 'new' }], users: [member('new', 0)] });
    await t.run(game(0));
    await t.run(game(1));
    expect(t.credited.new).toBeUndefined();
    expect(t.notes[0].title).not.toContain('points');
  });

  it('respecte le plafond sur 24 heures', async () => {
    const t = setup({ online: [{ id: 'a' }], users: [member('a')], spent: [{ userId: 'a', _sum: { points: 98 } }] });
    await t.run(game(0));
    await t.run(game(1));
    expect(t.credited.a).toBeUndefined();
  });

  it('un profil du compte famille compte pour son compte, une seule fois', async () => {
    const t = setup({ online: [{ id: 'p1' }, { id: 'main' }], users: [member('main'), member('p1', 30, 'main')] });
    await t.run(game(0));
    await t.run(game(1));
    expect(t.credited).toEqual({ main: 5 });
  });

  it('ne verse rien pour les tirs de barrage', async () => {
    const t = setup({ online: [{ id: 'a' }], users: [member('a')] });
    await t.run(game(0, 'Tirs de barrage'));
    await t.run(game(1, 'Tirs de barrage'));
    expect(t.credited.a).toBeUndefined();
  });

  it('désactivé : prévient quand même ? non, rien du tout n\'est versé mais la notification reste', async () => {
    const t = setup({ online: [{ id: 'a' }], users: [member('a')] });
    const off = { ...DEFAULT_GOAL_BONUS, enabled: false };
    await t.run(game(0), off);
    await t.run(game(1), off);
    expect(t.credited.a).toBeUndefined();
    expect(t.notes).toHaveLength(1);
  });
});

describe('Buts du Canadien : réglages', () => {
  it('garde les valeurs précédentes quand une valeur est invalide', () => {
    const c = normalizeGoalBonus({ points: -3, dailyMax: 'x', enabled: 'oui' });
    expect(c).toEqual(DEFAULT_GOAL_BONUS);
    expect(normalizeGoalBonus({ points: 20, enabled: false }).points).toBe(20);
  });
});
