import { WheelService, nextMidnightToronto, torontoDay } from './wheel.service';
import { DEFAULT_SEGMENTS, dayBefore } from '../common/utils/wheel';

/** Un service avec une base simulée : on impose le tirage et le dernier tour du membre. */
function setup(opts: { random: number; last?: { day: string; streak: number } | null; account?: any; duplicate?: boolean }) {
  const state = { credited: 0, tokens: 0, spins: [] as any[] };
  const pending: (() => void)[] = []; // écritures d'une transaction : appliquées seulement si toutes réussissent, comme avec Prisma
  const prisma: any = {
    $executeRaw: jest.fn(async () => 1), // étiquette de source du journal des points
    user: {
      findUnique: jest.fn(async ({ select }: any) => (select?.bonusPoints !== undefined
        ? { bonusPoints: 1000 + state.credited, freeleechTokens: state.tokens }
        : { status: 'ACTIVE', createdAt: new Date(Date.now() - 30 * 86400_000), gamesOptOut: false, parentId: null, username: 'Alice', ...(opts.account ?? {}) })),
      update: jest.fn(({ data }: any) => { pending.push(() => { state.credited += data.bonusPoints.increment; state.tokens += data.freeleechTokens?.increment ?? 0; }); return Promise.resolve({}); }),
    },
    wheelSpin: {
      findFirst: jest.fn(async () => opts.last ?? null),
      create: jest.fn(({ data }: any) => {
        if (opts.duplicate) return Promise.reject(Object.assign(new Error('unique'), { code: 'P2002' }));
        pending.push(() => { state.spins.push(data); }); return Promise.resolve(data);
      }),
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => { try { await Promise.all(ops); pending.splice(0).forEach((f) => f()); } catch (e) { pending.length = 0; throw e; } }),
  };
  const notes: any[] = [];
  const notifications: any = { notify: jest.fn(async (n: any) => { notes.push(n); return n; }) };
  const cards = { grantPack: jest.fn(async () => true) };
  const svc = new WheelService(prisma, { get: jest.fn(async () => null) } as any, { log: jest.fn() } as any, { listOnlineAll: () => [] } as any, notifications, cards as any);
  (svc as any).random = () => opts.random;
  return { svc, state, notes, prisma, cards };
}

/** Nombre de [0,1[ qui tombe au milieu du secteur `i`. */
function middleOf(i: number): number {
  const total = DEFAULT_SEGMENTS.reduce((s, x) => s + x.weight, 0);
  const before = DEFAULT_SEGMENTS.slice(0, i).reduce((s, x) => s + x.weight, 0);
  return (before + DEFAULT_SEGMENTS[i].weight / 2) / total;
}

describe('Roue de la fortune (service)', () => {
  const today = torontoDay();

  it('un premier tour verse les points du secteur et démarre la série à 1', async () => {
    const t = setup({ random: middleOf(1) }); // secteur « 50 »
    const r = await t.svc.spin('u1');
    expect(r.segment).toBe(1);
    expect(r.reward).toEqual({ points: 50, tokens: 0, streakBonus: 0, total: 50 });
    expect(r.streak).toBe(1);
    expect(t.state.credited).toBe(50);
    expect(t.state.spins[0]).toMatchObject({ userId: 'u1', day: today, segment: 1, points: 50, streak: 1 });
    expect(t.cards.grantPack).not.toHaveBeenCalled(); // pas de paquet hors des sept jours de suite
  });

  it('jouer le lendemain de son dernier tour prolonge la série et augmente le lot', async () => {
    const t = setup({ random: middleOf(1), last: { day: dayBefore(today), streak: 4 } });
    const r = await t.svc.spin('u1');
    expect(r.streak).toBe(5);
    expect(r.reward.points).toBe(60); // 50 × 1,2
    expect(t.state.credited).toBe(60);
  });

  it('un jour manqué remet la série à 1', async () => {
    const t = setup({ random: middleOf(1), last: { day: dayBefore(dayBefore(today)), streak: 9 } });
    const r = await t.svc.spin('u1');
    expect(r.streak).toBe(1);
    expect(r.reward.points).toBe(50);
  });

  it('le septième jour de suite rapporte un bonus en plus', async () => {
    const t = setup({ random: middleOf(0), last: { day: dayBefore(today), streak: 6 } }); // secteur « 10 »
    const r = await t.svc.spin('u1');
    expect(r.streak).toBe(7);
    expect(r.reward.streakBonus).toBe(100);
    expect(t.state.credited).toBe(r.reward.points + 100);
    expect(t.cards.grantPack).toHaveBeenCalledWith('u1', 'wheel', today); // le bonus de sept jours rapporte aussi un paquet de cartes
  });

  it('les jetons freeleech sont ajoutés au compte', async () => {
    const t = setup({ random: middleOf(3) }); // secteur « Jeton »
    const r = await t.svc.spin('u1');
    expect(r.reward.tokens).toBe(1);
    expect(t.state.tokens).toBe(1);
    expect(r.tokens).toBe(1);
  });

  it('un second tour le même jour est refusé sans rien verser', async () => {
    const t = setup({ random: 0.5, last: { day: today, streak: 2 } });
    await expect(t.svc.spin('u1')).rejects.toThrow(/déjà tourné/);
    expect(t.state.credited).toBe(0);
  });

  it('deux requêtes simultanées : la contrainte d\'unicité refuse la seconde', async () => {
    const t = setup({ random: 0.5, duplicate: true });
    await expect(t.svc.spin('u1')).rejects.toThrow(/déjà tourné/);
    expect(t.state.credited).toBe(0);
  });

  it('refuse un membre retiré des jeux, un compte trop récent et un profil du compte famille', async () => {
    await expect(setup({ random: 0.5, account: { gamesOptOut: true } }).svc.spin('u1')).rejects.toThrow(/retiré des jeux/);
    await expect(setup({ random: 0.5, account: { createdAt: new Date() } }).svc.spin('u1')).rejects.toThrow(/au moins 3 jours/);
    await expect(setup({ random: 0.5, account: { parentId: 'p' } }).svc.spin('u1')).rejects.toThrow(/compte principal/);
  });

  it('un très gros lot prévient le gagnant ; un petit lot reste discret', async () => {
    const big = setup({ random: middleOf(15) }); // secteur « 1000 »
    const r = await big.svc.spin('u1');
    expect(r.reward.total).toBe(1000);
    await new Promise((res) => setImmediate(res));
    expect(big.notes.some((n) => /Roue de la fortune/.test(n.title))).toBe(true);
    const small = setup({ random: middleOf(0) });
    await small.svc.spin('u1');
    await new Promise((res) => setImmediate(res));
    expect(small.notes).toHaveLength(0);
  });
});

describe('Roue de la fortune : minuit de Montréal', () => {
  it("le prochain tour est à minuit heure de Montréal, y compris les jours de changement d'heure", () => {
    expect(nextMidnightToronto(new Date('2026-10-17T20:55:00Z')).toISOString()).toBe('2026-10-18T04:00:00.000Z'); // heure d'été (UTC-4)
    expect(nextMidnightToronto(new Date('2026-12-10T12:00:00Z')).toISOString()).toBe('2026-12-11T05:00:00.000Z'); // heure d'hiver (UTC-5)
    expect(nextMidnightToronto(new Date('2026-03-08T12:00:00Z')).toISOString()).toBe('2026-03-09T04:00:00.000Z'); // journée de 23 h
    expect(nextMidnightToronto(new Date('2026-11-01T12:00:00Z')).toISOString()).toBe('2026-11-02T05:00:00.000Z'); // journée de 25 h
  });
});
