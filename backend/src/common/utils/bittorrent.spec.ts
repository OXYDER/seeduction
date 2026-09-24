import { percentDecodedToHex } from './bittorrent';

describe('percentDecodedToHex', () => {
  it('décode des octets binaires encodés en %XX (l\'info_hash)', () => {
    expect(percentDecodedToHex('%12%34%56')).toBe('123456');
  });

  it('gère les octets non UTF-8 sans lever « URI malformed »', () => {
    expect(() => percentDecodedToHex('%FF%FE%80')).not.toThrow();
    expect(percentDecodedToHex('%FF%FE%80')).toBe('fffe80');
  });

  it('mélange caractères ASCII et octets encodés', () => {
    expect(percentDecodedToHex('a%FFb')).toBe('61ff62');
  });

  it('traite « + » comme une espace et laisse une séquence invalide telle quelle', () => {
    expect(percentDecodedToHex('+')).toBe('20');
    expect(percentDecodedToHex('%zz')).toBe('257a7a');
  });
});
