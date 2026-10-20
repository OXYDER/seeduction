// Test de bout en bout : récap mensuel (meilleur jour de partage, séries regardées, points par source, badges, comparaison anonyme). Voir README.md.
// Le backend garde la comparaison en cache 10 minutes : relancer le backend entre deux exécutions.
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const BASE = E2E.BASE;
async function call(p, token) { const r = await fetch(BASE + p, { headers: token ? { Authorization: 'Bearer ' + token } : {} }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { s: r.status, b: j, raw: t }; }
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
const tok = (u) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, E2E.SECRET, { expiresIn: '1h' });
const GB = 1e9;

(async () => {
  const p = new PrismaClient();
  const { monthKeyOf, monthRange } = require(E2E.DIST + 'common/utils/recap.js');
  const key = monthKeyOf(new Date());
  const range = monthRange(key);
  const tag = 'rc' + Date.now().toString(36).slice(-5);
  const mk = (n, data = {}) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: 'x', createdAt: new Date(Date.now() - 200 * 86400_000), ...data } });
  const me = await mk('me'), others = [];
  for (let i = 0; i < 4; i++) others.push(await mk('o' + i));
  const bot = await mk('bot', { profileType: 'BOT' });
  const T = tok(me);

  // relevés de nuit (3 h UTC) pour les jours écoulés du mois : +10 Go par jour, sauf un gros jour
  const days = Math.min(8, Math.floor((Date.now() - range.start.getTime()) / 86400_000) - 1);
  if (days < 3) { console.log('Trop tôt dans le mois pour ce test (il faut au moins 4 jours écoulés)'); process.exit(0); }
  const snapAt = (d) => new Date(Date.UTC(range.start.getUTCFullYear(), range.start.getUTCMonth(), 1 + d, 3, 0, 0));
  const makeSnaps = async (userId, perDay, bigDay, big) => {
    await p.ratioSnapshot.create({ data: { userId, uploaded: 1000n * 1000000000n, downloaded: 100n * 1000000000n, takenAt: new Date(snapAt(0).getTime() - 86400_000 * 2) } });
    let up = 1000 * GB;
    for (let d = 0; d <= days; d++) { up += d === bigDay ? big * GB : perDay * GB; await p.ratioSnapshot.create({ data: { userId, uploaded: BigInt(Math.round(up)), downloaded: BigInt(Math.round(100 * GB + d * 2 * GB)), takenAt: snapAt(d) } }); }
  };
  await makeSnaps(me.id, 10, 3, 80); // le relevé du jour 3 (3 h le 4 du mois) décrit le 3
  for (let i = 0; i < 4; i++) await makeSnaps(others[i].id, 1 + i * 2, -1, 0);
  await makeSnaps(bot.id, 500, -1, 0);

  // visionnage
  const cat = (await p.category.findFirst({ where: { adult: false, parentId: null } })) ?? (await p.category.create({ data: { name: 'Test ' + tag, slug: 'test-' + tag } }));
  const owner = others[0];
  const torrents = [];
  for (const [i, ep] of ['01', '02', '03'].entries()) torrents.push(await p.torrent.create({ data: { infoHash: require('crypto').randomBytes(20).toString('hex'), name: 'Youth' + tag + '.S01E' + ep + '.MULTI', filePath: '/x', size: 1000n, fileList: [], categoryId: cat.id, uploaderId: owner.id, status: 'APPROVED', season: '01', episode: ep, metaSource: 'tmdb', metaExternalId: 'x' + tag, coverImage: '/api/covers/x.jpg' } }));
  const film = await p.torrent.create({ data: { infoHash: require('crypto').randomBytes(20).toString('hex'), name: 'Mon.Film.' + tag, filePath: '/x', size: 1000n, fileList: [], categoryId: cat.id, uploaderId: owner.id, status: 'APPROVED' } });
  const adultCat = await p.category.create({ data: { name: 'Adulte ' + tag, slug: 'adulte-' + tag, adult: true } });
  const adult = await p.torrent.create({ data: { infoHash: require('crypto').randomBytes(20).toString('hex'), name: 'Adulte.' + tag, filePath: '/x', size: 1000n, fileList: [], categoryId: adultCat.id, uploaderId: owner.id, status: 'APPROVED' } });
  for (const t of torrents) await p.playbackPosition.create({ data: { userId: me.id, torrentId: t.id, fileIndex: 0, positionSeconds: 1500, durationSeconds: 2700 } });
  await p.playbackPosition.create({ data: { userId: me.id, torrentId: film.id, fileIndex: 0, positionSeconds: 6000, durationSeconds: 6000 } });
  await p.playbackPosition.create({ data: { userId: me.id, torrentId: adult.id, fileIndex: 0, positionSeconds: 3000, durationSeconds: 3000 } });

  // points et badges
  const hour = new Date(Math.floor(Date.now() / 3600_000) * 3600_000);
  await p.pointsLedger.create({ data: { userId: me.id, source: 'seed', hour, credit: 420, debit: 0, count: 5 } });
  await p.pointsLedger.create({ data: { userId: me.id, source: 'wheel', hour, credit: 80, debit: 20, count: 2 } });
  await p.pointsLedger.create({ data: { userId: others[0].id, source: 'seed', hour, credit: 100, debit: 0, count: 1 } });
  await p.pointsLedger.create({ data: { userId: others[1].id, source: 'seed', hour, credit: 900, debit: 0, count: 1 } });
  await p.userBadge.create({ data: { userId: me.id, code: 'PREMIER_PAS' } });

  check('sans connexion : refusé', (await call('/recap')).s === 401);
  check('mois invalide ou futur : refusé', (await call('/recap?mois=2026-13', T)).s === 400 && (await call('/recap?mois=2099-01', T)).s === 400);
  const r = await call('/recap?mois=' + key, T);
  check('récap du mois obtenu', r.s === 200 && r.b.month.key === key && r.b.month.current === true && r.b.months.length >= 1, r.raw.slice(0, 120));
  const s = r.b.sharing;
  check('partage : 10 Go par jour, un jour à 80 Go', Math.round(s.uploaded / GB) === 10 * days + 70 && s.hasData, `${Math.round(s.uploaded / GB)} Go sur ${days + 1} relevés`);
  check('meilleur jour de partage : le jour 3, 80 Go', s.best && s.best.day === `${key}-03` && Math.round(s.best.up / GB) === 80, JSON.stringify(s.best));
  check('séries : une série de 3 épisodes, le film à part, rien d\'adulte', r.b.watching.seriesCount === 1 && r.b.watching.series[0].episodes === 3 && r.b.watching.otherCount === 1 && !JSON.stringify(r.b.watching).includes('Adulte'), JSON.stringify(r.b.watching).slice(0, 200));
  check('points : 500 gagnés, 20 dépensés, par source', r.b.points.earned === 500 && r.b.points.spent === 20 && r.b.points.bySource[0].source === 'seed' && /torrent/i.test(r.b.points.bySource[0].label));
  check('badge du mois', r.b.badges.length === 1 && r.b.badges[0].name === 'Premier pas' && r.b.badges[0].points === 25);
  const c = r.b.compare;
  check('comparaison : je dépasse tous les autres en upload (le robot n\'est pas compté)', c.upload && c.upload.beatsPercent === 100 && c.upload.members === 4, JSON.stringify(c.upload));
  check('comparaison des points : devant 1 membre sur 2', c.points && c.points.beatsPercent === 50 && c.points.members === 2, JSON.stringify(c.points));
  check('la comparaison ne nomme personne', !r.raw.includes(tag + 'o'));
  const other = await call('/recap?mois=' + key, tok(others[2]));
  check('chacun voit son propre récap', other.s === 200 && other.b.watching.totalSeconds === 0 && other.b.points.earned === 0);

  const ids = [me.id, ...others.map((o) => o.id), bot.id];
  await p.pointsLedger.deleteMany({ where: { userId: { in: ids } } });
  await p.userBadge.deleteMany({ where: { userId: { in: ids } } });
  await p.playbackPosition.deleteMany({ where: { userId: { in: ids } } });
  await p.ratioSnapshot.deleteMany({ where: { userId: { in: ids } } });
  await p.torrent.deleteMany({ where: { id: { in: [...torrents.map((t) => t.id), film.id, adult.id] } } });
  await p.category.delete({ where: { id: adultCat.id } });
  await p.notification.deleteMany({ where: { userId: { in: ids } } });
  await p.user.deleteMany({ where: { id: { in: ids } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
