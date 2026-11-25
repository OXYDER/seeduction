import { mergeEpisodes, missingImages, parseTmdbSeason, parseTvdbEpisodes, parseTvmazeEpisodes } from './episode-info';

describe('fiches d\'épisodes', () => {
  it('lit une saison TMDB avec l\'image de l\'épisode', () => {
    const eps = parseTmdbSeason({ episodes: [
      { episode_number: 1, name: 'Pilote', overview: 'Début.', still_path: '/abc.jpg', air_date: '2025-01-05', runtime: 52 },
      { episode_number: 2, name: 'Suite', overview: '', still_path: null, air_date: null, runtime: null },
      { episode_number: 0, name: 'Spécial' },
    ] }, 1, 'https://image.tmdb.org/t/p/');
    expect(eps).toHaveLength(2);
    expect(eps[0]).toMatchObject({ season: 1, episode: 1, title: 'Pilote', imageUrl: 'https://image.tmdb.org/t/p/w500/abc.jpg', airDate: '2025-01-05', runtime: 52 });
    expect(eps[1]).toMatchObject({ episode: 2, imageUrl: null, overview: null, runtime: null });
    expect(parseTmdbSeason(null, 1, 'x')).toEqual([]);
  });

  it('lit les épisodes TVmaze (toutes saisons), image en https, résumé sans HTML', () => {
    const eps = parseTvmazeEpisodes([
      { season: 1, number: 1, name: 'A', summary: '<p>Un <b>résumé</b>.</p>', image: { medium: 'http://static.tvmaze.com/m.jpg', original: 'http://static.tvmaze.com/o.jpg' }, airdate: '2024-03-01', runtime: 45 },
      { season: 2, number: 3, name: 'B', summary: null, image: null, airdate: '', runtime: null },
      { season: 1, number: null, name: 'Spécial' },
    ]);
    expect(eps).toHaveLength(2);
    expect(eps[0]).toMatchObject({ season: 1, episode: 1, imageUrl: 'https://static.tvmaze.com/o.jpg', overview: 'Un résumé.', airDate: '2024-03-01' });
    expect(eps[1]).toMatchObject({ season: 2, episode: 3, imageUrl: null, airDate: null });
  });

  it('lit une saison TheTVDB', () => {
    const eps = parseTvdbEpisodes({ data: { episodes: [
      { seasonNumber: 1, number: 1, name: 'X', overview: 'o', image: 'https://artworks.thetvdb.com/x.jpg', aired: '2020-02-02', runtime: 30 },
      { seasonNumber: 2, number: 1, name: 'Autre saison' },
    ] } }, 1);
    expect(eps).toEqual([{ season: 1, episode: 1, title: 'X', overview: 'o', imageUrl: 'https://artworks.thetvdb.com/x.jpg', airDate: '2020-02-02', runtime: 30 }]);
  });

  it('complète TMDB avec le fournisseur suivant, épisode par épisode', () => {
    const tmdb = [
      { season: 1, episode: 1, title: 'Pilote', overview: null, imageUrl: null, airDate: '2025-01-05', runtime: null },
      { season: 1, episode: 2, title: 'Suite', overview: 'ok', imageUrl: 'https://tmdb/2.jpg', airDate: null, runtime: 50 },
    ];
    const tvm = [
      { season: 1, episode: 1, title: 'Autre titre', overview: 'Résumé', imageUrl: 'https://tvm/1.jpg', airDate: '2024-12-31', runtime: 52 },
      { season: 1, episode: 2, title: 'x', overview: 'x', imageUrl: 'https://tvm/2.jpg', airDate: '2025-01-12', runtime: 40 },
      { season: 1, episode: 3, title: 'Trois', overview: null, imageUrl: null, airDate: null, runtime: null },
    ];
    const out = mergeEpisodes(tmdb, tvm);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ title: 'Pilote', overview: 'Résumé', imageUrl: 'https://tvm/1.jpg', airDate: '2025-01-05', runtime: 52 });
    expect(out[1]).toMatchObject({ imageUrl: 'https://tmdb/2.jpg', airDate: '2025-01-12', runtime: 50 });
    expect(out[2]).toMatchObject({ episode: 3, title: 'Trois' });
  });

  it('sait s\'il manque des images', () => {
    expect(missingImages([])).toBe(true);
    expect(missingImages([{ season: 1, episode: 1, title: null, overview: null, imageUrl: 'https://a/b.jpg', airDate: null, runtime: null }])).toBe(false);
    expect(missingImages([{ season: 1, episode: 1, title: null, overview: null, imageUrl: null, airDate: null, runtime: null }])).toBe(true);
  });
});
