import { capsXml, errorXml, feedXml, parseTorznabQuery, requestedTops, searchTokens, torznabCategoriesFor, torznabTopOf, xmlEscape } from './torznab-core';

describe('Torznab : catégories', () => {
  it('rattache chaque catégorie du site à la bonne catégorie principale', () => {
    expect(torznabTopOf(['Films & Vidéos', 'Films'])).toBe(2000);
    expect(torznabTopOf(['Films & Vidéos', 'Animation'])).toBe(2000);
    expect(torznabTopOf(['Films & Vidéos', 'Séries TV'])).toBe(5000);
    expect(torznabTopOf(['Films & Vidéos', 'Émission TV'])).toBe(5000);
    expect(torznabTopOf(['Animes', 'Animes VOSTFR'])).toBe(5000);
    expect(torznabTopOf(['Audio', 'Musique'])).toBe(3000);
    expect(torznabTopOf(['Ebook', 'Livres'])).toBe(7000);
    expect(torznabTopOf(['Jeux Vidéo', 'Jeux PC'])).toBe(4000);
    expect(torznabTopOf(['Jeux Vidéo', 'Jeux Switch'])).toBe(1000);
    expect(torznabTopOf(['Applications', 'Logiciels Windows'])).toBe(4000);
    expect(torznabTopOf(['XXX', 'XXX Films'])).toBe(6000);
    expect(torznabTopOf(['Divers'])).toBe(8000);
  });

  it('un torrent avec une saison est de la télé même dans une catégorie vague', () => {
    expect(torznabTopOf(['Divers'], true)).toBe(5000);
  });

  it('précise la définition : HD / UHD / SD (sous-catégorie d\'abord, principale ensuite)', () => {
    expect(torznabCategoriesFor({ path: ['Films & Vidéos', 'Films'], resolution: '1080p' })).toEqual([2040, 2000]);
    expect(torznabCategoriesFor({ path: ['Films & Vidéos', 'Films'], resolution: '4K/2160p' })).toEqual([2045, 2000]);
    expect(torznabCategoriesFor({ path: ['Films & Vidéos', 'Films'], resolution: '480p' })).toEqual([2030, 2000]);
    expect(torznabCategoriesFor({ path: ['Films & Vidéos', 'Séries TV'], resolution: '720p', season: '1' })).toEqual([5040, 5000]);
    expect(torznabCategoriesFor({ path: ['Animes', 'Animes VOSTFR'], resolution: '1080p' })).toEqual([5070, 5000]);
    expect(torznabCategoriesFor({ path: ['Films & Vidéos', 'Films'] })).toEqual([2000]);
  });

  it('musique : sans perte ou MP3 ; livres : ebook ou bande dessinée', () => {
    expect(torznabCategoriesFor({ path: ['Audio', 'Musique'], audio: 'FLAC' })[0]).toBe(3040);
    expect(torznabCategoriesFor({ path: ['Audio', 'Musique'], audio: 'MP3' })[0]).toBe(3010);
    expect(torznabCategoriesFor({ path: ['Ebook', 'Livres'] })[0]).toBe(7020);
    expect(torznabCategoriesFor({ path: ['Ebook', 'Bandes dessinées'] })[0]).toBe(7030);
  });

  it('les catégories demandées se ramènent aux catégories principales', () => {
    expect(requestedTops('5000,5040,5045,2000')).toEqual([5000, 2000]);
    expect(requestedTops('2040')).toEqual([2000]);
    expect(requestedTops('abc,99,12000')).toEqual([]);
    expect(requestedTops(undefined)).toEqual([]);
  });
});

describe('Torznab : lecture de la requête', () => {
  it('lit les paramètres usuels de Sonarr / Radarr / Lidarr / Readarr', () => {
    const q = parseTorznabQuery({ t: 'tvsearch', q: 'Mon Super Show', season: '2', ep: '5', cat: '5030,5040', limit: '100', offset: '50' });
    expect(q).toMatchObject({ t: 'tvsearch', q: 'Mon Super Show', season: 2, ep: 5, tops: [5000], limit: 100, offset: 50 });
    expect(q.tokens).toEqual(['mon', 'super', 'show']);
    expect(parseTorznabQuery({ t: 'music', artist: 'Daft Punk', album: 'Discovery' }).q).toBe('Daft Punk Discovery');
    expect(parseTorznabQuery({ t: 'book', author: 'Tolkien', title: 'Le Hobbit' }).tokens).toEqual(['tolkien', 'le', 'hobbit']);
    expect(parseTorznabQuery({ t: 'movie', q: 'Dune', year: '2021', tmdbid: '438631' })).toMatchObject({ year: 2021, tmdbid: '438631' });
  });

  it('borne la limite et ignore les valeurs absurdes', () => {
    expect(parseTorznabQuery({ limit: '5000' }).limit).toBe(100);
    expect(parseTorznabQuery({ limit: '0' }).limit).toBe(1);
    expect(parseTorznabQuery({}).limit).toBe(50);
    expect(parseTorznabQuery({ offset: '-3', season: 'x', tmdbid: "1' OR 1=1" })).toMatchObject({ offset: 0, season: undefined, tmdbid: undefined });
  });

  it('filtres propres au site pour un flux précis', () => {
    expect(parseTorznabQuery({ language: 'VFQ', resolution: '1080p', freeleech: '1', minseeders: '3', sort: 'seeders' })).toMatchObject({ language: 'VFQ', resolution: '1080p', freeleech: true, minseeders: 3, sort: 'seeders' });
    expect(parseTorznabQuery({ sort: 'n_importe_quoi' }).sort).toBe('date');
  });

  it('mots de recherche : sans accents ni ponctuation (« Amélie Poulain » retrouve Amelie.Poulain)', () => {
    expect(searchTokens('Amélie Poulain 2001')).toEqual(['amelie', 'poulain', '2001']);
    expect(searchTokens("L'Été - X")).toEqual(['ete']);
  });
});

describe('Torznab : XML', () => {
  it('échappe les caractères spéciaux et retire les caractères de contrôle', () => {
    expect(xmlEscape('A & B <c> "d" \'e\'\u0001')).toBe('A &amp; B &lt;c&gt; &quot;d&quot; &apos;e&apos;');
  });

  it('caps : fonctions de recherche et catégories standard', () => {
    const x = capsXml('https://seeduction.exemple');
    expect(x).toContain('<tv-search available="yes" supportedParams="q,season,ep,tmdbid"/>');
    expect(x).toContain('<category id="5000" name="TV">');
    expect(x).toContain('<subcat id="2045" name="Movies/UHD"/>');
    expect(x).toContain('<book-search available="yes"');
    expect(x).toContain('url="https://seeduction.exemple"');
  });

  it('erreur Torznab', () => {
    expect(errorXml(100, 'Clé "invalide"')).toContain('<error code="100" description="Clé &quot;invalide&quot;"/>');
  });

  it('flux : un item avec lien de téléchargement, catégories et attributs torznab', () => {
    const x = feedXml('https://s.exemple', [{
      id: 'abc', name: 'Film & Co.2025.1080p', createdAt: new Date('2025-01-02T03:04:05Z'), size: 1500, seeders: 4, leechers: 2, completed: 9, infoHash: 'f'.repeat(40),
      categories: [2040, 2000], downloadUrl: 'https://s.exemple/api/torznab/download/abc?apikey=K', detailUrl: 'https://s.exemple/torrents/abc', tmdbId: '123', freeleech: true, doubleUpload: false,
    }], { total: 1, offset: 0, minSeedSeconds: 172800, minRatio: 1 });
    expect(x).toContain('xmlns:torznab="http://torznab.com/schemas/2015/feed"');
    expect(x).toContain('<torznab:response offset="0" total="1"/>');
    expect(x).toContain('<title>Film &amp; Co.2025.1080p</title>');
    expect(x).toContain('<enclosure url="https://s.exemple/api/torznab/download/abc?apikey=K" length="1500" type="application/x-bittorrent"/>');
    expect(x).toContain('<torznab:attr name="category" value="2040"/>');
    expect(x).toContain('<torznab:attr name="category" value="2000"/>');
    expect(x).toContain('<torznab:attr name="peers" value="6"/>');
    expect(x).toContain('<torznab:attr name="downloadvolumefactor" value="0"/>');
    expect(x).toContain('<torznab:attr name="minimumseedtime" value="172800"/>');
    expect(x).toContain('<torznab:attr name="tmdbid" value="123"/>');
    expect(x).toContain('<pubDate>Thu, 02 Jan 2025 03:04:05 GMT</pubDate>');
  });
});
