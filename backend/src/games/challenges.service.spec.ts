import { ChallengesService } from './challenges.service';
import { pick } from '../common/utils/challenges';
import { weekStart } from '../common/utils/picks';
import { torontoDay } from './wheel.service';

/** Un service avec une base simulée : une ligne de progression par défi, et des gardes « done » comme en base. */
function setup(opts: { account?: any; enabled?: boolean; claimTaken?: boolean; bonusTaken?: boolean } = {}) {
  const rows = new Map<string, any>();
  const state = { credited: 0, bonuses: 0, activity: [] as string[], packs: [] as string[] };
  const key = (w: any) => `${w.userId_period_cid.userId}|${w.userId_period_cid.period}|${w.userId_period_cid.cid}`;
  const tx: any = {
    challengeProgress: { updateMany: jest.fn(async ({ where, data }: any) => { const r = [...rows.values()].find((x) => x.id === where.id); if (!r || r.done || opts.claimTaken) return { count: 0 }; Object.assign(r, data); return { count: 1 }; }) },
    challengeBonus: { createMany: jest.fn(async () => { if (opts.bonusTaken || state.bonuses > 0) return { count: 0 }; state.bonuses++; return { count: 1 }; }) },
    user: { update: jest.fn(async ({ data }: any) => { state.credited += data.bonusPoints.increment; return {}; }) },
  };
  let seq = 0;
  const prisma: any = {
    user: { findUnique: jest.fn(async () => (opts.account === null ? null : { status: 'ACTIVE', createdAt: new Date(Date.now() - 30 * 86400_000), parentId: null, ...(opts.account ?? {}) })) },
    challengeActivity: { createMany: jest.fn(async ({ data }: any) => { state.activity.push(data[0].game); return { count: 1 }; }), groupBy: jest.fn(async () => [...new Set(state.activity)].map((game) => ({ game }))) },
    challengeProgress: {
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const k = key(where); let r = rows.get(k);
        if (!r) { r = { id: `r${++seq}`, done: false, ...create }; rows.set(k, r); } else if (update.progress?.increment !== undefined) r.progress += update.progress.increment; else if (typeof update.progress === 'number') r.progress = update.progress;
        return { ...r };
      }),
      count: jest.fn(async ({ where }: any) => [...rows.values()].filter((r) => r.done && where.cid.in.includes(r.cid)).length),
    },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const settings: any = { get: jest.fn(async () => (opts.enabled === false ? { enabled: false } : null)) };
  const notes: any[] = [];
  const notifications: any = { notify: jest.fn(async (n: any) => { notes.push(n); return n; }) };
  const cards: any = { grantPack: jest.fn(async (_u: string, _s: string, k: string) => { state.packs.push(k); return true; }) };
  const svc = new ChallengesService(prisma, settings, { log: jest.fn() } as any, notifications, cards);
  return { svc, rows, state, notes, prisma };
}

const today = torontoDay();
const wk = weekStart(today);
const daily = pick('daily', today);
const weekly = pick('weekly', wk);
const easy = daily[0];

describe('Défis (service)', () => {
  it('un événement fait avancer le défi correspondant et rien d\'autre', async () => {
    const t = setup();
    await t.svc.handle({ userId: 'u1', event: easy.event as any, game: 'wheel' });
    const row = [...t.rows.values()].find((r) => r.cid === easy.id);
    expect(row).toBeTruthy();
    expect(row.progress).toBeGreaterThanOrEqual(1);
    expect([...t.rows.values()].every((r) => [...daily, ...weekly].some((d) => d.id === r.cid))).toBe(true);
  });

  it('verse la récompense une seule fois quand le défi est réussi, avec notification', async () => {
    const t = setup();
    const target = easy.target;
    for (let i = 0; i < target + 3; i++) await t.svc.handle({ userId: 'u1', event: easy.event as any, game: easy.event === 'free_play' ? 'dice' : 'wheel' });
    const row = [...t.rows.values()].find((r) => r.cid === easy.id);
    expect(row.done).toBe(true);
    expect(row.points).toBe(easy.points);
    expect(t.notes.filter((n) => n.title.includes(easy.title))).toHaveLength(1);
    expect(t.state.credited).toBeGreaterThanOrEqual(easy.points);
  });

  it('ne verse rien si la garde en base montre que le défi a déjà été payé par une autre requête', async () => {
    const t = setup({ claimTaken: true });
    for (let i = 0; i < easy.target; i++) await t.svc.handle({ userId: 'u1', event: easy.event as any, game: 'wheel' });
    expect(t.state.credited).toBe(0);
    expect(t.notes).toHaveLength(0);
  });

  it('le bonus du jour n\'est versé que lorsque les trois défis sont réussis, une seule fois', async () => {
    const t = setup();
    const events = ['wheel', 'cards_daily', 'quiz', 'free_play', 'quiz_correct', 'picks', 'cards_open', 'quiz_perfect', 'picks_won'] as const;
    // on joue chaque événement assez de fois pour réussir n'importe quel défi du catalogue du jour
    for (const e of events) for (let i = 0; i < 8; i++) await t.svc.handle({ userId: 'u1', event: e as any, game: ['wheel', 'cards', 'quiz', 'slots', 'hilo', 'dice', 'blackjack', 'picks'][i] });
    const doneDaily = [...t.rows.values()].filter((r) => r.scope === 'daily' && r.done).length;
    expect(doneDaily).toBe(3);
    expect(t.state.bonuses).toBe(1); // un seul bonus, même si plusieurs défis se terminent à la suite
    expect(t.notes.some((n) => /Tous les défis du jour/.test(n.title))).toBe(true);
    expect(t.state.packs.some((k) => k === `daily:${today}`)).toBe(true);
  });

  it('un défi hebdomadaire avec paquet de cartes l\'offre à la réussite', async () => {
    const hard = weekly[2];
    const t = setup();
    for (let i = 0; i < hard.target + 2; i++) await t.svc.handle({ userId: 'u1', event: hard.event as any, game: 'quiz' });
    if (hard.packs) expect(t.state.packs).toContain(`${wk}:${hard.id}`);
  });

  it('ignore un compte récent, inconnu ou un profil du compte famille, et tout quand les défis sont fermés', async () => {
    for (const account of [{ createdAt: new Date() }, { parentId: 'p' }, { status: 'SUSPENDED' }, null]) {
      const t = setup({ account });
      await t.svc.handle({ userId: 'u1', event: 'wheel', game: 'wheel' });
      expect(t.rows.size).toBe(0);
    }
    const closed = setup({ enabled: false });
    await closed.svc.handle({ userId: 'u1', event: 'wheel', game: 'wheel' });
    expect(closed.rows.size).toBe(0);
  });

  it('enregistre l\'activité de chaque jeu pour les défis « jeux différents »', async () => {
    const t = setup();
    await t.svc.handle({ userId: 'u1', event: 'wheel', game: 'wheel' });
    await t.svc.handle({ userId: 'u1', event: 'free_play', game: 'slots' });
    expect(t.state.activity).toEqual(['wheel', 'slots']);
  });
});
