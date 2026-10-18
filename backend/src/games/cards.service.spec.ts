import { CardsService } from './cards.service';

function setup(opts: { account?: any; existing?: Set<string>; enabled?: boolean } = {}) {
  const state = { packs: 0, grants: new Set<string>() };
  const existing = opts.existing ?? new Set<string>();
  const tx: any = {
    $executeRaw: jest.fn(async () => 1), // étiquette de source du journal des points
    cardPackGrant: { createMany: jest.fn(async ({ data }: any) => { const k = `${data[0].userId}|${data[0].source}|${data[0].key}`; if (existing.has(k) || state.grants.has(k)) return { count: 0 }; state.grants.add(k); return { count: 1 }; }) },
    cardWallet: { upsert: jest.fn(async ({ update }: any) => { state.packs += update.packs.increment; return {}; }) },
  };
  const prisma: any = {
    $executeRaw: jest.fn(async () => 1), // étiquette de source du journal des points
    user: { findUnique: jest.fn(async () => (opts.account === null ? null : { status: 'ACTIVE', createdAt: new Date(Date.now() - 30 * 86400_000), gamesOptOut: false, parentId: null, ...(opts.account ?? {}) })) },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const settings: any = { get: jest.fn(async () => (opts.enabled === false ? { enabled: false } : null)) };
  const notes: any[] = [];
  const notifications: any = { notify: jest.fn(async (n: any) => { notes.push(n); return n; }) };
  const svc = new CardsService(prisma, settings, { log: jest.fn() } as any, notifications);
  return { svc, state, notes, prisma };
}

describe('Cartes : paquets gagnés dans les autres jeux', () => {
  it('offre un paquet et prévient le membre', async () => {
    const t = setup();
    expect(await t.svc.grantPack('u1', 'quiz', '2026-10-17')).toBe(true);
    expect(t.state.packs).toBe(1);
    expect(t.notes[0].title).toMatch(/paquet de cartes/);
    expect(t.notes[0].body).toMatch(/quiz sans faute/);
  });

  it('ne l\'offre qu\'une fois par membre, source et clé', async () => {
    const t = setup();
    expect(await t.svc.grantPack('u1', 'wheel', '2026-10-17')).toBe(true);
    expect(await t.svc.grantPack('u1', 'wheel', '2026-10-17')).toBe(false);
    expect(await t.svc.grantPack('u1', 'wheel', '2026-10-24')).toBe(true); // un autre jour compte
    expect(await t.svc.grantPack('u1', 'picks', '2026-10-17')).toBe(true); // une autre source aussi
    expect(t.state.packs).toBe(3);
  });

  it('n\'offre rien à un compte récent, retiré des jeux, profil famille ou inconnu, ni si les cartes sont fermées', async () => {
    for (const account of [{ createdAt: new Date() }, { gamesOptOut: true }, { parentId: 'p' }, null]) {
      const t = setup({ account });
      expect(await t.svc.grantPack('u1', 'quiz', 'k')).toBe(false);
      expect(t.state.packs).toBe(0);
    }
    expect(await setup({ enabled: false }).svc.grantPack('u1', 'quiz', 'k')).toBe(false);
  });

  it('ne lève jamais d\'erreur vers le jeu qui l\'appelle', async () => {
    const t = setup();
    t.prisma.$transaction.mockRejectedValueOnce(new Error('base indisponible'));
    await expect(t.svc.grantPack('u1', 'quiz', 'k')).resolves.toBe(false);
  });
});
