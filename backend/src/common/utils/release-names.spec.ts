import { isWellFormedName, suggestReleaseNames } from './release-names';

const NFO = (audio = 'E-AC-3') => `General\nFormat : Matroska\n\nVideo\nFormat : HEVC\nWidth : 1 920 pixels\n\nAudio #1\nFormat : ${audio}\nLanguage : French\n\nAudio #2\nFormat : ${audio}\nLanguage : English\n`;

describe('noms de release standardisés', () => {
  it('le nom mal fait de l\'exemple (espaces, tiret isolé, « P » majuscule)', () => {
    const r = suggestReleaseNames({ name: 'Sword Art Online MULTI 1080P - TARDiS', files: [{ path: 'Sword.Art.Online.S01E01.mkv', size: 1e9 }, { path: 'Sword.Art.Online.S01E02.mkv', size: 1e9 }] });
    expect(r.wellFormed).toBe(false);
    expect(r.suggestions[0].name).toBe('Sword.Art.Online.S01.MULTi.1080p-TARDiS');
    expect(r.missing).toEqual(expect.arrayContaining([expect.stringMatching(/langue/), expect.stringMatching(/source/), expect.stringMatching(/codec/)]));
  });

  it('source, codec et langue complétés par le NFO et les fichiers', () => {
    const r = suggestReleaseNames({
      name: 'No String Attached 2011 MULTi 1080p WEB H265-CHiLL', nfo: NFO('E-AC-3'),
      files: [{ path: 'No.String.Attached.2011.MULTi.1080p.WEB.H265-CHiLL.mkv', size: 4e9 }],
    });
    expect(r.suggestions.map((s) => s.name)).toEqual(['No.String.Attached.2011.MULTi.VFF.1080p.WEB.H265-CHiLL', 'No.String.Attached.2011.MULTi.VFF.1080p.WEB.DDP.H265-CHiLL']);
  });

  it('un nom déjà standard n\'est pas re-proposé tel quel', () => {
    const name = 'Alone.UK.S01E03.MULTi.VFF.1080p.WEB.H264-COLL3CTiF';
    expect(isWellFormedName(name)).toBe(true);
    const r = suggestReleaseNames({ name, files: [{ path: name + '.mkv', size: 1e9 }] });
    expect(r.wellFormed).toBe(true);
    expect(r.suggestions.find((s) => s.name === name)).toBeUndefined();
  });

  it('accents, apostrophes et & du titre ; WEB-DL encodé en x264 devient H264 pour un WEB', () => {
    const r = suggestReleaseNames({ name: "L'Été d'Anna & Léo 2019 FRENCH 720p WEB-DL x264-TEAM", files: [{ path: 'a.mkv', size: 1 }] });
    expect(r.suggestions[0].name).toBe('LEte.dAnna.and.Leo.2019.FRENCH.720p.WEB.H264-TEAM');
  });

  it('titre de la fiche proposé en plus quand il diffère', () => {
    const r = suggestReleaseNames({ name: 'les sorcieres 2020 multi 1080p web h265-chill', title: 'Les Sorcières', year: 2020, files: [{ path: 'a.mkv', size: 1 }] });
    const names = r.suggestions.map((s) => s.name);
    expect(names.some((n) => n.startsWith('les.sorcieres'))).toBe(true);
    expect(r.suggestions.some((s) => /fiche/.test(s.label))).toBe(false); // même titre sans accents : pas de doublon
  });

  it('pas de team : aucune inventée, signalée comme manquante', () => {
    const r = suggestReleaseNames({ name: 'Film 2020 1080p BluRay x264', files: [{ path: 'Film.mkv', size: 1 }] });
    expect(r.suggestions[0].name).toBe('Film.2020.1080p.BluRay.x264');
    expect(r.missing.join(' ')).toMatch(/team/);
  });

  it('ce qui n\'est pas une vidéo (logiciel, musique) n\'a pas de proposition', () => {
    expect(suggestReleaseNames({ name: 'Some Software v1.2 Setup', files: [{ path: 'setup.exe', size: 1e8 }] }).suggestions).toEqual([]);
    expect(suggestReleaseNames({ name: 'Artiste - Album 2020 FLAC', files: [{ path: '01.flac', size: 1e7 }] }).suggestions).toEqual([]);
  });

  it('plusieurs saisons dans le torrent', () => {
    const files = [1, 2].flatMap((s) => [1, 2].map((e) => ({ path: `S0${s}E0${e}.mkv`, size: 1e9 })));
    expect(suggestReleaseNames({ name: 'Serie MULTI 1080p WEB x265-GRP', files }).suggestions[0].name).toBe('Serie.S01-S02.MULTi.1080p.WEB.H265-GRP');
  });
});
