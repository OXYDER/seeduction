import { stripReleaseExtension } from './release-name';

describe("extension dans le nom d'une release", () => {
  it('retire les extensions de conteneurs vidéo et fichiers annexes', () => {
    expect(stripReleaseExtension('Les.Enfants.de.la.Tele.S17E03.FRENCH.AD.1080p.WEB.AAC.2.0.H264-MTLQC.mkv')).toBe('Les.Enfants.de.la.Tele.S17E03.FRENCH.AD.1080p.WEB.AAC.2.0.H264-MTLQC');
    expect(stripReleaseExtension('Film.2025.1080p.WEB-GRP.MP4')).toBe('Film.2025.1080p.WEB-GRP');
    expect(stripReleaseExtension('Serie S01E01 1080p.avi')).toBe('Serie S01E01 1080p');
    expect(stripReleaseExtension('Nom.de.release.nfo')).toBe('Nom.de.release');
  });

  it('garde les étiquettes qui ressemblent à des extensions (ISO, ZIP, FLAC, TS) et les noms sans extension', () => {
    expect(stripReleaseExtension('Ubuntu.24.04.Desktop.ISO')).toBe('Ubuntu.24.04.Desktop.ISO');
    expect(stripReleaseExtension('Album.2020.FLAC')).toBe('Album.2020.FLAC');
    expect(stripReleaseExtension('Film.2025.TS.x264-GRP')).toBe('Film.2025.TS.x264-GRP');
    expect(stripReleaseExtension('Serie.S01E01.1080p.WEB-GRP')).toBe('Serie.S01E01.1080p.WEB-GRP');
  });

  it("ne vide jamais le nom et n'enlève qu'une extension", () => {
    expect(stripReleaseExtension('.mkv')).toBe('.mkv');
    expect(stripReleaseExtension('a.mkv.mkv')).toBe('a.mkv');
    expect(stripReleaseExtension('  Film.mkv  ')).toBe('Film');
  });
});
