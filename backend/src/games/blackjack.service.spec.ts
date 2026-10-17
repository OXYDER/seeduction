import { BlackjackService } from './blackjack.service';
import { DEFAULT_BJ, State, newGame, settle } from '../common/utils/blackjack';

const c = (rank: number) => rank - 2;
const seq = (...ranks: number[]) => { let i = 0; return () => c(ranks[i++]); };

function setup(game: any, opts: { conflict?: boolean } = {}) {
  const credited: number[] = [];
  const updates: any[] = [];
  const debits: number[] = [];
  const tx: any = {
    blackjackGame: { updateMany: jest.fn(async ({ data }: any) => { if (opts.conflict) return { count: 0 }; updates.push(data); return { count: 1 }; }) },
    user: { update: jest.fn(async ({ data }: any) => { credited.push(data.bonusPoints.increment); return {}; }) },
    $executeRaw: jest.fn(async () => { debits.push(1); return 1; }),
  };
  const prisma: any = {
    blackjackGame: { findMany: jest.fn(async () => [game]), findUniqueOrThrow: jest.fn(async () => ({ ...game, status: 'DONE' })) },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const svc = new BlackjackService(prisma, { get: jest.fn(async () => null) } as any, { log: jest.fn() } as any);
  return { svc, credited, updates, debits, prisma };
}

const idleGame = (state: State, over: any = {}) => ({ id: 'g1', userId: 'u1', stake: 10, valued: 10, daily: false, status: 'ACTIVE', state, version: 3, payout: null, outcome: null, createdAt: new Date(), updatedAt: new Date(0), endedAt: null, ...over });

describe('Blackjack : parties abandonnées', () => {
  it('le joueur reste, le croupier joue, la partie est réglée et le gain versé une seule fois', async () => {
    const state = newGame(seq(10, 6, 9, 10)); // joueur 19 contre 16 : le croupier tire
    const t = setup(idleGame(state));
    await t.svc.sweep();
    expect(t.updates).toHaveLength(1);
    const data = t.updates[0];
    expect(data.status).toBe('DONE');
    expect(data.active).toBeNull();
    const done = data.state as State;
    expect(done.phase).toBe('DONE');
    expect(done.hands[0].status).toBe('STAND');
    // le gain enregistré est celui du règlement des mains finales, et c'est ce qui est versé
    const expected = settle(done, 10, DEFAULT_BJ, 5000);
    expect(data.payout).toBe(expected.payout);
    expect(t.credited).toEqual(expected.payout > 0 ? [expected.payout] : []);
    expect(t.debits).toHaveLength(0); // rien n'est débité de plus
  });

  it('ne verse rien si la partie a été modifiée entre-temps (garde de version)', async () => {
    const t = setup(idleGame(newGame(seq(10, 6, 9, 10))), { conflict: true });
    await expect(t.svc.sweep()).resolves.toBeUndefined();
    expect(t.credited).toHaveLength(0);
  });

  it('une partie gratuite abandonnée est plafonnée au gain maximal gratuit', async () => {
    const state = newGame(seq(10, 6, 9, 10));
    const t = setup(idleGame(state, { daily: true, stake: 0, valued: 100 }));
    await t.svc.sweep();
    const data = t.updates[0];
    expect(data.payout).toBeLessThanOrEqual(DEFAULT_BJ.dailyFree.maxWin);
  });
});
