import { NotificationType } from '@prisma/client';
import { NOTIFICATION_CATEGORIES, categoryOfType } from './notifications.service';

describe('catégories de notifications', () => {
  const keys = NOTIFICATION_CATEGORIES.map((c) => c.key as string);

  it('chaque type de notification a une catégorie connue', () => {
    for (const type of Object.values(NotificationType)) expect(keys).toContain(categoryOfType(type));
  });

  it('un seul onglet ne peut pas être coupé : le système (sanctions, sécurité)', () => {
    expect(NOTIFICATION_CATEGORIES.filter((c) => c.locked).map((c) => c.key)).toEqual(['system']);
  });

  it('exemples de rattachement', () => {
    expect(categoryOfType('MESSAGE')).toBe('messages');
    expect(categoryOfType('FORUM_REPLY')).toBe('forum');
    expect(categoryOfType('TORRENT_APPROVED')).toBe('torrents');
    expect(categoryOfType('REQUEST_FILLED')).toBe('requests');
    expect(categoryOfType('SUPPORT')).toBe('support');
    expect(categoryOfType('SYSTEM')).toBe('system');
  });
});
