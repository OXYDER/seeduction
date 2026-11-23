import {
  gal, isExtraId, mapCoverArtImages, mapJikanPictures, mapTvmazeImages, mapFlathubApp, mapFlathubSearch, mapItunesAlbum, mapItunesAlbums, mapItunesApp, mapJikanAnime, mapJikanSearch, mapMusicbrainzGroup, mapMusicbrainzSearch, mapSteamApp, mapSteamSearch,
  mapTvmazeShow, mapTvmazeSearch, mapWikipediaSearch, mapWikipediaSummary, mergeResults, richExtra, searchExtra, stripHtml,
  youtubeTrailer, steamTrailer,
} from './extra-providers';

describe('identifiants des fournisseurs en arrière-plan', () => {
  it('les identifiants à préfixe sont reconnus, ceux du fournisseur principal non', () => {
    for (const id of ['tvm:1', 'mal:5', 'itu:9', 'mb:abc', 'steam:620', 'flat:org.x.App', 'wp:fr:Firefox']) expect(isExtraId(id)).toBe(true);
    for (const id of ['603', 'ol:OL123W', 'studio:abc', 'scene:1']) expect(isExtraId(id)).toBe(false);
  });
});

describe('TVmaze (séries)', () => {
  it('résultats et fiche', () => {
    const res = mapTvmazeSearch([{ show: { id: 82, name: 'Game of Thrones', premiered: '2011-04-17', network: { name: 'HBO' }, genres: ['Drama', 'Fantasy'], image: { medium: 'http://img/m.jpg' } } }, { show: null }]);
    expect(res).toEqual([{ id: 'tvm:82', title: 'Game of Thrones', subtitle: '2011 · HBO · Drama, Fantasy', thumbnail: 'http://img/m.jpg' }]);
    const rich = mapTvmazeShow({ id: 82, name: 'Game of Thrones', premiered: '2011-04-17', summary: '<p>Neuf familles <b>nobles</b>.</p>', genres: ['Drama'], rating: { average: 8.9 }, network: { name: 'HBO' }, averageRuntime: 60, image: { original: 'http://img/o.jpg' }, _embedded: { cast: [{ person: { id: 7, name: 'Emilia Clarke' }, character: { name: 'Daenerys' } }] } });
    expect(rich.source).toBe('tvmaze');
    expect(rich.variables).toMatchObject({ titre: 'Game of Thrones', année: '2011', description: 'Neuf familles nobles.', note: '8,9 / 10', durée: '60 min', acteurs: 'Emilia Clarke', studio: 'HBO' });
    expect(rich.entities.some((e) => e.type === 'PERSON' && e.detail === 'Daenerys')).toBe(true);
    expect(rich.coverUrl).toBe('http://img/o.jpg');
  });
});

describe('Jikan (animés)', () => {
  it('sépare séries et films', () => {
    const data = { data: [{ mal_id: 1, title: 'Cowboy Bebop', title_english: 'Cowboy Bebop', type: 'TV', aired: { from: '1998-04-03T00:00:00+00:00' }, images: { jpg: { image_url: 'u' } } }, { mal_id: 5, title: 'Cowboy Bebop: Tengoku no Tobira', title_english: 'Cowboy Bebop: The Movie', type: 'Movie', aired: { from: '2001-09-01T00:00:00+00:00' } }] };
    expect(mapJikanSearch(data, 'SERIE').map((r) => r.id)).toEqual(['mal:1']);
    expect(mapJikanSearch(data, 'FILM').map((r) => r.id)).toEqual(['mal:5']);
    const rich = mapJikanAnime({ data: { mal_id: 1, title: 'Cowboy Bebop', title_english: 'Cowboy Bebop', type: 'TV', synopsis: 'En 2071... [Written by MAL Rewrite]', score: 8.75, duration: '24 min per ep', aired: { from: '1998-04-03T00:00:00+00:00' }, genres: [{ name: 'Action' }], themes: [{ name: 'Space' }], studios: [{ mal_id: 14, name: 'Sunrise' }], images: { jpg: { large_image_url: 'big' } } } });
    expect(rich.variables).toMatchObject({ titre: 'Cowboy Bebop', année: '1998', durée: '24 min', note: '8,75 / 10', studio: 'Sunrise', genre: 'Action, Space', description: 'En 2071...' });
    expect(rich.coverUrl).toBe('big');
  });
});

describe('Steam (jeux)', () => {
  it('résultats et fiche', () => {
    expect(mapSteamSearch({ items: [{ id: 620, name: 'Portal 2', type: 'app', tiny_image: 't', price: { final: 1099 }, platforms: { windows: true } }, { id: 9, name: 'Bande son', type: 'music' }] }))
      .toEqual([{ id: 'steam:620', title: 'Portal 2', subtitle: '10,99 $ · Windows', thumbnail: 't' }]);
    const rich = mapSteamApp({ '620': { success: true, data: { name: 'Portal 2', release_date: { date: '18 avr. 2011' }, genres: [{ description: 'Action' }], developers: ['Valve'], publishers: ['Valve'], platforms: { windows: true, mac: true, linux: true }, metacritic: { score: 95 }, short_description: 'Le <b>retour</b>.', header_image: 'h' } } }, '620');
    expect(rich.variables).toMatchObject({ titre: 'Portal 2', année: '2011', genre: 'Action', développeur: 'Valve', plateformes: 'Windows, macOS, Linux', note: '95 / 100 (Metacritic)', description: 'Le retour.' });
    expect(rich.coverUrl).toBe('h');
  });
});

describe('iTunes et MusicBrainz (musique)', () => {
  it('albums iTunes', () => {
    expect(mapItunesAlbums({ results: [{ collectionId: 11, collectionName: 'Thriller', artistName: 'Michael Jackson', releaseDate: '1982-11-30T08:00:00Z', artworkUrl100: 'a/100x100bb.jpg' }] }))
      .toEqual([{ id: 'itu:11', title: 'Thriller', subtitle: 'Michael Jackson · 1982', thumbnail: 'a/100x100bb.jpg' }]);
    const rich = mapItunesAlbum({ results: [{ wrapperType: 'collection', collectionId: 11, collectionName: 'Thriller', artistName: 'Michael Jackson', releaseDate: '1982-11-30T08:00:00Z', primaryGenreName: 'Pop', copyright: '℗ 1982 Epic', trackCount: 2, artworkUrl100: 'https://x/100x100bb.jpg' }, { wrapperType: 'track', trackName: 'Beat It', trackNumber: 2, trackTimeMillis: 258000 }, { wrapperType: 'track', trackName: 'Wanna Be Startin\' Somethin\'', trackNumber: 1, trackTimeMillis: 363000 }] });
    expect(rich.variables).toMatchObject({ titre: 'Thriller', artiste: 'Michael Jackson', année: '1982', genre: 'Pop', label: 'Epic', durée: '10 min', fichiers: "Wanna Be Startin' Somethin', Beat It" });
    expect(rich.coverUrl).toBe('https://x/1000x1000bb.jpg');
  });
  it('MusicBrainz', () => {
    const res = mapMusicbrainzSearch({ 'release-groups': [{ id: 'abc', title: 'OK Computer', 'primary-type': 'Album', 'first-release-date': '1997-05-21', 'artist-credit': [{ name: 'Radiohead' }] }, { id: 'z', title: 'Live', 'primary-type': 'Broadcast' }] });
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ id: 'mb:abc', title: 'OK Computer', subtitle: 'Radiohead · 1997 · Album' });
    const rich = mapMusicbrainzGroup({ id: 'abc', title: 'OK Computer', 'first-release-date': '1997-05-21', 'primary-type': 'Album', 'artist-credit': [{ name: 'Radiohead', artist: { id: 'r1' } }], tags: [{ name: 'rock', count: 9 }, { name: 'alt', count: 3 }] });
    expect(rich.variables).toMatchObject({ titre: 'OK Computer', artiste: 'Radiohead', année: '1997', genre: 'rock, alt' });
    expect(rich.coverUrl).toBe('https://coverartarchive.org/release-group/abc/front-500');
  });
});

describe('logiciels et applications', () => {
  it('iTunes, Flathub et Wikipédia', () => {
    const app = mapItunesApp({ results: [{ trackId: 1, trackName: 'Notes', sellerName: 'Acme', genres: ['Productivité'], releaseDate: '2020-01-02T00:00:00Z', supportedDevices: ['iPhone12'], averageUserRating: 4.66, artworkUrl512: 'icon', description: 'Prends des notes.' }] });
    expect(app.variables).toMatchObject({ titre: 'Notes', développeur: 'Acme', genre: 'Productivité', année: '2020', plateformes: 'iOS', note: '4,7 / 5' });
    expect(mapFlathubSearch({ hits: [{ app_id: 'org.mozilla.firefox', name: 'Firefox', summary: 'Navigateur', icon: 'i' }] })[0]).toEqual({ id: 'flat:org.mozilla.firefox', title: 'Firefox', subtitle: 'Navigateur', thumbnail: 'i' });
    const wp = mapWikipediaSearch({ pages: [{ key: 'Firefox', title: 'Firefox', description: 'navigateur web libre', thumbnail: { url: '//upload/x.png' } }] }, 'fr');
    expect(mapWikipediaSearch({ pages: [{ key: 'Portal_(jeu_vidéo)', title: 'Portal', description: 'jeu vidéo de 2007' }, { key: 'Portail', title: 'Portail', description: "page d'homonymie" }] }, 'fr', /jeu vid/i).map((r) => r.id)).toEqual(['wp:fr:Portal_(jeu_vidéo)']);
    expect(wp[0]).toEqual({ id: 'wp:fr:Firefox', title: 'Firefox', subtitle: 'navigateur web libre', thumbnail: 'https://upload/x.png' });
    const sum = mapWikipediaSummary({ title: 'Firefox', description: 'navigateur web libre', extract: 'Mozilla Firefox est un navigateur web libre lancé en 2004.', thumbnail: { source: 'th' }, originalimage: { source: 'og' }, lang: 'fr' }, 'LOGICIEL');
    expect(sum.variables).toMatchObject({ titre: 'Firefox', année: '2004' });
    expect(sum.coverUrl).toBe('og');
    expect(sum.overviewOk).toBe(true);
  });
});

describe('fusion et orchestration', () => {
  it('le fournisseur principal d\'abord, sans doublon de titre', () => {
    const merged = mergeResults(
      [{ id: '1', title: 'Portal 2', subtitle: '2011', thumbnail: null }],
      [{ id: 'steam:620', title: 'Portal 2', subtitle: '10 $', thumbnail: null }, { id: 'steam:7', title: 'Portal', subtitle: '', thumbnail: null }],
    );
    expect(merged.map((r) => r.id)).toEqual(['1', 'steam:7']);
  });
  it('deux années différentes pour le même titre restent distinctes', () => {
    const merged = mergeResults([{ id: 'a', title: 'Dune', subtitle: '1984', thumbnail: null }], [{ id: 'b', title: 'Dune', subtitle: '2021 · Film', thumbnail: null }]);
    expect(merged.map((r) => r.id)).toEqual(['a', 'b']);
  });
  it('un fournisseur en panne est ignoré', async () => {
    const calls: string[] = [];
    const fake = async (url: string) => {
      calls.push(url);
      if (url.includes('tvmaze')) return [{ show: { id: 1, name: 'Lost', premiered: '2004-09-22' } }];
      throw new Error('panne');
    };
    const res = await searchExtra('SERIE', 'Lost', fake);
    expect(res.map((r) => r.id)).toEqual(['tvm:1']);
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });
  it('les logiciels interrogent plusieurs fournisseurs ; un type sans fournisseur supplémentaire renvoie une liste vide', async () => {
    const urls: string[] = [];
    await searchExtra('LOGICIEL', 'firefox', async (u) => { urls.push(u); return {}; });
    expect(urls.some((u) => u.includes('itunes') && u.includes('entity=software'))).toBe(true);
    expect(urls.some((u) => u.includes('flathub'))).toBe(true);
    expect(urls.some((u) => u.includes('wikipedia'))).toBe(true);
    expect(await searchExtra('XXX', 'x', async () => ({}))).toEqual([]);
  });
  it('la fiche d\'un identifiant à préfixe passe par le bon fournisseur', async () => {
    const seen: string[] = [];
    const fake = async (u: string) => { seen.push(u); return { id: 5, name: 'X' }; };
    const rich = await richExtra('SERIE', 'tvm:5', fake);
    expect(rich.source).toBe('tvmaze');
    expect(seen[0]).toBe('https://api.tvmaze.com/shows/5?embed=cast');
    await expect(richExtra('JEU', 'inconnu:1', fake)).rejects.toThrow();
    await expect(richExtra('LOGICIEL', 'wp:de:X', fake)).rejects.toThrow(/Langue/);
  });
  it('stripHtml', () => { expect(stripHtml('<p>A &amp; B</p><p>C</p>')).toBe('A & B\n\nC'); });
});

describe("galeries d'images", () => {
  it('gal : adresses valides, sans doublon, https, limitées', () => {
    expect(gal(['http://a/x.jpg', 'https://a/x.jpg', 'pas une url', null, 'https://b/y.jpg'])).toEqual(['https://a/x.jpg', 'https://b/y.jpg']);
    expect(gal(Array.from({ length: 30 }, (_, i) => `https://a/${i}.jpg`))).toHaveLength(10);
  });
  it('TVmaze : fonds, bannières puis affiches secondaires', () => {
    const rows = [
      { type: 'poster', main: true, resolutions: { original: { url: 'https://t/poster-main.jpg' } } },
      { type: 'poster', main: false, resolutions: { original: { url: 'https://t/poster2.jpg' } } },
      { type: 'background', resolutions: { original: { url: 'https://t/bg.jpg' } } },
      { type: 'banner', resolutions: { medium: { url: 'https://t/banner.jpg' } } },
    ];
    expect(mapTvmazeImages(rows)).toEqual(['https://t/bg.jpg', 'https://t/banner.jpg', 'https://t/poster2.jpg']);
    expect(mapTvmazeImages(null)).toEqual([]);
  });
  it('Jikan : saute la première image (la pochette)', () => {
    expect(mapJikanPictures({ data: [{ jpg: { large_image_url: 'https://j/0.jpg' } }, { jpg: { large_image_url: 'https://j/1.jpg' } }, { jpg: { image_url: 'https://j/2.jpg' } }] })).toEqual(['https://j/1.jpg', 'https://j/2.jpg']);
  });
  it('Cover Art Archive : jaquette arrière et livret, pas la face avant', () => {
    const res = { images: [{ front: true, image: 'http://c/front.jpg' }, { front: false, image: 'http://c/back.jpg', thumbnails: { large: 'http://c/back-l.jpg' } }, { front: false, image: 'http://c/book.jpg', thumbnails: { '1200': 'http://c/book-1200.jpg' } }] };
    expect(mapCoverArtImages(res)).toEqual(['https://c/back-l.jpg', 'https://c/book-1200.jpg']);
  });
  it("Steam, iTunes et Flathub : captures d'écran", () => {
    expect(mapSteamApp({ '1': { data: { name: 'X', screenshots: [{ path_full: 'https://s/1.jpg' }, { path_thumbnail: 'https://s/2.jpg' }] } } }, '1').gallery).toEqual(['https://s/1.jpg', 'https://s/2.jpg']);
    expect(mapItunesApp({ results: [{ trackName: 'App', screenshotUrls: ['https://i/1.png'], ipadScreenshotUrls: ['https://i/2.png'] }] }).gallery).toEqual(['https://i/1.png', 'https://i/2.png']);
    expect(mapFlathubApp({ name: 'F', screenshots: [{ sizes: [{ src: 'https://f/small.png', width: '224' }, { src: 'https://f/big.png', width: '1280' }] }] }, 'f').gallery).toEqual(['https://f/big.png']);
  });
  it('un fournisseur sans images en second appel donne une galerie vide, sans erreur', async () => {
    const fake = async (url: string) => { if (/\/images$/.test(url)) throw new Error('404'); return { id: 1, name: 'S', genres: [], _embedded: { cast: [] } }; };
    expect((await richExtra('SERIE', 'tvm:1', fake as any)).gallery).toEqual([]);
  });
});

describe('bandes-annonces', () => {
  it('YouTube : identifiant valide seulement', () => {
    expect(youtubeTrailer('dQw4w9WgXcQ')).toEqual({ site: 'YouTube', key: 'dQw4w9WgXcQ', name: 'Bande-annonce' });
    expect(youtubeTrailer('trop court')).toBeNull();
    expect(youtubeTrailer('<script>alert(1)</script>')).toBeNull();
    expect(youtubeTrailer(null)).toBeNull();
  });
  it('Steam : MP4 480p de préférence, adresses du réseau de Steam seulement', () => {
    const t = steamTrailer([{ name: 'Lancement', thumbnail: 'https://shared.akamai.steamstatic.com/a.jpg', mp4: { 480: 'https://video.akamai.steamstatic.com/a_480.mp4', max: 'https://video.akamai.steamstatic.com/a_max.mp4' } }]);
    expect(t).toEqual({ site: 'Steam', url: 'https://video.akamai.steamstatic.com/a_480.mp4', poster: 'https://shared.akamai.steamstatic.com/a.jpg', name: 'Lancement' });
    expect(steamTrailer([{ mp4: { 480: 'https://evil.example.com/x.mp4' } }])).toBeNull();
    expect(steamTrailer([{ mp4: { 480: 'http://video.akamai.steamstatic.com/x.mp4' } }])).toBeNull();
    expect(steamTrailer(undefined)).toBeNull();
  });
});
