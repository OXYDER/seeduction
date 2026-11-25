import { bestPerEpisode, episodeLabel, nextEpisode, parseEpisode, pickRecommended, qualityLabel, resolutionHeight, seedersNeeded, sourcesByEpisode, streamFit, videoFiles, vodAccess, vodHealth } from './vod';

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

describe('choix de la qualité', () => {
  const o = (resolution: string | null, seeders: number, size = 1000) => ({ resolution, seeders, size });
  it('lit la hauteur et le libellé de la qualité', () => {
    expect(resolutionHeight('4K/2160p')).toBe(2160);
    expect(resolutionHeight('1080p')).toBe(1080);
    expect(resolutionHeight('720P')).toBe(720);
    expect(resolutionHeight('SD')).toBe(480);
    expect(resolutionHeight(null)).toBe(0);
    expect(qualityLabel('4K/2160p')).toBe('4K');
    expect(qualityLabel('1080p')).toBe('1080p');
    expect(qualityLabel(null)).toBe('Qualité inconnue');
  });
  it('une image plus lourde demande plus de seeders', () => {
    expect(seedersNeeded(2160)).toBeGreaterThan(seedersNeeded(1080));
    expect(seedersNeeded(1080)).toBeGreaterThan(seedersNeeded(720));
    expect(streamFit(0, '1080p')).toBe('none');
    expect(streamFit(1, '1080p')).toBe('weak');
    expect(streamFit(3, '1080p')).toBe('good');
    expect(streamFit(6, '1080p')).toBe('great');
  });
  it('recommande la plus belle qualité que la vitesse permet', () => {
    expect(pickRecommended([o('4K/2160p', 2), o('1080p', 6), o('720p', 9)])).toEqual(o('1080p', 6));
    expect(pickRecommended([o('4K/2160p', 10), o('1080p', 6)])).toEqual(o('4K/2160p', 10));
  });
  it("sans qualité suffisante, prend le plus de seeders ; à qualité égale, le plus de seeders puis le plus petit", () => {
    expect(pickRecommended([o('2160p', 1), o('720p', 1, 500)])?.resolution).toBe('2160p');
    expect(pickRecommended([o('1080p', 1), o('720p', 1)])?.resolution).toBe('1080p');
    expect(pickRecommended([o('1080p', 4, 5000), o('1080p', 4, 3000)])?.size).toBe(3000);
    expect(pickRecommended([])).toBeNull();
  });
  it("regroupe les releases d'un épisode, plus belle qualité d'abord", () => {
    const src = (torrentId: string, resolution: string, seeders: number, episode = 1) => ({ torrentId, fileIndex: 0, season: 1, episode, size: 1000, seeders, resolution, language: null, label: '' });
    const g = sourcesByEpisode([src('a', '720p', 5), src('b', '1080p', 4), src('c', '1080p', 9), src('z', '1080p', 3, 2)]);
    expect(g.get('1:1')!.map((s) => s.torrentId)).toEqual(['c', 'b', 'a']);
    expect(bestPerEpisode([src('a', '720p', 5), src('c', '1080p', 9)]).map((s) => s.torrentId)).toEqual(['c']);
  });
});
