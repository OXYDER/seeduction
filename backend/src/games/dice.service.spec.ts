import { DiceService } from './dice.service';

/** Un service avec une base simulée et des dés imposés (les deux premiers tirages). */
function setup(opts: { dice: [number, number]; cfg?: any; debited?: number; loss?: { stake: number; payout: number }; freeToday?: number; account?: any }) {
  const state = { debit: [] as number[], credited: 0, rolls: [] as any[] };
  const tx: any = {
    $executeRaw: jest.fn(async (s: TemplateStringsArray, ...vals: any[]) => { if (/set_config/.test(s.join('?'))) return 1; state.debit.push(Number(vals[0])); return opts.debited ?? 1; }),
    user: {
      update: jest.fn(async ({ data }: any) => { state.credited += data.bonusPoints.increment; return {}; }),
      findUniqueOrThrow: jest.fn(async () => ({ bonusPoints: 1000, donatedPoints: 0 })),
    },
    diceRoll: { create: jest.fn(async ({ data }: any) => { state.rolls.push(data); return data; }) },
  };
  const prisma: any = {
    user: { findUnique: jest.fn(async () => ({ status: 'ACTIVE', createdAt: new Date(Date.now() - 30 * 86400_000), gamesOptOut: false, parentId: null, ...(opts.account ?? {}) })) },
    diceRoll: {
      aggregate: jest.fn(async () => ({ _sum: { stake: opts.loss?.stake ?? 0, payout: opts.loss?.payout ?? 0 } })),
      count: jest.fn(async () => opts.freeToday ?? 0),
    },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const settings: any = { get: jest.fn(async () => opts.cfg ?? null) };
  const svc = new DiceService(prisma, settings, { log: jest.fn() } as any);
  let i = 0;
  (svc as any).rng = () => opts.dice[i++ % 2] - 1; // roll(rng) ajoute 1 à chaque tirage
  return { svc, state };
}

describe('Dés (service)', () => {
  it('un pari gagnant rend la mise multipliée par la cote, arrondie vers le bas', async () => {
    const t = setup({ dice: [3, 4] }); // total 7
    const r = await t.svc.roll('u1', { kind: 'EXACT', n: 7, stake: 5 });
    expect(r).toMatchObject({ d1: 3, d2: 4, total: 7, win: true, mult: 5.7, payout: 28, tier: 'big' }); // 5 × 5,70 = 28,5 -> 28
    expect(t.state.debit).toEqual([5]);
    expect(t.state.credited).toBe(28);
    expect(t.state.rolls[0]).toMatchObject({ userId: 'u1', stake: 5, valued: 5, daily: false, kind: 'EXACT', n: 7, d1: 3, d2: 4, mult: 570, payout: 28 });
  });

  it('un pari perdant ne rend rien', async () => {
    const t = setup({ dice: [1, 2] });
    const r = await t.svc.roll('u1', { kind: 'OVER', n: 7, stake: 10 });
    expect(r).toMatchObject({ win: false, payout: 0, tier: 'none' });
    expect(t.state.credited).toBe(0);
    expect(t.state.debit).toEqual([10]);
  });

  it('les doubles gagnent quand les deux dés sont identiques', async () => {
    const win = await setup({ dice: [4, 4] }).svc.roll('u1', { kind: 'DOUBLES', n: 0, stake: 10 });
    expect(win).toMatchObject({ win: true, doubles: true, payout: 57 });
    const lose = await setup({ dice: [4, 5] }).svc.roll('u1', { kind: 'DOUBLES', n: 0, stake: 10 });
    expect(lose.win).toBe(false);
  });

  it('le gain maximal plafonne le paiement', async () => {
    const t = setup({ dice: [1, 1], cfg: { maxWin: 100 } });
    const r = await t.svc.roll('u1', { kind: 'EXACT', n: 2, stake: 100 }); // 100 × 34,20 = 3 420 -> plafonné à 100
    expect(r.payout).toBe(100);
  });

  it('le lancer gratuit ne débite rien, ne fait jamais perdre et est plafonné au gain gratuit', async () => {
    const lost = setup({ dice: [1, 2] });
    const l = await lost.svc.roll('u1', { kind: 'OVER', n: 7, daily: true });
    expect(l).toMatchObject({ win: false, daily: true, stake: 10, payout: 0 });
    expect(lost.state.debit).toEqual([]);
    expect(lost.state.rolls[0]).toMatchObject({ stake: 0, valued: 10, daily: true });
    const won = setup({ dice: [1, 1] });
    const w = await won.svc.roll('u1', { kind: 'EXACT', n: 2, daily: true }); // 10 × 34,20 = 342 -> plafonné à 100
    expect(w.payout).toBe(100);
    expect(won.state.debit).toEqual([]);
  });

  it('un seul lancer gratuit par jour', async () => {
    const t = setup({ dice: [1, 2], freeToday: 1 });
    await expect(t.svc.roll('u1', { kind: 'OVER', n: 7, daily: true })).rejects.toThrow(/déjà joué/);
    expect(t.state.rolls).toHaveLength(0);
  });

  it('refuse un pari qui n\'est pas proposé, une mise invalide et une mise hors limites', async () => {
    const t = setup({ dice: [3, 4] });
    await expect(t.svc.roll('u1', { kind: 'UNDER', n: 12, stake: 10 })).rejects.toThrow(/pas proposé/); // cote sous ×1,10
    await expect(t.svc.roll('u1', { kind: 'TRICHE', n: 7, stake: 10 })).rejects.toThrow(/invalide/);
    await expect(t.svc.roll('u1', { kind: 'EXACT', n: 7, stake: 7 })).rejects.toThrow(/Mise invalide/);
    await expect(t.svc.roll('u1', { kind: 'EXACT', n: 7, stake: 500 })).rejects.toThrow(/Mise invalide/);
    expect(t.state.rolls).toHaveLength(0);
  });

  it('points misables insuffisants (points de don) : rien n\'est enregistré ni versé', async () => {
    const t = setup({ dice: [3, 4], debited: 0 });
    await expect(t.svc.roll('u1', { kind: 'EXACT', n: 7, stake: 10 })).rejects.toThrow(/misables insuffisants/);
    expect(t.state.credited).toBe(0);
    expect(t.state.rolls).toHaveLength(0);
  });

  it('la limite de pertes du jour est respectée', async () => {
    const t = setup({ dice: [3, 4], loss: { stake: 980, payout: 0 }, cfg: { dailyLossMax: 1000 } });
    await expect(t.svc.roll('u1', { kind: 'EXACT', n: 7, stake: 50 })).rejects.toThrow(/Limite de pertes/);
    const full = setup({ dice: [3, 4], loss: { stake: 1000, payout: 0 }, cfg: { dailyLossMax: 1000 } });
    await expect(full.svc.roll('u1', { kind: 'EXACT', n: 7, stake: 5 })).rejects.toThrow(/atteinte/);
  });

  it('refuse un compte récent, un membre retiré des jeux et un profil du compte famille', async () => {
    await expect(setup({ dice: [3, 4], account: { createdAt: new Date() } }).svc.roll('u1', { kind: 'EXACT', n: 7, stake: 5 })).rejects.toThrow(/au moins 7 jours/);
    await expect(setup({ dice: [3, 4], account: { gamesOptOut: true } }).svc.roll('u1', { kind: 'EXACT', n: 7, stake: 5 })).rejects.toThrow(/retiré/);
    await expect(setup({ dice: [3, 4], account: { parentId: 'p' } }).svc.roll('u1', { kind: 'EXACT', n: 7, stake: 5 })).rejects.toThrow(/compte principal/);
  });

  it('pas deux lancers à moins d\'une seconde d\'intervalle', async () => {
    const t = setup({ dice: [3, 4] });
    await t.svc.roll('u1', { kind: 'EXACT', n: 7, stake: 5 });
    await expect(t.svc.roll('u1', { kind: 'EXACT', n: 7, stake: 5 })).rejects.toThrow(/Doucement/);
  });
});
