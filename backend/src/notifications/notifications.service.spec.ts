import { NotificationType } from '@prisma/client';
import { NOTIFICATION_CATEGORIES, categoryOfType, extractMentions } from './notifications.service';

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

describe('@mentions dans un texte', () => {
  it('trouve les pseudos, sans doublon ni casse', () => {
    expect(extractMentions('Salut @Alice et @bob.lee, encore @alice !')).toEqual(['Alice', 'bob.lee']);
  });
  it('ignore les courriels, les adresses, les citations et le code', () => {
    const t = 'écris à jean@exemple.com ou https://site.org/@carl [quote=Dan]@dan avait dit[/quote] [code]@zoe[/code] mais @eve oui';
    expect(extractMentions(t)).toEqual(['eve']);
  });
  it('accepte accents, soulignés et ponctuation finale, 10 au plus', () => {
    expect(extractMentions('Merci @Léa_92, @Émile.')).toEqual(['Léa_92', 'Émile']);
    expect(extractMentions(Array.from({ length: 15 }, (_, i) => `@membre${i}`).join(' ')).length).toBe(10);
  });
  it("un @ seul ou trop court n'est pas un pseudo", () => {
    expect(extractMentions('un @ seul, @a et @')).toEqual([]);
  });
});
