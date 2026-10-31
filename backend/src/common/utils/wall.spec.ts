import { canSeeWallPost, cleanWallImage, cleanWallLink, isWallReaction } from './wall';

const nobody = { isAuthor: false, isFriend: false, isTeamMember: false, isStaff: false };

describe('Le Mur : qui voit une publication', () => {
  it('profil : MEMBERS pour tous, FRIENDS pour les amis, ME pour l\u2019auteur seul', () => {
    const post = (visibility: string) => ({ visibility, teamId: null });
    expect(canSeeWallPost(post('MEMBERS'), nobody)).toBe(true);
    expect(canSeeWallPost(post('FRIENDS'), nobody)).toBe(false);
    expect(canSeeWallPost(post('FRIENDS'), { ...nobody, isFriend: true })).toBe(true);
    expect(canSeeWallPost(post('ME'), { ...nobody, isFriend: true })).toBe(false);
    expect(canSeeWallPost(post('ME'), { ...nobody, isAuthor: true })).toBe(true);
    expect(canSeeWallPost(post('ME'), { ...nobody, isStaff: true })).toBe(true);
  });
  it('team : TEAM r\u00e9serv\u00e9e aux membres de la team, MEMBERS pour tout le site', () => {
    const post = (visibility: string) => ({ visibility, teamId: 't1' });
    expect(canSeeWallPost(post('TEAM'), nobody)).toBe(false);
    expect(canSeeWallPost(post('TEAM'), { ...nobody, isTeamMember: true })).toBe(true);
    expect(canSeeWallPost(post('MEMBERS'), nobody)).toBe(true);
    expect(canSeeWallPost(post('FRIENDS'), { ...nobody, isFriend: true })).toBe(false);
  });
});

describe('Le Mur : liens, images, r\u00e9actions', () => {
  it('accepte les liens http(s) et refuse le reste', () => {
    expect(cleanWallLink('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(cleanWallLink('javascript:alert(1)')).toBeNull();
    expect(cleanWallLink('https://user:pw@example.com')).toBeNull();
    expect(cleanWallLink('https://exemple')).toBeNull();
    expect(cleanWallLink('https://a.com/ b')).toBeNull();
    expect(cleanWallLink('')).toBeNull();
  });
  it('n\u2019accepte que les images h\u00e9berg\u00e9es sur le site', () => {
    expect(cleanWallImage('/api/covers/abc123.jpg')).toBe('/api/covers/abc123.jpg');
    expect(cleanWallImage('https://autre.site/x.jpg')).toBeNull();
  });
  it('limite les r\u00e9actions \u00e0 la liste', () => {
    expect(isWallReaction('\u{1F44D}')).toBe(true);
    expect(isWallReaction('x')).toBe(false);
  });
});
