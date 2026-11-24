import { bestPerEpisode, episodeLabel, nextEpisode, parseEpisode, videoFiles, vodAccess, vodHealth } from './vod';

const now = new Date('2026-11-24T12:00:00Z');
const day = 86_400_000;

describe('vodAccess', () => {
  it("refuse un membre ordinaire et un compte inconnu", () => {
    expect(vodAccess({ role: 'USER' }, now)).toBeNull();
    expect(vodAccess(null, now)).toBeNull();
    expect(vodAccess(undefined, now)).toBeNull();
  });
  it("accepte les uploaders, les fondateurs et l'équipe", () => {
    expect(vodAccess({ role: 'UPLOADER' }, now)).toBe('uploader');
    expect(vodAccess({ role: 'USER', founderAt: new Date('2025-01-01') }, now)).toBe('founder');
    for (const role of ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER']) expect(vodAccess({ role }, now)).toBe('staff');
  });
  it("un don ne donne accès que tant qu'il est actif", () => {
    expect(vodAccess({ role: 'USER', donorUntil: new Date(now.getTime() + day) }, now)).toBe('donor');
    expect(vodAccess({ role: 'USER', donorUntil: new Date(now.getTime() - day) }, now)).toBeNull();
    expect(vodAccess({ role: 'USER', donorUntil: null }, now)).toBeNull();
  });
  it("garde la raison la plus forte quand plusieurs s'appliquent", () => {
    expect(vodAccess({ role: 'UPLOADER', founderAt: new Date(), donorUntil: new Date(now.getTime() + day) }, now)).toBe('uploader');
  });
});

describe('vodHealth', () => {
  it('juge le démarrage au nombre de seeders', () => {
    expect(vodHealth(0)).toBe('none');
    expect(vodHealth(1)).toBe('slow');
    expect(vodHealth(2)).toBe('ok');
    expect(vodHealth(4)).toBe('ok');
    expect(vodHealth(5)).toBe('instant');
    expect(vodHealth(40)).toBe('instant');
  });
});

describe('parseEpisode', () => {
  it('lit S01E02 et 1x02', () => {
    expect(parseEpisode('Show.S01E02.1080p.mkv')).toEqual({ season: 1, episode: 2 });
    expect(parseEpisode('Show/Saison 2/show s02 e11.mkv')).toEqual({ season: 2, episode: 11 });
    expect(parseEpisode('Show 3x04 VF.mkv')).toEqual({ season: 3, episode: 4 });
  });
  it("ne confond pas une résolution ou une année avec un épisode", () => {
    expect(parseEpisode('Film.2019.1080p.x264.mkv')).toBeNull();
    expect(parseEpisode('Film.1920x1080.mkv')).toBeNull();
  });
  it('met en forme le libellé', () => {
    expect(episodeLabel(1, 5)).toBe('S01E05');
    expect(episodeLabel(null, 5)).toBe('');
  });
});

describe('videoFiles', () => {
  const MB = 1024 * 1024;
  it('garde les vidéos assez grosses avec leur index dans le torrent, sans les samples', () => {
    const out = videoFiles([
      { path: 'Show/readme.nfo', size: 2000 },
      { path: 'Show/Show.S01E01.mkv', size: 900 * MB },
      { path: 'Show/Sample/sample.mkv', size: 20 * MB },
      { path: 'Show/Show.S01E02.mkv', size: 880 * MB },
      { path: 'Show/Show.S01E03.sample.mkv', size: 100 * MB },
    ]);
    expect(out.map((f) => f.index)).toEqual([1, 3]);
  });
  it("accepte n'importe quoi sans planter", () => {
    expect(videoFiles(null)).toEqual([]);
    expect(videoFiles('x')).toEqual([]);
    expect(videoFiles([null, {}, { path: 5 }])).toEqual([]);
  });
});

describe('bestPerEpisode', () => {
  const src = (over: Partial<Parameters<typeof bestPerEpisode>[0][0]>) => ({ torrentId: 't', fileIndex: 0, season: 1, episode: 1, size: 1000, seeders: 1, resolution: null, language: null, label: '', ...over });
  it('garde la release la mieux seedée de chaque épisode, triée par saison puis épisode', () => {
    const out = bestPerEpisode([
      src({ torrentId: 'a', season: 1, episode: 2, seeders: 3 }),
      src({ torrentId: 'b', season: 1, episode: 1, seeders: 1 }),
      src({ torrentId: 'c', season: 1, episode: 1, seeders: 9 }),
      src({ torrentId: 'd', season: 2, episode: 1, seeders: 2 }),
    ]);
    expect(out.map((s) => s.torrentId)).toEqual(['c', 'a', 'd']);
  });
  it("à égalité de seeders, prend la plus petite et garde à la fin ce qui n'a pas de numéro", () => {
    const out = bestPerEpisode([
      src({ torrentId: 'big', seeders: 4, size: 5000 }),
      src({ torrentId: 'small', seeders: 4, size: 2000 }),
      src({ torrentId: 'x', season: null, episode: null }),
    ]);
    expect(out.map((s) => s.torrentId)).toEqual(['small', 'x']);
  });
});

describe('nextEpisode', () => {
  const eps = (s: number, list: number[]) => list.map((episode) => ({ season: s, episode }));
  it("rend l'épisode suivant quand il est là", () => {
    expect(nextEpisode(eps(1, [1, 2, 3, 4, 5, 6]), { season: 1, episode: 5 }, { 1: 10 })).toEqual({ status: 'next', next: { season: 1, episode: 6 }, missing: [] });
  });
  it("signale l'épisode manquant quand le suivant existe plus loin", () => {
    expect(nextEpisode(eps(1, [1, 2, 3, 4, 5, 7, 8]), { season: 1, episode: 5 }, { 1: 10 })).toEqual({ status: 'gap', next: { season: 1, episode: 7 }, missing: [{ season: 1, episode: 6 }] });
    expect(nextEpisode(eps(1, [1, 5, 9]), { season: 1, episode: 5 })).toMatchObject({ status: 'gap', next: { season: 1, episode: 9 }, missing: [{ season: 1, episode: 6 }, { season: 1, episode: 7 }, { season: 1, episode: 8 }] });
  });
  it("épisode attendu absent et rien après : manquant ; sans taille de saison connue : fin", () => {
    expect(nextEpisode(eps(1, [1, 2, 3, 4, 5]), { season: 1, episode: 5 }, { 1: 10 })).toEqual({ status: 'missing', missing: [{ season: 1, episode: 6 }] });
    expect(nextEpisode(eps(1, [1, 2, 3, 4, 5]), { season: 1, episode: 5 })).toEqual({ status: 'end', missing: [] });
  });
  it('passe à la saison suivante en fin de saison, et signale un début de saison incomplet', () => {
    expect(nextEpisode([...eps(1, [1, 2, 3]), ...eps(2, [1, 2])], { season: 1, episode: 3 }, { 1: 3 })).toEqual({ status: 'next', next: { season: 2, episode: 1 }, missing: [] });
    expect(nextEpisode([...eps(1, [1, 2, 3]), ...eps(2, [2, 3])], { season: 1, episode: 3 }, { 1: 3 })).toEqual({ status: 'gap', next: { season: 2, episode: 2 }, missing: [{ season: 2, episode: 1 }] });
    expect(nextEpisode(eps(1, [1, 2, 3]), { season: 1, episode: 3 }, { 1: 3 })).toEqual({ status: 'end', missing: [] });
  });
});
