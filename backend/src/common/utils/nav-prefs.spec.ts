import { DEFAULT_NAV_PREFS, normalizeNavPrefs } from './nav-prefs';

describe('normalizeNavPrefs', () => {
  it('rien ou n\'importe quoi : les valeurs par défaut (barre du haut, gros liens)', () => {
    expect(normalizeNavPrefs(undefined)).toEqual(DEFAULT_NAV_PREFS);
    expect(normalizeNavPrefs('x')).toEqual(DEFAULT_NAV_PREFS);
    expect(normalizeNavPrefs({ style: 'autre', size: 'énorme' })).toEqual(DEFAULT_NAV_PREFS);
    expect(DEFAULT_NAV_PREFS.style).toBe('top');
  });

  it('garde les choix valides', () => {
    const p = normalizeNavPrefs({ style: 'groups', size: 'xl', icons: false, extras: true, categories: false, openAll: true, hidden: ['/dead'], order: ['/chat', '/'] });
    expect(p).toEqual({ style: 'groups', side: 'left', pinned: [], width: 0, spacing: 'normal', size: 'xl', icons: false, extras: true, categories: false, openAll: true, hidden: ['/dead'], order: ['/chat', '/'] });
  });

  it('les cinq styles, le côté et les liens épinglés', () => {
    for (const style of ['classic', 'groups', 'pinned', 'rail', 'top']) expect(normalizeNavPrefs({ style }).style).toBe(style);
    expect(normalizeNavPrefs({ style: 'tuiles' }).style).toBe('top');
    expect(normalizeNavPrefs({ side: 'right' }).side).toBe('right');
    expect(normalizeNavPrefs({ side: 'haut' }).side).toBe('left');
    expect(normalizeNavPrefs({ pinned: ['/chat', '/chat', 'javascript:x', '/forum'] }).pinned).toEqual(['/chat', '/forum']);
  });

  it('largeur (bornée, 0 = automatique) et espacement des liens', () => {
    expect(normalizeNavPrefs({ width: 300 }).width).toBe(300);
    expect(normalizeNavPrefs({ width: 50 }).width).toBe(200);
    expect(normalizeNavPrefs({ width: 9999 }).width).toBe(420);
    expect(normalizeNavPrefs({ width: 0 }).width).toBe(0);
    expect(normalizeNavPrefs({ width: 'large' }).width).toBe(0);
    expect(normalizeNavPrefs({ width: NaN }).width).toBe(0);
    for (const spacing of ['normal', 'lines', 'airy']) expect(normalizeNavPrefs({ spacing }).spacing).toBe(spacing);
    expect(normalizeNavPrefs({ spacing: 'serré' }).spacing).toBe('normal');
  });

  it('« automatique » (null) pour les liens supplémentaires et les catégories tant que rien n\'est choisi', () => {
    expect(normalizeNavPrefs({ extras: 'oui' }).extras).toBeNull();
    expect(normalizeNavPrefs({}).categories).toBeNull();
  });

  it('listes : adresses du site seulement, sans doublon, longueur bornée', () => {
    const p = normalizeNavPrefs({ hidden: ['/a', '/a', 'http://evil.example', 5, '/b'], order: Array.from({ length: 300 }, (_, i) => `/p${i}`) });
    expect(p.hidden).toEqual(['/a', '/b']);
    expect(p.order).toHaveLength(120);
    expect(normalizeNavPrefs({ hidden: 'pas une liste' }).hidden).toEqual([]);
  });
});
