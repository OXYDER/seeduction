import { loadIdentity, sessionRefusal, forgetIdentity } from './session-identity';

const db = (row: any) => ({ user: { findUnique: jest.fn(async () => row) } });

describe('session-identity', () => {
  it('relit la base puis garde la réponse en mémoire', async () => {
    const d = db({ status: 'ACTIVE', role: 'USER', sessionsValidAfter: null });
    await loadIdentity(d, 'cache-1'); await loadIdentity(d, 'cache-1');
    expect(d.user.findUnique).toHaveBeenCalledTimes(1);
  });
  it('un compte supprimé est refusé', async () => {
    forgetIdentity('gone');
    expect(sessionRefusal(await loadIdentity(db(null), 'gone'), 1)).toMatch(/introuvable/);
  });
  it('banni ou désactivé : refusé', () => {
    expect(sessionRefusal({ status: 'BANNED', role: 'USER', validAfter: 0 }, 1)).toMatch(/indisponible/);
    expect(sessionRefusal({ status: 'DISABLED', role: 'USER', validAfter: 0 }, 1)).toMatch(/indisponible/);
  });
  it('le rôle vient de la base, pas du jeton', async () => {
    forgetIdentity('demoted');
    const id = await loadIdentity(db({ status: 'ACTIVE', role: 'USER', sessionsValidAfter: null }), 'demoted');
    expect(id?.role).toBe('USER');
    expect(sessionRefusal(id, 1)).toBeNull();
  });
  it('un jeton émis avant le changement de mot de passe est refusé, un plus récent passe', () => {
    const id = { status: 'ACTIVE', role: 'USER', validAfter: 1_000_000 };
    expect(sessionRefusal(id, 999)).toMatch(/expirée/);
    expect(sessionRefusal(id, 1001)).toBeNull();
  });
});
