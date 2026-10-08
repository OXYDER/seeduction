import { releaseDateOf } from './release-date';

describe('date de sortie', () => {
  it('film, jeu, album, livre : la date de la fiche', () => {
    expect(releaseDateOf({ kind: 'movie', releaseDate: '2025-12-31' })).toBe('2025-12-31');
    expect(releaseDateOf({ released: '2023-05-04' })).toBe('2023-05-04');
    expect(releaseDateOf({ publishedDate: '2019' })).toBe('2019');
    expect(releaseDateOf({ kind: 'movie', releaseDate: '' })).toBeNull();
    expect(releaseDateOf(null)).toBeNull();
  });

  it("épisode de série : la date de diffusion de l'épisode, avant celle de la saison ou de la série", () => {
    const info = { kind: 'tv', releaseDate: '1999-01-31', seasonList: [{ number: 17, airDate: '2025-09-02' }] };
    expect(releaseDateOf(info, '17', '2026-10-01')).toBe('2026-10-01');
    expect(releaseDateOf(info, '17', null)).toBe('2025-09-02'); // saison complète ou épisode inconnu
    expect(releaseDateOf(info, '3', null)).toBe('1999-01-31'); // saison inconnue : première diffusion
    expect(releaseDateOf(info, null, null)).toBe('1999-01-31');
  });
});
