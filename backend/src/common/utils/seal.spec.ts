import { openText, sealText } from './seal';

describe('seal', () => {
  it('chiffre puis déchiffre, et le texte chiffré ne contient pas le secret', () => {
    const blob = sealText('mon mot de passe très secret', 'webmail');
    expect(blob).not.toContain('secret');
    expect(openText(blob, 'webmail')).toBe('mon mot de passe très secret');
  });
  it('deux chiffrements du même texte diffèrent (valeur aléatoire)', () => {
    expect(sealText('x', 'webmail')).not.toBe(sealText('x', 'webmail'));
  });
  it('un secret chiffré pour un usage ne se lit pas avec un autre usage, ni s\'il est altéré', () => {
    const blob = sealText('abc', 'webmail');
    expect(openText(blob, 'importer')).toBeNull();
    const raw = Buffer.from(blob, 'base64'); raw[raw.length - 1] ^= 1;
    expect(openText(raw.toString('base64'), 'webmail')).toBeNull();
    expect(openText('', 'webmail')).toBeNull();
  });
});
