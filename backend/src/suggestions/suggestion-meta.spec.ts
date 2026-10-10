import { ACTIVE_STATUSES, CLOSED_STATUSES, isCategory, isStatus, keywordsOf, progressToThreshold, similarityScore, statusLabel } from './suggestion-meta';

describe('suggestions : règles pures', () => {
  it('catégories et statuts valides seulement', () => {
    expect(isCategory('CHAT')).toBe(true);
    expect(isCategory('chat')).toBe(false);
    expect(isStatus('PLANNED')).toBe(true);
    expect(isStatus('WHATEVER')).toBe(false);
    expect(statusLabel('REVIEW')).toBe("À l'étude");
    expect(ACTIVE_STATUSES).not.toContain('DONE');
    expect(CLOSED_STATUSES).toEqual(['DECLINED', 'DUPLICATE']);
  });

  it('mots significatifs : sans accents, sans mots vides, sans doublons', () => {
    expect(keywordsOf('Ajouter un mode sombre pour le lecteur vidéo, le mode sombre')).toEqual(['mode', 'sombre', 'lecteur', 'video']);
    expect(keywordsOf('')).toEqual([]);
    expect(keywordsOf('a b c')).toEqual([]);
  });

  it('ressemblance : le titre compte double', () => {
    const words = keywordsOf('mode sombre lecteur');
    const a = similarityScore(words, { title: 'Mode sombre du lecteur', body: '' });
    const b = similarityScore(words, { title: 'Autre chose', body: 'un mode sombre pour le lecteur' });
    const c = similarityScore(words, { title: 'Rien à voir', body: 'ratio et bonus' });
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
    expect(c).toBe(0);
  });

  it('progression vers le seuil, bornée à 100', () => {
    expect(progressToThreshold(5, 10)).toBe(50);
    expect(progressToThreshold(25, 10)).toBe(100);
    expect(progressToThreshold(-1, 10)).toBe(0);
    expect(progressToThreshold(3, 0)).toBe(100);
  });
});
