import { rankKeyOf } from './rank';

describe('rankKeyOf', () => {
  it('le rôle du staff passe avant la classe', () => {
    expect(rankKeyOf('ADMIN', 'VETERAN')).toBe('ADMIN');
    expect(rankKeyOf('MODERATOR', 'NOUVEAU')).toBe('MODERATOR');
  });
  it('Uploadeur passe avant la classe automatique', () => {
    expect(rankKeyOf('UPLOADER', 'ELITE')).toBe('UPLOADER');
  });
  it('un membre prend la couleur de sa classe (Power User, Élite, Vétéran)', () => {
    expect(rankKeyOf('USER', 'POWER_USER')).toBe('POWER_USER');
    expect(rankKeyOf('USER', 'VETERAN')).toBe('VETERAN');
  });
  it('Nouveau et Membre gardent la couleur ordinaire', () => {
    expect(rankKeyOf('USER', 'NOUVEAU')).toBeNull();
    expect(rankKeyOf('USER', 'MEMBRE')).toBeNull();
    expect(rankKeyOf(undefined, undefined)).toBeNull();
  });
});
