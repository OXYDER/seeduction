import { AccessCtx, FlatForum, canRead, describeDenied, describeRule, normalizeAccess, passes, writeDenied } from './forum-access';

const ctx = (over: Partial<AccessCtx> = {}): AccessCtx => ({ role: 'USER', memberClass: 'MEMBRE', donor: false, adult: false, ...over });
const f = (id: string, parentId: string | null, over: Partial<FlatForum> = {}): FlatForum => ({ id, parentId, isCategory: false, staffOnly: false, locked: false, archived: false, access: null, ...over });
const map = (...l: FlatForum[]) => new Map(l.map((x) => [x.id, x]));

describe('règles d\'accès', () => {
  it('libre par défaut, visiteur non connecté compris', () => {
    expect(passes(undefined, null)).toBe(true);
    expect(passes({ type: 'ALL' }, null)).toBe(true);
    expect(passes({ type: 'CLASS', minClass: 'ELITE' }, null)).toBe(false);
  });
  it('rang minimum : Élite et plus', () => {
    const r = { type: 'CLASS' as const, minClass: 'ELITE' };
    expect(passes(r, ctx({ memberClass: 'POWER_USER' }))).toBe(false);
    expect(passes(r, ctx({ memberClass: 'ELITE' }))).toBe(true);
    expect(passes(r, ctx({ memberClass: 'VETERAN' }))).toBe(true);
  });
  it('uploaders, donateurs, 18+', () => {
    expect(passes({ type: 'UPLOADERS' }, ctx())).toBe(false);
    expect(passes({ type: 'UPLOADERS' }, ctx({ role: 'UPLOADER' }))).toBe(true);
    expect(passes({ type: 'DONORS' }, ctx({ donor: true }))).toBe(true);
    expect(passes({ type: 'ADULT' }, ctx())).toBe(false);
    expect(passes({ type: 'ADULT' }, ctx({ adult: true }))).toBe(true);
  });
  it('l\'équipe passe toujours', () => {
    for (const type of ['STAFF', 'UPLOADERS', 'DONORS', 'ADULT', 'CLASS'] as const) expect(passes({ type, minClass: 'VETERAN' }, ctx({ role: 'MODERATOR', memberClass: 'NOUVEAU' }))).toBe(true);
    expect(passes({ type: 'STAFF' }, ctx({ role: 'UPLOADER' }))).toBe(false);
  });
  it('nettoie ce qui vient du navigateur', () => {
    expect(normalizeAccess(null)).toBeNull();
    expect(normalizeAccess({ read: { type: 'ALL' }, write: { type: 'N_IMPORTE_QUOI' } })).toBeNull();
    expect(normalizeAccess({ read: { type: 'CLASS', minClass: 'XXX' }, write: { type: 'STAFF', secret: 1 } })).toEqual({ read: { type: 'CLASS', minClass: 'MEMBRE' }, write: { type: 'STAFF' } });
  });
  it('libellés lisibles', () => {
    expect(describeRule({ type: 'CLASS', minClass: 'ELITE' })).toBe('les membres Élite et plus');
    expect(describeRule(undefined)).toBeNull();
  });
});

describe('lecture : toute la chaîne compte', () => {
  const cat = f('cat', null, { isCategory: true, access: { read: { type: 'ADULT' } } });
  const forum = f('forum', 'cat');
  const sub = f('sub', 'forum');
  const m = map(cat, forum, sub);
  it('un forum dans une catégorie réservée est réservé aussi, sous-forums compris', () => {
    expect(canRead('sub', m, ctx())).toBe(false);
    expect(canRead('sub', m, ctx({ adult: true }))).toBe(true);
    expect(canRead('forum', m, null)).toBe(false);
  });
  it('staffOnly (ancien réglage) reste respecté', () => {
    const m2 = map(f('a', null, { staffOnly: true }), f('b', 'a'));
    expect(canRead('b', m2, ctx())).toBe(false);
    expect(canRead('b', m2, ctx({ role: 'ADMIN' }))).toBe(true);
  });
});

describe('écriture', () => {
  it('connexion, catégorie, verrou et archive', () => {
    const m = map(f('cat', null, { isCategory: true }), f('ok', 'cat'), f('lock', 'cat', { locked: true }), f('arch', 'cat', { archived: true }));
    expect(writeDenied('ok', m, null)).toEqual({ reason: 'LOGIN' });
    expect(writeDenied('cat', m, ctx())).toEqual({ reason: 'CATEGORY' });
    expect(writeDenied('ok', m, ctx())).toBeNull();
    expect(writeDenied('lock', m, ctx())).toEqual({ reason: 'LOCKED' });
    expect(writeDenied('arch', m, ctx())).toEqual({ reason: 'ARCHIVED' });
    expect(writeDenied('lock', m, ctx({ role: 'MODERATOR' }))).toBeNull();
    expect(writeDenied('arch', m, ctx({ role: 'ADMIN' }))).toBeNull();
  });
  it('lecture libre mais écriture réservée', () => {
    const m = map(f('x', null, { access: { write: { type: 'CLASS', minClass: 'ELITE' } } }));
    expect(canRead('x', m, null)).toBe(true);
    expect(writeDenied('x', m, ctx())?.reason).toBe('RULE');
    expect(describeDenied(writeDenied('x', m, ctx())!)).toContain('Élite');
    expect(writeDenied('x', m, ctx({ memberClass: 'ELITE' }))).toBeNull();
  });
  it('l\'écriture d\'un sous-forum respecte la règle de son forum parent', () => {
    const m = map(f('p', null, { access: { write: { type: 'DONORS' } } }), f('c', 'p'));
    expect(writeDenied('c', m, ctx())?.reason).toBe('RULE');
    expect(writeDenied('c', m, ctx({ donor: true }))).toBeNull();
  });
  it('forum illisible : impossible d\'y écrire', () => {
    const m = map(f('x', null, { access: { read: { type: 'DONORS' } } }));
    expect(writeDenied('x', m, ctx())?.reason).toBe('READ');
  });
});
