import { analyseAnnounce, analyseClient, imbalancePoints, ipNetwork, levelOf, normalizeAntiCheatConfig, passkeySharingPoints, scoreEvents, surgePoints, DEFAULT_ANTICHEAT } from './anticheat';

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const now = new Date('2026-06-10T12:00:00Z');
const ago = (min: number) => new Date(now.getTime() - min * 60_000);
const kinds = (s: { kind: string }[]) => s.map((x) => x.kind);

const base = { peerId: '-qB4650-abcdefghijkl', userAgent: 'qBittorrent/4.6.5', size: 10 * GB, now };

describe('analyseAnnounce', () => {
  it('ne signale rien pour un announce normal', () => {
    const s = analyseAnnounce({ ...base, uploaded: 3 * GB, downloaded: 0, left: 0, prev: { uploaded: 2.5 * GB, downloaded: 0, left: 0, lastAnnounceAt: ago(30) } });
    expect(s).toEqual([]);
  });

  it('repère une vitesse d\'upload hors de portée, plus grave quand elle grimpe', () => {
    const mild = analyseAnnounce({ ...base, uploaded: 300 * GB, downloaded: 0, left: 0, prev: { uploaded: 100 * GB, downloaded: 0, left: 0, lastAnnounceAt: ago(30) } }); // ~114 Mo/s
    expect(kinds(mild)).not.toContain('SPEED_IMPOSSIBLE');
    const fast = analyseAnnounce({ ...base, uploaded: 400 * GB, downloaded: 0, left: 0, prev: { uploaded: 100 * GB, downloaded: 0, left: 0, lastAnnounceAt: ago(30) } }); // ~170 Mo/s
    const crazy = analyseAnnounce({ ...base, uploaded: 6000 * GB, downloaded: 0, left: 0, prev: { uploaded: 100 * GB, downloaded: 0, left: 0, lastAnnounceAt: ago(30) } });
    const a = fast.find((x) => x.kind === 'SPEED_IMPOSSIBLE')!;
    const b = crazy.find((x) => x.kind === 'SPEED_IMPOSSIBLE')!;
    expect(a.points).toBeGreaterThan(0);
    expect(b.points).toBeGreaterThan(a.points);
  });

  it('ignore les petites fenêtres : moins d\'un Go déclaré', () => {
    const s = analyseAnnounce({ ...base, uploaded: 900 * MB, downloaded: 0, left: 0, prev: { uploaded: 0, downloaded: 0, left: 0, lastAnnounceAt: ago(0.6) } });
    expect(kinds(s)).not.toContain('SPEED_IMPOSSIBLE');
  });

  it('repère « left » plus grand que le torrent', () => {
    const s = analyseAnnounce({ ...base, uploaded: 0, downloaded: 0, left: 99 * GB, prev: null });
    expect(kinds(s)).toEqual(['LEFT_TAMPER']);
  });

  it('repère un téléchargement sous-déclaré, mais pas un client honnête', () => {
    const cheat = analyseAnnounce({ ...base, uploaded: 0, downloaded: 100 * MB, left: 4 * GB, prev: { uploaded: 0, downloaded: 0, left: 8 * GB, lastAnnounceAt: ago(30) } });
    expect(kinds(cheat)).toContain('DOWNLOAD_UNDERREPORT');
    const honest = analyseAnnounce({ ...base, uploaded: 0, downloaded: 4.1 * GB, left: 4 * GB, prev: { uploaded: 0, downloaded: 0, left: 8 * GB, lastAnnounceAt: ago(30) } });
    expect(kinds(honest)).not.toContain('DOWNLOAD_UNDERREPORT');
  });

  it('ne compte pas la reprise d\'un téléchargement (event started) comme sous-déclaration', () => {
    const s = analyseAnnounce({ ...base, event: 'started', uploaded: 0, downloaded: 0, left: 1 * GB, prev: { uploaded: 0, downloaded: 0, left: 9 * GB, lastAnnounceAt: ago(30) } });
    expect(kinds(s)).not.toContain('DOWNLOAD_UNDERREPORT');
  });

  it('repère des compteurs qui reculent avec le même peer_id', () => {
    const s = analyseAnnounce({ ...base, uploaded: 1 * GB, downloaded: 0, left: 0, prev: { uploaded: 50 * GB, downloaded: 0, left: 0, lastAnnounceAt: ago(30) } });
    expect(kinds(s)).toContain('COUNTER_ROLLBACK');
  });

  it('repère les announces à répétition mais pas ceux qui portent un événement', () => {
    const flood = analyseAnnounce({ ...base, uploaded: 0, downloaded: 0, left: 0, prev: { uploaded: 0, downloaded: 0, left: 0, lastAnnounceAt: ago(0.5) } });
    expect(kinds(flood)).toContain('ANNOUNCE_FLOOD');
    const stopped = analyseAnnounce({ ...base, event: 'stopped', uploaded: 0, downloaded: 0, left: 0, prev: { uploaded: 0, downloaded: 0, left: 0, lastAnnounceAt: ago(0.5) } });
    expect(kinds(stopped)).not.toContain('ANNOUNCE_FLOOD');
  });
});

describe('analyseClient', () => {
  it('reconnaît un outil de triche dans le User-Agent', () => {
    expect(analyseClient('-qB4650-xxxxxxxxxxxx', 'RatioMaster 1.9')[0].points).toBeGreaterThanOrEqual(50);
  });
  it('repère un User-Agent qui contredit le peer_id', () => {
    expect(kinds(analyseClient('-qB4650-xxxxxxxxxxxx', 'Transmission/3.00'))).toEqual(['FAKE_CLIENT']);
  });
  it('laisse passer un client cohérent, et le lecteur Seeduction', () => {
    expect(analyseClient('-qB4650-xxxxxxxxxxxx', 'qBittorrent/4.6.5')).toEqual([]);
    expect(analyseClient('-WW0105-xxxxxxxxxxxx', 'node', true)).toEqual([]);
  });
  it('sans User-Agent, ne reproche rien à un client connu', () => {
    expect(analyseClient('-TR3000-xxxxxxxxxxxx', undefined)).toEqual([]);
  });
});

describe('réseau', () => {
  it('regroupe les adresses par réseau', () => {
    expect(ipNetwork('::ffff:203.0.113.77')).toBe('203.0.113.0/24');
    expect(ipNetwork('203.0.113.9')).toBe('203.0.113.0/24');
    expect(ipNetwork('2001:db8:1:2::5')).toBe('2001:db8:1::/48');
  });
  it('passkey partagée : rien sous le seuil, croissant au-dessus', () => {
    expect(passkeySharingPoints(3, 4)).toBe(0);
    expect(passkeySharingPoints(4, 4)).toBe(20);
    expect(passkeySharingPoints(6, 4)).toBeGreaterThan(passkeySharingPoints(5, 4));
    expect(passkeySharingPoints(20, 4)).toBe(45);
  });
});

describe('scoreEvents', () => {
  const ev = (kind: string, points: number, daysAgo = 0) => ({ kind, points, lastAt: new Date(now.getTime() - daysAgo * 86400_000) });

  it('un signal isolé et faible ne déclenche rien', () => {
    expect(scoreEvents([ev('ANNOUNCE_FLOOD', 3)], { now }).level).toBe('NONE');
  });

  it('plafonne un signal qui se répète dans la même journée', () => {
    const many = scoreEvents(Array.from({ length: 50 }, () => ev('ANNOUNCE_FLOOD', 3)), { now });
    expect(many.score).toBeLessThanOrEqual(15);
  });

  it('la décroissance fait redescendre le score avec le temps', () => {
    const fresh = scoreEvents([ev('SPEED_IMPOSSIBLE', 60)], { now }).score;
    const old = scoreEvents([ev('SPEED_IMPOSSIBLE', 60, 28)], { now }).score;
    expect(old).toBeLessThan(fresh / 3);
    expect(scoreEvents([ev('SPEED_IMPOSSIBLE', 60, 90)], { now }).score).toBe(0);
  });

  it('la corroboration par plusieurs familles augmente le score et la confiance', () => {
    const one = scoreEvents([ev('SPEED_IMPOSSIBLE', 30)], { now });
    const three = scoreEvents([ev('SPEED_IMPOSSIBLE', 30), ev('PASSKEY_SHARING', 30), ev('FAKE_CLIENT', 30)], { now });
    expect(three.families.length).toBe(3);
    expect(three.score).toBeGreaterThan(one.score * 3);
    expect(three.confidence).toBeGreaterThan(one.confidence);
    expect(one.confidence).toBeLessThanOrEqual(70);
  });

  it('un compte tout neuf est examiné plus sévèrement qu\'un compte ancien', () => {
    const e = [ev('RATIO_SURGE', 40)];
    const newer = scoreEvents(e, { now, accountCreatedAt: new Date(now.getTime() - 3 * 86400_000) }).score;
    const older = scoreEvents(e, { now, accountCreatedAt: new Date(now.getTime() - 800 * 86400_000) }).score;
    expect(newer).toBeGreaterThan(older);
  });

  it('atteint le niveau « probable » avec des indices concordants', () => {
    const r = scoreEvents([ev('ACCOUNT_COLLUSION', 45), ev('SHARED_IP', 6), ev('SWARM_IMBALANCE', 40), ev('FAKE_CLIENT', 20)], { now });
    expect(['LIKELY', 'CRITICAL']).toContain(r.level);
    expect(Object.keys(r.breakdown)).toContain('ACCOUNT_COLLUSION');
  });

  it('la sensibilité décale les seuils', () => {
    expect(levelOf(50, 100)).toBe('WATCH');
    expect(levelOf(50, 150)).toBe('SUSPECT');
    expect(levelOf(40, 60)).toBe('NONE');
  });
});

describe('barèmes', () => {
  it('envolée du ratio : rien sous le seuil, rien pour un compte ancien sans historique, de plus en plus fort avec le multiple', () => {
    expect(surgePoints(50 * GB, 1 * GB, 100, 100)).toBe(0);
    expect(surgePoints(300 * GB, null, 400, 100)).toBe(0);
    expect(surgePoints(300 * GB, null, 3, 100)).toBeGreaterThan(0);
    expect(surgePoints(400 * GB, 2 * GB, 100, 100)).toBeGreaterThan(surgePoints(400 * GB, 10 * GB, 100, 100));
    expect(surgePoints(120 * GB, 40 * GB, 100, 100)).toBe(0); // habitude déjà élevée : pas une envolée
  });
  it('déséquilibre de swarm : monte avec la part attribuée', () => {
    expect(imbalancePoints(0.5)).toBe(0);
    expect(imbalancePoints(1)).toBeGreaterThan(0);
    expect(imbalancePoints(100)).toBeGreaterThan(imbalancePoints(5));
    expect(imbalancePoints(100000)).toBe(45);
  });
});

describe('normalizeAntiCheatConfig', () => {
  it('applique les défauts et borne les valeurs', () => {
    expect(normalizeAntiCheatConfig(null)).toEqual(DEFAULT_ANTICHEAT);
    const c = normalizeAntiCheatConfig({ sensitivity: 9999, speedWarnMBps: -4, alertLevel: 'bidon', notifyScope: 'ADMINS', observeOnly: true });
    expect(c.sensitivity).toBe(250);
    expect(c.speedWarnMBps).toBe(10);
    expect(c.alertLevel).toBe('SUSPECT');
    expect(c.notifyScope).toBe('ADMINS');
    expect(c.observeOnly).toBe(true);
  });
});
