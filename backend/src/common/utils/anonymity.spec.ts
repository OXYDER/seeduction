import { ANONYMOUS_NAME, maskAnonymous, type AnonymityCtx } from './anonymity';

const ctx = (over: Partial<AnonymityCtx> = {}): AnonymityCtx => ({ ids: new Set(['u-anon']), names: new Set(['secret']), viewerIds: new Set(['u-viewer']), viewerNames: new Set(['viewer']), viewerStaff: false, ...over });

describe('membres anonymes', () => {
  it('remplace le pseudo et l’avatar d’un objet membre, partout dans la réponse', () => {
    const body = { items: [{ id: 't1', name: 'Film', uploader: { id: 'u-anon', username: 'Secret', avatarUrl: '/a.png' } }, { id: 't2', uploader: { id: 'u-other', username: 'Autre', avatarUrl: '/b.png' } }] };
    const out = maskAnonymous(body, ctx());
    expect(out.items[0].uploader).toMatchObject({ id: 'u-anon', username: ANONYMOUS_NAME, avatarUrl: null, anonymous: true });
    expect(out.items[1].uploader).toEqual({ id: 'u-other', username: 'Autre', avatarUrl: '/b.png' });
  });

  it('masque aussi un pseudo seul (clé connue) et l’auteur d’un message', () => {
    const out = maskAnonymous({ members: [{ user: { id: 'u-anon', username: 'Secret' }, role: 'OWNER' }], senderUsername: 'secret', senderId: 'u-anon', note: 'Secret a dit bonjour' }, ctx());
    expect(out.members[0].user.username).toBe(ANONYMOUS_NAME);
    expect(out.senderUsername).toBe(ANONYMOUS_NAME);
    expect(out.note).toBe('Secret a dit bonjour'); // le texte libre n'est pas touché
  });

  it('l’équipe et le membre lui-même voient la vérité', () => {
    const body = { u: { id: 'u-anon', username: 'Secret' } };
    expect(maskAnonymous(body, ctx({ viewerStaff: true }))).toBe(body);
    const self = maskAnonymous(body, ctx({ viewerIds: new Set(['u-anon']), viewerNames: new Set(['secret']) }));
    expect(self.u.username).toBe('Secret');
  });

  it('ne modifie jamais la réponse d’origine (elle peut venir d’un cache partagé)', () => {
    const body = { list: [{ id: 'u-anon', username: 'Secret' }] };
    const out = maskAnonymous(body, ctx());
    expect(body.list[0].username).toBe('Secret');
    expect(out).not.toBe(body);
  });

  it('rend la même réponse, sans copie, quand personne n’est anonyme dedans', () => {
    const body = { list: [{ id: 'u-1', username: 'Autre' }], d: new Date() };
    expect(maskAnonymous(body, ctx())).toBe(body);
    expect(maskAnonymous(body, ctx({ ids: new Set(), names: new Set() }))).toBe(body);
  });
});
