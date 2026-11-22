import { DEFAULT_HOME_LAYOUT, normalizeHomeLayout } from './home-layout';

describe('normalizeHomeLayout', () => {
  it('rien ou n\'importe quoi : l\'accueil d\'origine', () => {
    expect(normalizeHomeLayout(undefined)).toEqual(DEFAULT_HOME_LAYOUT);
    expect(normalizeHomeLayout('x')).toEqual(DEFAULT_HOME_LAYOUT);
    expect(normalizeHomeLayout({ order: 'pas une liste' })).toEqual(DEFAULT_HOME_LAYOUT);
  });
  it('garde les choix valides', () => {
    const l = { order: ['news', 'stats'], hidden: ['rail'], collapsed: ['latest'], prevNews: false };
    expect(normalizeHomeLayout(l)).toEqual(l);
  });
  it('identifiants : minuscules, chiffres et tirets seulement, sans doublon, longueur bornée', () => {
    const l = normalizeHomeLayout({ hidden: ['rail', 'rail', 'Mauvais', '<script>', 5, 'a b', 'ok-1'], order: Array.from({ length: 200 }, (_, i) => `s${i}`) });
    expect(l.hidden).toEqual(['rail', 'ok-1']);
    expect(l.order).toHaveLength(60);
  });
});
