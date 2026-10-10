import { cleanTitle, guessType, leafKey, refineWithGenres, resolveCandidate } from './category-guess';

const recommended = new Map(['Film', 'Série TV', 'Animation', 'Animation Série', 'Documentaire', 'Série Documentaire', 'Émission TV', 'Sport', 'Concert', 'Musique', 'Livres'].map((n) => [leafKey(n), n]));
const basic = new Map(['Films', 'Séries TV', 'Musique', 'Animes'].map((n) => [leafKey(n), n]));

describe('type de contenu deduit du nom', () => {
  it('series : episodes, packs de saison, integrales', () => {
    expect(guessType('Last.Seen.S01.MULTi.1080p.WEB.H264-SUPPLY')).toBe('SERIE');
    expect(guessType('Small.Prophets.S01E02.MULTi.1080p.WEB.H264-SUPPLY')).toBe('SERIE');
    expect(guessType('Alertes.S06E17.FRENCH.AD.1080p.WEB.AAC.2.0.H264-MTLQC')).toBe('SERIE');
    expect(guessType('Stranger.Things.Tales.from.85.S02.MULTi.VF2.2160p.NF.WEB-DL.H265-P4TRi0T')).toBe('SERIE');
    expect(guessType('Les.Simpson.Integrale.FRENCH.720p.WEB-GRP')).toBe('SERIE');
  });

  it('animes : numero d episode seul (E19) avec qualite ou langue', () => {
    expect(guessType('Kami.no.Shizuku.E19.MULTi.1080p.WEB.H264-AMB3R')).toBe('SERIE');
    expect(guessType('Mon.Anime.E102.VOSTFR.720p.WEB-GRP')).toBe('SERIE');
    expect(cleanTitle('Kami.no.Shizuku.E19.MULTi.1080p.WEB.H264-AMB3R').title).toBe('Kami no Shizuku');
    expect(guessType('Colony.2026.MULTi.1080p.WEB.H264-SUPPLY')).toBe('FILM');
  });

  it('films : une annee et une qualite', () => {
    expect(guessType('Colony.2026.MULTi.1080p.WEB.H264-SUPPLY')).toBe('FILM');
    expect(guessType('Bullhead.2011.MULTi.VFi.1080i.BluRay.REMUX.AVC.DTS-HD.MA.5.1-HDForever')).toBe('FILM');
    expect(guessType('The.Mean.One.2022.FANSUB.VOSTFR.1080p.BluRay.HDLight.H264.AC3.5.1-ARTHECL0WN')).toBe('FILM');
    expect(guessType('Survival.Of.The.Dead.2009.MULTi.TRUEFRENCH.1080p.BluRay.x264-RiFiFi')).toBe('FILM');
  });

  it("l'etiquette DOC du nom : documentaire (film) ou serie documentaire", () => {
    expect(guessType('Coeur.de.Motard.2026.DOC.FRENCH.AD.1080p.WEB.AAC.2.0.H264-MTLQC.mkv')).toBe('DOCUMENTAIRE');
    expect(guessType('Planete.Bleue.S01.DOC.FRENCH.1080p.WEB-GRP')).toBe('DOC_SERIE');
    expect(guessType('Docteur.Who.2026.1080p.WEB-GRP')).toBe('FILM'); // « Docteur » n'est pas l'étiquette DOC
  });

  it('sport, musique, livres, concert', () => {
    expect(guessType('UFC.332.Prelims.Main.Silva.Vs.Wang.03.10.2026.VFF.1080p.HDTV.AAC.2.0.H264-NOTAG')).toBe('SPORT');
    expect(guessType('Orloge.Simard.Discographie.2014.a.2020.WebRip.MP3-320Kbps-NoTag')).toBe('MUSIQUE');
    expect(guessType('Francois.Perusse.DISCOGRAPHY.FLAC-WGPTB')).toBe('MUSIQUE');
    expect(guessType('Un.Livre.2020.EPUB')).toBe('LIVRE');
  });

  it('un nom sans type clair reste sans type', () => {
    expect(guessType('Quelque.Chose.De.Bizarre')).toBeUndefined();
    expect(guessType('Mon.Dossier.Perso')).toBeUndefined();
  });
});

describe('titre nettoye pour la recherche TMDB', () => {
  it('coupe aux etiquettes techniques et a l annee', () => {
    expect(cleanTitle('Last.Seen.S01.MULTi.1080p.WEB.H264-SUPPLY')).toEqual({ title: 'Last Seen', year: undefined });
    expect(cleanTitle('Colony.2026.MULTi.1080p.WEB.H264-SUPPLY')).toEqual({ title: 'Colony', year: 2026 });
    expect(cleanTitle('Spider-Man.Brand.New.Day.2026.MULTi.VF2.1080p.AMZN.WEB.x265.DDP5.1-P4TRi0T')).toEqual({ title: 'Spider-Man Brand New Day', year: 2026 });
    expect(cleanTitle('Masterchef.Quebec.S04E18.FRENCH.AD.1080p.WEB.AAC.2.0.H264-MTLQC').title).toBe('Masterchef Quebec');
  });
});

describe('affinage par les genres TMDB', () => {
  it('series : animation, documentaire, emissions', () => {
    expect(refineWithGenres('SERIE', [16, 35])).toBe('ANIMATION_SERIE');
    expect(refineWithGenres('SERIE', [99])).toBe('DOC_SERIE');
    expect(refineWithGenres('SERIE', [10764])).toBe('EMISSION');
    expect(refineWithGenres('SERIE', [10767])).toBe('EMISSION');
    expect(refineWithGenres('SERIE', [18, 80])).toBe('SERIE');
  });
  it('films : animation, documentaire', () => {
    expect(refineWithGenres('FILM', [16])).toBe('ANIMATION');
    expect(refineWithGenres('FILM', [99])).toBe('DOCUMENTAIRE');
    expect(refineWithGenres('FILM', [28])).toBe('FILM');
  });
});

describe('correspondance avec les sous-categories reelles du site', () => {
  it('arbre recommande', () => {
    expect(resolveCandidate('FILM', recommended)).toBe('Film');
    expect(resolveCandidate('SERIE', recommended)).toBe('Série TV');
    expect(resolveCandidate('EMISSION', recommended)).toBe('Émission TV');
    expect(resolveCandidate('ANIMATION_SERIE', recommended)).toBe('Animation Série');
    expect(resolveCandidate('SPORT', recommended)).toBe('Sport');
  });
  it('arbre par defaut : repli sur la categorie la plus proche, jamais une categorie fausse', () => {
    expect(resolveCandidate('FILM', basic)).toBe('Films');
    expect(resolveCandidate('SERIE', basic)).toBe('Séries TV');
    expect(resolveCandidate('EMISSION', basic)).toBe('Séries TV'); // pas de « Émission TV » : la série est le plus proche
    expect(resolveCandidate('ANIMATION_SERIE', basic)).toBe('Animes');
    expect(resolveCandidate('SPORT', basic)).toBeNull(); // pas de catégorie Sport : on ne range pas ailleurs
  });
});

import { feedLabelOf, typeFromFeedLabel } from './category-guess';

describe('categorie lue dans le flux RSS (libelles de la liste Saloon)', () => {
  it('series, emissions, animation, sport, films', () => {
    expect(typeFromFeedLabel('Séries-Télé --> TV Pack HD')).toBe('SERIE');
    expect(typeFromFeedLabel('Séries-Télé --> Séries-Télé HD')).toBe('SERIE');
    expect(typeFromFeedLabel('Séries-Télé --> Québécois HD')).toBe('SERIE');
    expect(typeFromFeedLabel('Séries-Télé --> Pack HD Québec')).toBe('SERIE');
    expect(typeFromFeedLabel('Séries-Télé --> Émissions TV HD')).toBe('EMISSION');
    expect(typeFromFeedLabel('Séries Animées --> Séries Animées')).toBe('ANIMATION_SERIE');
    expect(typeFromFeedLabel('Sports --> Sports [Français]')).toBe('SPORT');
    expect(typeFromFeedLabel('Films --> x265')).toBe('FILM');
    expect(typeFromFeedLabel('Films --> DVD-Rip')).toBe('FILM');
    expect(typeFromFeedLabel('Films --> WEB-DL / WEB-Rip')).toBe('FILM');
    expect(typeFromFeedLabel('Films --> Remux')).toBe('FILM');
    expect(typeFromFeedLabel('Films --> V.O.S.T. HD')).toBe('FILM');
    expect(typeFromFeedLabel('Films --> mHD 1080p')).toBe('FILM');
  });

  it('animation et documentaire : film ou serie selon le libelle / le nom', () => {
    expect(typeFromFeedLabel('Films --> Animation')).toBe('ANIMATION');
    expect(typeFromFeedLabel('Documentaires')).toBe('DOCUMENTAIRE');
    expect(typeFromFeedLabel('Documentaires', 'SERIE')).toBe('DOC_SERIE');
    expect(typeFromFeedLabel('Animés', 'SERIE')).toBe('ANIMATION_SERIE');
  });

  it('libelle inconnu ou vide : rien (on retombe sur la detection par le nom)', () => {
    expect(typeFromFeedLabel('')).toBeUndefined();
    expect(typeFromFeedLabel('Divers')).toBeUndefined();
  });

  it('libelle extrait du titre ou de la description de l article', () => {
    expect(feedLabelOf({ title: '[Séries-Télé --> Émissions TV HD] Chasseurs.d.Heritiers.S02E07.FRENCH.AD.1080p.WEB.AC3.5.1.H265-MTLQC' })).toBe('Séries-Télé --> Émissions TV HD');
    expect(feedLabelOf({ title: '[Films] [x265] Fall.2.Deadpoint.2026.MULTi.1080p' })).toBe('Films x265');
    expect(feedLabelOf({ title: 'Sans.Crochets.S01E01', description: '<b>Catégorie :</b> Séries Animées &amp; plus' })).toContain('Séries Animées');
    expect(feedLabelOf({ title: 'Sans.Rien.2025.1080p' })).toBe('');
  });
});
