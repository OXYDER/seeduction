import { defaultName, describeQuery, sanitizeQuery } from './saved-search';

describe('alertes de recherche', () => {
  it('ne garde que les filtres connus et nettoie les valeurs', () => {
    expect(sanitizeQuery({ search: '  Dune ', year: '2021', resolution: '1080p', hdr: 'true', evil: 'x', page: '3', sort: 'date', 'f.genreFilm': 'Action| SF |', 'f.': 'x', 'f.a b': 'x' })).toEqual({
      search: 'Dune', year: '2021', resolution: '1080p', hdr: 'true', 'f.genreFilm': 'Action|SF',
    });
  });
  it('refuse une recherche vide ou sans critère utile', () => {
    expect(sanitizeQuery(null)).toBeNull();
    expect(sanitizeQuery([])).toBeNull();
    expect(sanitizeQuery({})).toBeNull();
    expect(sanitizeQuery({ search: 'a' })).toBeNull();
    expect(sanitizeQuery({ page: '2', sort: 'date' })).toBeNull();
    expect(sanitizeQuery({ hdr: 'false' })).toBeNull();
  });
  it('rejette les nombres invalides', () => {
    expect(sanitizeQuery({ year: 'deux mille', search: 'ok' })).toEqual({ search: 'ok' });
    expect(sanitizeQuery({ minSize: '1.5', maxSize: '-3' })).toEqual({ minSize: '1.5' });
  });
  it('limite la longueur et le nombre de valeurs', () => {
    const q = sanitizeQuery({ search: 'x'.repeat(500), 'f.a': Array.from({ length: 30 }, (_, i) => `v${i}`).join('|') })!;
    expect(q.search.length).toBe(200);
    expect(q['f.a'].split('|').length).toBe(12);
  });
  it('décrit l\'alerte en français', () => {
    expect(describeQuery({ search: 'Dune', year: '2021', resolution: '1080p', hdr: 'true' })).toBe('« Dune » · 2021 · 1080p · HDR');
    expect(describeQuery({ 'f.genreFilm': 'Action|SF', minSize: '2' })).toBe('≥ 2 Go · Action / SF');
    expect(defaultName({ search: 'Dune' })).toBe('Dune');
    expect(defaultName({ resolution: '4K/2160p' })).toBe('4K/2160p');
  });
});
