import { bestPerEpisode, episodeLabel, nextEpisode, parseEpisode, estimateStream, languageMatches, pickRecommended, qualityLabel, rankOptions, resolutionHeight, sourcesByEpisode, videoFiles, vodAccess, vodHealth } from './vod';

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
  const GB = 1024 ** 3;
  const rel = (resolution: string | null, seeders: number, sizeGb: number, language: string | null = null) => ({ resolution, seeders, size: Math.round(sizeGb * GB), language });
  it("estime le débit demandé, le débit espéré et le délai de démarrage", () => {
    const e = estimateStream({ size: 2 * GB, seeders: 3 }, { mbps: 100, minutes: 45 });
    expect(e.bitrateMbps).toBeCloseTo(6.4, 0);
    expect(e.rateMbps).toBe(15);
    expect(e.fit).toBe('good');
    expect(estimateStream({ size: 2 * GB, seeders: 8 }, { mbps: 200, minutes: 45 }).fit).toBe('great');
    expect(e.startSeconds).toBeLessThan(20);
    expect(estimateStream({ size: 2 * GB, seeders: 0 }).fit).toBe('none');
    expect(estimateStream({ size: 2 * GB, seeders: 0 }).startSeconds).toBeNull();
  });
  it("la connexion plafonne le débit : plus de seeders n'accélère pas au-delà", () => {
    expect(estimateStream({ size: 2 * GB, seeders: 40 }, { mbps: 20, minutes: 45 }).rateMbps).toBe(17);
    expect(estimateStream({ size: 2 * GB, seeders: 1 }, { mbps: 100, minutes: 45 }).fit).toBe('weak');
  });
  it('recommande la plus belle qualité qui démarre vite et se lit sans coupure', () => {
    const opts = [rel('4K/2160p', 2, 12), rel('1080p', 6, 3), rel('720p', 9, 1.5)];
    expect(rankOptions(opts, { mbps: 100, minutes: 110 }).rec).toBe(opts[1]);
    const strong = [rel('4K/2160p', 12, 12), rel('1080p', 6, 3)];
    expect(pickRecommended(strong, { mbps: 200, minutes: 110 })).toBe(strong[0]);
  });
  it('une petite connexion fait préférer une release plus légère', () => {
    const opts = [rel('1080p', 8, 4), rel('720p', 8, 1.2)];
    expect(pickRecommended(opts, { mbps: 8, minutes: 100 })).toBe(opts[1]);
    expect(pickRecommended(opts, { mbps: 300, minutes: 100 })).toBe(opts[0]);
  });
  it("sans release fluide : la plus rapide à démarrer parmi les bonnes, sinon la plus sûre", () => {
    const weak = [rel('2160p', 1, 14), rel('720p', 1, 1)];
    expect(pickRecommended(weak, { mbps: 100, minutes: 110 })?.resolution).toBe('720p');
    expect(pickRecommended([], {})).toBeNull();
  });
  it('désigne la release qui démarre le plus vite', () => {
    const opts = [rel('1080p', 4, 3), rel('720p', 4, 1)];
    expect(rankOptions(opts, { mbps: 100, minutes: 100 }).fastest).toBe(opts[1]);
    expect(rankOptions([rel('1080p', 0, 3)], {}).fastest).toBeNull();
  });
  it('la langue préférée passe avant la qualité', () => {
    const opts = [rel('1080p', 8, 3, 'MULTI.VFQ'), rel('720p', 8, 1.5, 'MULTI.VFF')];
    expect(pickRecommended(opts, { mbps: 100, minutes: 100 })).toBe(opts[0]);
    expect(pickRecommended(opts, { mbps: 100, minutes: 100, lang: 'vff' })).toBe(opts[1]);
    expect(languageMatches('MULTI.VF2', 'vfq')).toBe(true);
    expect(languageMatches('VOSTFR', 'vo')).toBe(true);
    expect(languageMatches('VFF', 'vfq')).toBe(false);
  });
  it("regroupe les releases d'un épisode, plus belle qualité d'abord", () => {
    const src = (torrentId: string, resolution: string, seeders: number, episode = 1) => ({ torrentId, fileIndex: 0, season: 1, episode, size: 1000, seeders, resolution, language: null, label: '' });
    const g = sourcesByEpisode([src('a', '720p', 5), src('b', '1080p', 4), src('c', '1080p', 9), src('z', '1080p', 3, 2)]);
    expect(g.get('1:1')!.map((s) => s.torrentId)).toEqual(['c', 'b', 'a']);
    expect(bestPerEpisode([src('a', '720p', 5), src('c', '1080p', 9)]).map((s) => s.torrentId)).toEqual(['c']);
  });
});
