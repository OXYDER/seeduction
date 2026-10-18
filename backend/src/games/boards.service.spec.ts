import { BoardsService } from './boards.service';

function setup(over: Record<string, any> = {}) {
  const prisma: any = {
    user: { findMany: jest.fn(async ({ where }: any) => where.id.in.map((id: string) => ({ id, username: `u-${id}` }))) },
    quizPlay: { groupBy: jest.fn(async () => []), findMany: jest.fn(async () => []) },
    nhlPick: { groupBy: jest.fn(async () => []) },
    wheelSpin: { findMany: jest.fn(async () => []) },
    challengeProgress: { groupBy: jest.fn(async () => []) },
    userCard: { groupBy: jest.fn(async () => []) },
    ...over,
  };
  return { svc: new BoardsService(prisma), prisma };
}

describe('BoardsService', () => {
  it('renvoie six classements, vides sans activité', async () => {
    const { svc } = setup();
    const r = await svc.overview('me');
    expect(r.boards.map((b) => b.id)).toEqual(['quiz-week', 'quiz-streak', 'picks-week', 'wheel-streak', 'challenges', 'cards']);
    expect(r.boards.every((b) => b.rows.length === 0 && b.me === null)).toBe(true);
  });

  it('trie par valeur décroissante, limite à 10 et donne le rang du membre hors du top', async () => {
    const cards = Array.from({ length: 15 }, (_, i) => ({ userId: `a${i}`, _count: { _all: 100 - i } }));
    const { svc } = setup({ userCard: { groupBy: jest.fn(async () => cards) } });
    const r = await svc.overview('a12');
    const b = r.boards.find((x) => x.id === 'cards')!;
    expect(b.rows).toHaveLength(10);
    expect(b.rows[0]).toMatchObject({ rank: 1, username: 'u-a0', value: 100 });
    expect(b.me).toEqual({ rank: 13, value: 88 });
    expect(b.rows.some((x) => x.mine)).toBe(false);
  });

  it('marque la ligne du membre quand il est dans le top', async () => {
    const { svc } = setup({ challengeProgress: { groupBy: jest.fn(async () => [{ userId: 'x', _count: { _all: 3 } }, { userId: 'me', _count: { _all: 9 } }]) } });
    const b = (await svc.overview('me')).boards.find((x) => x.id === 'challenges')!;
    expect(b.rows[0]).toMatchObject({ username: 'u-me', mine: true, value: 9 });
    expect(b.me).toEqual({ rank: 1, value: 9 });
  });

  it('additionne points et bonus du quiz, et ignore les valeurs nulles', async () => {
    const { svc } = setup({
      quizPlay: {
        groupBy: jest.fn(async () => [
          { userId: 'a', _sum: { points: 30, bonus: 10, correct: 4 }, _count: { _all: 2 } },
          { userId: 'b', _sum: { points: 0, bonus: 0, correct: 0 }, _count: { _all: 1 } },
        ]),
        findMany: jest.fn(async () => []),
      },
    });
    const b = (await svc.overview('me')).boards.find((x) => x.id === 'quiz-week')!;
    expect(b.rows).toHaveLength(1);
    expect(b.rows[0]).toMatchObject({ username: 'u-a', value: 40 });
  });

  it('garde la série du jour le plus récent pour chaque membre', async () => {
    const { svc } = setup({
      wheelSpin: { findMany: jest.fn(async () => [{ userId: 'a', streak: 9, day: '2000-01-01' }, { userId: 'a', streak: 3, day: '2999-01-01' }]) },
    });
    const b = (await svc.overview('me')).boards.find((x) => x.id === 'wheel-streak')!;
    expect(b.rows[0].value).toBe(3);
  });

  it('affiche « Membre supprimé » si le compte n\'existe plus', async () => {
    const { svc } = setup({
      userCard: { groupBy: jest.fn(async () => [{ userId: 'gone', _count: { _all: 5 } }]) },
      user: { findMany: jest.fn(async () => []) },
    });
    const b = (await svc.overview('me')).boards.find((x) => x.id === 'cards')!;
    expect(b.rows[0].username).toBe('Membre supprimé');
  });
});
