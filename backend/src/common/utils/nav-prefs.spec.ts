import { DEFAULT_NAV_PREFS, normalizeNavPrefs } from './nav-prefs';

describe('normalizeNavPrefs', () => {
  it('rien ou n\'importe quoi : les valeurs par défaut (menu classique, gros liens)', () => {
    expect(normalizeNavPrefs(undefined)).toEqual(DEFAULT_NAV_PREFS);
    expect(normalizeNavPrefs('x')).toEqual(DEFAULT_NAV_PREFS);
    expect(normalizeNavPrefs({ style: 'autre', size: 'énorme' })).toEqual(DEFAULT_NAV_PREFS);
    expect(DEFAULT_NAV_PREFS.style).toBe('classic');
  });

  it('garde les choix valides', () => {
    const p = normalizeNavPrefs({ style: 'groups', size: 'xl', icons: false, extras: true, categories: false, openAll: true, hidden: ['/dead'], order: ['/chat', '/'] });
    expect(p).toEqual({ style: 'groups', size: 'xl', icons: false, extras: true, categories: false, openAll: true, hidden: ['/dead'], order: ['/chat', '/'] });
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
