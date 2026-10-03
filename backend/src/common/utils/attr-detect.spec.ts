import { detectAttrs } from './attr-detect';

const f = (...paths: string[]) => paths.map((path) => ({ path }));

describe('detectAttrs', () => {
  it('film : Dolby Vision + HDR10, canaux et audio sans perte', () => {
    const a = detectAttrs({
      name: 'Dune.Part.Two.2024.2160p.BluRay.REMUX.DV.HDR10.HEVC.TrueHD.Atmos.7.1-GRP', files: f('Dune.mkv'), top: 'Films & Vidéos', leaf: 'Film',
    });
    expect(a.hdrFormat).toEqual(['DV+HDR10']);
    expect(a.channels).toEqual(['7.1']);
    expect(a.audioQuality).toEqual(['Lossless']);
    expect(a.serieType).toBeUndefined();
  });

  it('série : un épisode, EAC3 5.1 sans perte absent, SDR', () => {
    const a = detectAttrs({ name: 'War.2026.S01E01.MULTi.VFF.AD.1080p.WEB.AC3.5.1.H264-FRQC', files: f('a.mkv'), top: 'Films & Vidéos', leaf: 'Série TV' });
    expect(a.serieType).toEqual(['Épisode']);
    expect(a.hdrFormat).toEqual(['SDR']);
    expect(a.channels).toEqual(['5.1']);
    expect(a.audioQuality).toEqual(['Lossy']);
  });

  it('MediaInfo du NFO : canaux et HDR10+', () => {
    const nfo = 'Audio #1\nFormat : E-AC-3\nChannel(s) : 6 channels\nVideo\nHDR format : SMPTE ST 2094 App 4, Version 1, HDR10+ Profile A compatible';
    const a = detectAttrs({ name: 'Film.2025.2160p.WEB', files: f('a.mkv'), nfo, top: 'Films & Vidéos', leaf: 'Film' });
    expect(a.channels).toEqual(['5.1']);
    expect(a.hdrFormat).toEqual(['HDR10+']);
  });

  it('ebook : langue entre points et format du fichier', () => {
    const a = detectAttrs({ name: 'Stern.Tome.5.Maffre.Une.simple.formalité.2023.fr.[CBZ]-beastieboy', files: f('Stern 5.cbz'), top: 'Ebook', leaf: 'BDs' });
    expect(a.langueEbook).toEqual(['Français']);
    expect(a.formatFichier).toEqual(['CBZ']);
  });

  it("le mot français « en » n'est pas pris pour de l'anglais", () => {
    const a = detectAttrs({ name: 'Le monde en feu - Roman', files: f('livre.epub'), top: 'Ebook', leaf: 'Livres' });
    expect(a.langueEbook).toBeUndefined();
    expect(a.formatFichier).toEqual(['EPUB']);
  });

  it('manga : démographique et style', () => {
    const a = detectAttrs({ name: 'Berserk Tome 1 Seinen FR', files: f('1.cbr'), top: 'Ebook', leaf: 'Manga' });
    expect(a.demographique).toEqual(['Seinen']);
    expect(a.formatFichier).toEqual(['CBR']);
  });

  it('musique : FLAC 24 bit, web, album, genres de la fiche', () => {
    const a = detectAttrs({
      name: 'Daft Punk - Random Access Memories (2013) [WEB FLAC 24-88]', files: f('01.flac', '02.flac', '03.flac', '04.flac'), top: 'Audio', leaf: 'Musique', metaGenres: ['Dance', 'Pop'],
    });
    expect(a.formatMusique).toEqual(['FLAC (24 bit)']);
    expect(a.qualiteMusique).toEqual(['Web']);
    expect(a.typeMusique).toEqual(['Album']);
    expect(a.genreMusique).toEqual(['Dance/Electro', 'Pop']);
  });

  it('jeu : console et genre depuis le nom', () => {
    const a = detectAttrs({ name: 'Farming Simulator 25 PS5-DUPLEX', files: f('a.pkg'), top: 'Jeux Vidéo', leaf: 'Jeux Sony' });
    expect(a.consoleSony).toEqual(['PlayStation 5']);
    expect(a.genreJeux).toEqual(['Simulation']);
    expect(a.consoleNintendo).toBeUndefined();
  });

  it('jeu Switch : extension NSP, Switch 2 prime sur Switch', () => {
    expect(detectAttrs({ name: 'Mario Kart World', files: f('a.nsp'), top: 'Jeux Vidéo', leaf: 'Jeux Nintendo' }).consoleNintendo).toEqual(['Switch']);
    expect(detectAttrs({ name: 'Mario Kart World Switch 2 NSP', files: f('a.nsp'), top: 'Jeux Vidéo', leaf: 'Jeux Nintendo' }).consoleNintendo).toEqual(['Switch 2']);
  });

  it('application mobile : APK et genre', () => {
    const a = detectAttrs({ name: 'Adobe Lightroom Premium Android', files: f('lr.apk'), top: 'Applications', leaf: 'Logiciels Smartphone' });
    expect(a.systemeMobile).toEqual(['Android']);
    expect(a.genreApplications).toContain('Photographie');
  });

  it("impression 3D : formats et technologie", () => {
    const a = detectAttrs({ name: 'Dragon pack resin', files: f('a.stl', 'b.stl', 'c.obj'), top: 'Imprimante 3D', leaf: 'Objets 3D' });
    expect(a.format3d).toEqual(['STL', 'OBJ']);
    expect(a.techno3d).toEqual(['Résine (SLA)']);
  });

  it("une catégorie sans filtres ne renvoie rien", () => {
    expect(detectAttrs({ name: 'x', files: f('a.rom'), top: 'XXX', leaf: 'XXX Films' })).toEqual({});
  });
});
