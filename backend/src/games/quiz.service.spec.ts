import { QuizService } from './quiz.service';
import { dayBefore } from '../common/utils/wheel';
import { torontoDay } from './wheel.service';

function setup(opts: { winners?: any[]; seeded?: boolean; count?: number; enabled?: boolean; alreadyPaid?: Set<string> } = {}) {
  const state = { credited: new Map<string, number>(), podium: new Map<string, number>(), seeded: !!opts.seeded, created: 0, query: null as any };
  const paid = opts.alreadyPaid ?? new Set<string>();
  const tx: any = {
    quizPlay: { updateMany: jest.fn(async ({ where, data }: any) => { if (paid.has(where.id)) return { count: 0 }; paid.add(where.id); state.podium.set(where.id, data.podium); return { count: 1 }; }) },
    user: { update: jest.fn(async ({ where, data }: any) => { state.credited.set(where.id, (state.credited.get(where.id) ?? 0) + data.bonusPoints.increment); return {}; }) },
  };
  const prisma: any = {
    quizPlay: { findMany: jest.fn(async (q: any) => { state.query = q; return opts.winners ?? []; }) },
    quizQuestion: { count: jest.fn(async () => opts.count ?? 0), createMany: jest.fn(async ({ data }: any) => { state.created = data.length; return {}; }) },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const store = new Map<string, any>();
  if (opts.seeded) store.set('quizSeeded', true);
  if (opts.enabled === false) store.set('quiz', { enabled: false });
  const settings: any = { get: jest.fn(async (k: string) => store.get(k) ?? null), set: jest.fn(async (k: string, v: any) => { store.set(k, v); if (k === 'quizSeeded') state.seeded = true; }) };
  const notes: any[] = [];
  const notifications: any = { notify: jest.fn(async (n: any) => { notes.push(n); return n; }) };
  const svc = new QuizService(prisma, settings, { log: jest.fn() } as any, notifications);
  return { svc, state, notes, prisma, store };
}

describe('Quiz quotidien : podium de la veille', () => {
  const winners = [{ id: 'p1', userId: 'u1', correct: 5 }, { id: 'p2', userId: 'u2', correct: 4 }, { id: 'p3', userId: 'u3', correct: 4 }];

  it('cherche les trois meilleurs de la veille (score, puis temps) qui ont au moins une bonne réponse', async () => {
    const t = setup({ winners });
    await t.svc.payPodium();
    expect(t.state.query.where).toMatchObject({ day: dayBefore(torontoDay()), status: 'DONE', correct: { gte: 1 }, podium: 0 });
    expect(t.state.query.orderBy).toEqual([{ correct: 'desc' }, { totalMs: 'asc' }]);
    expect(t.state.query.take).toBe(3);
  });

  it('verse 50, 30 et 20 points et prévient chaque gagnant', async () => {
    const t = setup({ winners });
    await t.svc.payPodium();
    expect(t.state.credited.get('u1')).toBe(50);
    expect(t.state.credited.get('u2')).toBe(30);
    expect(t.state.credited.get('u3')).toBe(20);
    expect([t.state.podium.get('p1'), t.state.podium.get('p2'), t.state.podium.get('p3')]).toEqual([1, 2, 3]);
    expect(t.notes.map((n) => n.title)).toEqual(expect.arrayContaining([expect.stringContaining('+50'), expect.stringContaining('+30'), expect.stringContaining('+20')]));
  });

  it('ne paie jamais deux fois le même podium', async () => {
    const t = setup({ winners, alreadyPaid: new Set(['p1', 'p2', 'p3']) });
    await t.svc.payPodium();
    expect(t.state.credited.size).toBe(0);
    expect(t.notes).toHaveLength(0);
  });

  it('ne fait rien quand le quiz est fermé', async () => {
    const t = setup({ winners, enabled: false });
    await t.svc.payPodium();
    expect(t.prisma.quizPlay.findMany).not.toHaveBeenCalled();
  });
});

describe('Quiz quotidien : banque de questions fournie', () => {
  it('est ajoutée une seule fois, au premier démarrage', async () => {
    const t = setup({ count: 0 });
    await t.svc.onModuleInit();
    expect(t.state.created).toBeGreaterThanOrEqual(60);
    expect(t.state.seeded).toBe(true);
    t.state.created = 0;
    await t.svc.onModuleInit();
    expect(t.state.created).toBe(0);
  });

  it('ne touche pas une banque déjà remplie', async () => {
    const t = setup({ count: 12 });
    await t.svc.onModuleInit();
    expect(t.state.created).toBe(0);
    expect(t.state.seeded).toBe(true);
  });

  it('ne revient pas quand l\'administration a vidé la banque', async () => {
    const t = setup({ count: 0, seeded: true });
    await t.svc.onModuleInit();
    expect(t.state.created).toBe(0);
  });
});
