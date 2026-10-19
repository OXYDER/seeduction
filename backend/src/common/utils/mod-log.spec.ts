import { ACTIONS, CATEGORIES, actionsOf, csvCell, infoOf, summarize, targetOf } from './mod-log';

describe('journal de modération', () => {
  it('chaque action a une catégorie connue et un libellé', () => {
    for (const [code, i] of Object.entries(ACTIONS)) { expect(Object.keys(CATEGORIES)).toContain(i.category); expect(i.label.length).toBeGreaterThan(3); expect(code).toMatch(/^[A-Z0-9_]+$/); }
  });
  it('les catégories de modération sont visibles de tous, les autres réservées aux administrateurs', () => {
    expect(['torrents', 'membres', 'chat', 'forum', 'anticheat', 'suggestions'].every((c) => !CATEGORIES[c as keyof typeof CATEGORIES].adminOnly)).toBe(true);
    expect(['donations', 'config', 'securite'].every((c) => CATEGORIES[c as keyof typeof CATEGORIES].adminOnly)).toBe(true);
    expect(actionsOf('chat').sort()).toEqual(['CHANNEL_PURGE', 'CHAT_BAN', 'CHAT_UNBAN']);
  });
  it('actions inconnues : libellé de repli', () => {
    expect(infoOf('TORRENT_APPROVE').severity).toBe('info');
    expect(infoOf('USER_BAN').severity).toBe('grave');
    expect(infoOf('WHEEL_CONFIG')).toEqual({ label: 'a réglé : wheel', category: 'config', severity: 'info' });
    expect(infoOf('QUELQUE_CHOSE').category).toBe('config');
  });
  it('trouve la cible et son lien', () => {
    expect(targetOf('TORRENT_APPROVE', { torrentId: 't1', name: 'Film.2024' })).toEqual({ kind: 'torrent', id: 't1', label: 'Film.2024', link: '/torrents/t1' });
    expect(targetOf('USER_BAN', { targetId: 'u1', target: 'marie' })).toEqual({ kind: 'user', id: 'u1', label: 'marie', link: '/users/u1' });
    expect(targetOf('CHAT_BAN', { userId: 'u2', username: 'paul', scope: '#general' })?.link).toBe('/users/u2');
    expect(targetOf('CHANNEL_PURGE', { channel: 'general' })).toEqual({ kind: 'other', label: '#general' });
    expect(targetOf('X', null)).toBeNull();
    expect(targetOf('X', {})).toBeNull();
  });
  it('résume le détail', () => {
    expect(summarize('USER_BAN', { reason: 'spam   répété', expiresAt: null })).toBe('motif : spam répété');
    expect(summarize('USER_EDIT', { changes: { role: { from: 'USER', to: 'UPLOADER' } } })).toBe('role : USER → UPLOADER');
    expect(summarize('TORRENT_HOLD', { reasons: ['nfo', 'titre'], note: 'à corriger' })).toBe('motifs : nfo, titre · note : à corriger');
    expect(summarize('CHANNEL_PURGE', { deleted: 12 })).toBe('12 messages supprimés');
    expect(summarize('X', undefined)).toBe('');
  });
  it('CSV : guillemets doublés et formules neutralisées', () => {
    expect(csvCell('a "b"\nc')).toBe('"a ""b"" c"');
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('-5')).toBe('"\'-5"');
    expect(csvCell(null)).toBe('""');
  });
});
