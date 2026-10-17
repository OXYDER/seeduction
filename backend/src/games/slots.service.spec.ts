import { SlotsService } from './slots.service';
import { DEFAULT_SLOTS, PROFILES, DEFAULT_PROFILE, winOf, resultAt } from '../common/utils/slots';

const P = PROFILES[DEFAULT_PROFILE];

/** Un service avec une base simulée : on impose les arrêts des rouleaux pour exercer le gros lot. */
function setup(opts: { pool: number; stops: number[]; cfg?: any }) {
  const state = { pool: opts.pool, credited: 0, spins: [] as any[], poolWrites: [] as number[] };
  const tx: any = {
    $executeRaw: jest.fn(async (strings: TemplateStringsArray, ...vals: any[]) => {
      const sql = strings.join('?');
      if (/UPDATE "User" SET "bonusPoints" = "bonusPoints" - /.test(sql)) return 1;
      if (/INSERT INTO "SlotJackpot"/.test(sql)) return 1;
      if (/UPDATE "SlotJackpot"/.test(sql)) { state.pool = Number(vals[0]); state.poolWrites.push(Number(vals[0])); return 1; }
      return 1;
    }),
    $queryRaw: jest.fn(async () => [{ pool: state.pool }]),
    user: { update: jest.fn(async ({ data }: any) => { state.credited += data.bonusPoints.increment; return {}; }), findUniqueOrThrow: jest.fn(async () => ({ bonusPoints: 1000, donatedPoints: 0, username: 'Alice' })) },
    slotSpin: { create: jest.fn(async ({ data }: any) => { state.spins.push(data); return data; }) },
  };
  const prisma: any = {
    user: { findUnique: jest.fn(async () => ({ status: 'ACTIVE', createdAt: new Date(Date.now() - 30 * 86400_000), gamesOptOut: false, parentId: null })) },
    slotSpin: { aggregate: jest.fn(async () => ({ _sum: { stake: 0, win: 0 } })), count: jest.fn(async () => 0), findFirst: jest.fn(async () => null) },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
    $queryRaw: jest.fn(async () => [{ pool: state.pool }]),
  };
  const settings: any = { get: jest.fn(async () => (opts.cfg ?? null)) };
  const notes: any[] = [];
  const notifications: any = { notify: jest.fn(async (n: any) => { notes.push(n); return n; }) };
  const presence: any = { listOnlineAll: () => [] };
  const svc = new SlotsService(prisma, settings, { log: jest.fn() } as any, presence, notifications);
  let i = 0;
  (svc as any).rng = (max: number) => opts.stops[i++ % 3] % max; // les trois premiers tirages imposent les arrêts, la suite reste cohérente
  return { svc, state, notes };
}

describe('Machines à sous : gros lot progressif (service)', () => {
  // arrêt 10 sur les trois rouleaux : les trois meilleurs symboles sur la rangée du milieu
  const JACKPOT_STOPS = [10, 10, 10];

  it('les arrêts imposés donnent bien le gros lot', () => {
    const r = resultAt(JACKPOT_STOPS, P);
    expect(r.jackpot).toBe(true);
  });

  it('une mise assez grande remporte toute la cagnotte, qui repart de sa mise de départ', async () => {
    const t = setup({ pool: 777.4, stops: JACKPOT_STOPS });
    const r = await t.svc.spin('u1', { machine: 'cinema', stake: 50 });
    const contribution = 50 * DEFAULT_SLOTS.jackpot.rate;
    expect(r.jackpot?.amount).toBe(Math.floor(777.4 + contribution));
    expect(r.win).toBeGreaterThanOrEqual(r.jackpot!.amount);
    expect(t.state.pool).toBe(DEFAULT_SLOTS.jackpot.seed);
    expect(t.state.spins[0].jackpot).toBe(true);
    expect(r.tier).toBe('mega');
    expect(t.notes.some((n) => /GROS LOT/.test(n.title))).toBe(true);
  });

  it('le prix fixe des lignes du gros lot est remplacé par la cagnotte (pas de double paiement)', async () => {
    const t = setup({ pool: 1000, stops: JACKPOT_STOPS });
    const r = await t.svc.spin('u1', { machine: 'cinema', stake: 50 });
    const first = resultAt(JACKPOT_STOPS, P);
    const fixedPart = winOf(first.jackpotMult, 50);
    const others = r.rounds.reduce((s: number, x: any) => s + x.win, 0) - fixedPart;
    expect(r.win).toBe(Math.max(0, others) + r.jackpot!.amount);
  });

  it('une petite mise ne gagne pas la cagnotte : prix fixe habituel, et la cagnotte grossit', async () => {
    const t = setup({ pool: 900, stops: JACKPOT_STOPS });
    const r = await t.svc.spin('u1', { machine: 'cinema', stake: 10 }); // sous la mise minimale du gros lot (25)
    expect(r.jackpot).toBeNull();
    expect(t.state.spins[0].jackpot).toBe(false);
    expect(t.state.pool).toBeCloseTo(900 + 10 * DEFAULT_SLOTS.jackpot.rate, 5);
    expect(r.win).toBeGreaterThanOrEqual(winOf(resultAt(JACKPOT_STOPS, P).jackpotMult, 10));
  });

  it('gros lot désactivé : rien ne bouge', async () => {
    const t = setup({ pool: 900, stops: JACKPOT_STOPS, cfg: { jackpot: { enabled: false } } });
    const r = await t.svc.spin('u1', { machine: 'cinema', stake: 50 });
    expect(r.jackpot).toBeNull();
    expect(t.state.poolWrites).toHaveLength(0);
  });

  it('le tour gratuit quotidien ne touche pas à la cagnotte', async () => {
    const t = setup({ pool: 900, stops: JACKPOT_STOPS });
    const r = await t.svc.spin('u1', { machine: 'cinema', daily: true });
    expect(r.jackpot).toBeNull();
    expect(t.state.poolWrites).toHaveLength(0);
  });
});
