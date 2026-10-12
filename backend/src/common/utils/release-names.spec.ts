import { isWellFormedName, suggestReleaseNames } from './release-names';

const NFO = (audio = 'E-AC-3') => `General\nFormat : Matroska\n\nVideo\nFormat : HEVC\nWidth : 1 920 pixels\n\nAudio #1\nFormat : ${audio}\nLanguage : French\n\nAudio #2\nFormat : ${audio}\nLanguage : English\n`;

describe('noms de release standardisés', () => {
  it('le nom mal fait de l\'exemple (espaces, tiret isolé, « P » majuscule)', () => {
    const r = suggestReleaseNames({ name: 'Sword Art Online MULTI 1080P - TARDiS', nfo: NFO(), files: [{ path: 'Sword.Art.Online.S01E01.mkv', size: 1e9 }, { path: 'Sword.Art.Online.S01E02.mkv', size: 1e9 }] });
    expect(r.wellFormed).toBe(false);
    expect(r.suggestions[0].name).toBe('Sword.Art.Online.S01.MULTi.VFF.1080p-TARDiS');
    expect(r.missing).toEqual(expect.arrayContaining([expect.stringMatching(/source/), expect.stringMatching(/codec/)]));
  });

  it('nom non conforme : les propositions attendent le NFO', () => {
    const r = suggestReleaseNames({ name: 'Sword Art Online MULTI 1080P - TARDiS', files: [{ path: 'Sword.Art.Online.S01E01.mkv', size: 1e9 }] });
    expect(r.waitingForNfo).toBe(true);
    expect(r.suggestions).toEqual([]);
    expect(suggestReleaseNames({ name: 'Sword Art Online MULTI 1080P - TARDiS', nfo: 'trop court' }).waitingForNfo).toBe(true);
  });

  it('source, codec et langue complétés par le NFO et les fichiers', () => {
    const r = suggestReleaseNames({
      name: 'No String Attached 2011 MULTi 1080p WEB H265-CHiLL', nfo: NFO('E-AC-3'),
      files: [{ path: 'No.String.Attached.2011.MULTi.1080p.WEB.H265-CHiLL.mkv', size: 4e9 }],
    });
    expect(r.suggestions.map((s) => s.name)).toEqual(['No.String.Attached.2011.MULTi.VFF.1080p.WEB.H265-CHiLL', 'No.String.Attached.2011.MULTi.VFF.1080p.WEB.DDP.H265-CHiLL']);
  });

  it('nom correct avec toutes les informations : aucun choix proposé', () => {
    for (const name of ['Alone.UK.S01E03.MULTi.VFF.1080p.WEB.H264-COLL3CTiF', 'No.String.Attached.2011.MULTi.VFF.1080p.WEB.H265-CHiLL', 'Film.2020.VFQ.2160p.BluRay.x265-NoTaG']) {
      expect(isWellFormedName(name)).toBe(true);
      const r = suggestReleaseNames({ name, nfo: NFO(), files: [{ path: name + '.mkv', size: 1e9 }] });
      expect(r.complete).toBe(true);
      expect(r.suggestions).toEqual([]);
    }
    // sans NFO non plus : le nom suffit
    expect(suggestReleaseNames({ name: 'Film.2020.VFQ.2160p.BluRay.x265-NoTaG' }).complete).toBe(true);
  });

  it('bien formé mais incomplet (pas de langue précise, pas d\'année connue de la fiche) : des propositions sont faites', () => {
    const noLang = suggestReleaseNames({ name: 'Film.2020.1080p.WEB.H264-GRP', nfo: NFO(), files: [{ path: 'Film.2020.mkv', size: 1 }] });
    expect(noLang.complete).toBeFalsy();
    expect(noLang.suggestions[0].name).toBe('Film.2020.MULTi.VFF.1080p.WEB.H264-GRP');
    const noYear = suggestReleaseNames({ name: 'Film.MULTi.VFF.1080p.WEB.H264-GRP', year: 2020, nfo: NFO(), files: [{ path: 'Film.mkv', size: 1 }] });
    expect(noYear.suggestions[0].name).toBe('Film.2020.MULTi.VFF.1080p.WEB.H264-GRP');
  });

  it('accents, apostrophes et & du titre ; WEB-DL encodé en x264 devient H264 pour un WEB', () => {
    const r = suggestReleaseNames({ name: "L'Été d'Anna & Léo 2019 FRENCH 720p WEB-DL x264-TEAM", nfo: NFO(), files: [{ path: 'a.mkv', size: 1 }] });
    expect(r.suggestions[0].name).toMatch(/^LEte\.dAnna\.and\.Leo\.2019\.[A-Za-z.]+\.720p\.WEB\.H264-TEAM$/);
  });

  it('titre de la fiche proposé en plus quand il diffère vraiment', () => {
    const r = suggestReleaseNames({ name: 'sorcieres 2020 multi 1080p web h265-chill', title: 'Les Sorcières', year: 2020, nfo: NFO(), files: [{ path: 'a.mkv', size: 1 }] });
    expect(r.suggestions.some((s) => /fiche/.test(s.label) && s.name.startsWith('Les.Sorcieres.2020'))).toBe(true);
  });

  it('pas de team : NoTaG à la fin', () => {
    const r = suggestReleaseNames({ name: 'Film 2020 1080p BluRay x264', nfo: NFO(), files: [{ path: 'Film.mkv', size: 1 }] });
    expect(r.suggestions[0].name).toMatch(/^Film\.2020\.[A-Za-z.]+\.1080p\.BluRay\.x264-NoTaG$/);
    expect(r.missing.join(' ')).toMatch(/NoTaG/);
    // un « -NOTAG » existant est normalisé en NoTaG
    expect(suggestReleaseNames({ name: 'Film 2020 1080p BluRay x264-NOTAG', nfo: NFO(), files: [{ path: 'Film.mkv', size: 1 }] }).suggestions[0].name).toMatch(/-NoTaG$/);
  });

  it('ce qui n\'est pas une vidéo (logiciel, musique) n\'a pas de proposition', () => {
    expect(suggestReleaseNames({ name: 'Some Software v1.2 Setup', nfo: 'Instructions : lance setup.exe puis suis les étapes', files: [{ path: 'setup.exe', size: 1e8 }] }).suggestions).toEqual([]);
    expect(suggestReleaseNames({ name: 'Artiste - Album 2020 FLAC', nfo: 'Tracklist : 01 Intro 02 Chanson 03 Fin', files: [{ path: '01.flac', size: 1e7 }] }).suggestions).toEqual([]);
  });

  it('plusieurs saisons dans le torrent', () => {
    const files = [1, 2].flatMap((s) => [1, 2].map((e) => ({ path: `S0${s}E0${e}.mkv`, size: 1e9 })));
    expect(suggestReleaseNames({ name: 'Serie MULTI 1080p WEB x265-GRP', nfo: NFO(), files }).suggestions[0].name).toBe('Serie.S01-S02.MULTi.VFF.1080p.WEB.H265-GRP');
  });

  it("team collée par un point (« …x264.GHT ») : devient -GHT, et la plage d'années reste lisible", () => {
    const name = 'Maze Runner Trilogie (2014-2018) VF2-ENG AC3 BluRay 1080p x264.GHT';
    const r = suggestReleaseNames({ name, nfo: NFO('AC-3'), title: 'Le Labyrinthe', year: 2014, files: [{ path: 'Maze.Runner.1.mkv', size: 4e9 }, { path: 'Maze.Runner.2.mkv', size: 4e9 }, { path: 'Maze.Runner.3.mkv', size: 4e9 }] });
    expect(r.suggestions.map((x) => x.name)).toEqual([
      'Maze.Runner.Trilogie.2014-2018.MULTi.VF2.1080p.BluRay.x264-GHT',
      'Maze.Runner.Trilogie.2014-2018.MULTi.VF2.1080p.BluRay.DD.x264-GHT',
      'Le.Labyrinthe.2014.MULTi.VF2.1080p.BluRay.x264-GHT',
    ]);
    expect(r.missing.join(' ')).not.toMatch(/team/);
  });

  it("une équipe écrite après un point n'est jamais confondue avec une étiquette technique", () => {
    for (const tail of ['FRENCH', 'MULTi', '10bit', 'DUBBED', 'x265']) {
      const r = suggestReleaseNames({ name: `Film 2020 1080p BluRay x264.${tail}`, nfo: NFO(), files: [{ path: 'a.mkv', size: 1 }] });
      expect(r.suggestions[0].name).toMatch(/-NoTaG$/);
    }
    expect(suggestReleaseNames({ name: 'Film 2020 1080p BluRay x264 TEAMX', nfo: NFO(), files: [{ path: 'a.mkv', size: 1 }] }).suggestions[0].name).toMatch(/-TEAMX$/);
  });
});
