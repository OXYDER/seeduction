import { stripNul, stripNulOpt } from './strip-nul';

describe('stripNul', () => {
  it('retire les octets nuls et garde le reste', () => {
    expect(stripNul('Film\u0000.2024\u0000')).toBe('Film.2024');
    expect(stripNul('Déjà vu — ☃')).toBe('Déjà vu — ☃');
  });
  it('laisse passer les valeurs absentes', () => {
    expect(stripNulOpt(undefined)).toBeUndefined();
    expect(stripNulOpt(null)).toBeUndefined();
    expect(stripNulOpt('a\u0000b')).toBe('ab');
  });
});
