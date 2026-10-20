// Test de bout en bout : liste pour l'équipe des membres qui ont complété / pas complété un torrent (fiche du torrent et inspection d'un membre). Voir README.md.
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const BASE = E2E.BASE;
async function call(method, p, token) {
  const r = await fetch(BASE + p, { method, headers: token ? { Authorization: 'Bearer ' + token } : {} });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { s: r.status, b: j };
}
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
const tok = (u) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, E2E.SECRET, { expiresIn: '1h' });
const day = (n) => { const d = new Date(Date.now() - n * 86400_000); d.setUTCHours(0, 0, 0, 0); return d; };

(async () => {
  const p = new PrismaClient();
  const tag = 'cp' + Date.now().toString(36).slice(-5);
  const mk = (n, data = {}) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: 'x', createdAt: new Date(Date.now() - 90 * 86400_000), ...data } });
  const adm = await mk('a', { role: 'ADMIN' }), mod = await mk('o', { role: 'MODERATOR' }), up = await mk('u'), done = await mk('d'), leeching = await mk('l'), quit = await mk('q'), seeder = await mk('s'), plain = await mk('p');
  const cat = (await p.category.findFirst({ where: { adult: false, parentId: null } })) ?? (await p.category.create({ data: { name: 'Test ' + tag, slug: 'test-' + tag } }));
  const SIZE = 1_000_000_000n;
  const t = await p.torrent.create({ data: { infoHash: require('crypto').randomBytes(20).toString('hex'), name: 'Film.' + tag, filePath: '/x', size: SIZE, fileList: [], categoryId: cat.id, uploaderId: up.id, status: 'APPROVED' } });
  await p.snatch.create({ data: { torrentId: t.id, userId: done.id, seedSeconds: 7200, satisfied: false, hnr: true } });
  await p.snatch.create({ data: { torrentId: t.id, userId: seeder.id, seedSeconds: 400000, satisfied: true } });
  await p.peer.create({ data: { torrentId: t.id, userId: seeder.id, peerId: '-qB4650-aaaaaaaaaaaa', ip: '203.0.113.1', port: 5000, isSeeder: true, left: 0n } });
  await p.peer.create({ data: { torrentId: t.id, userId: leeching.id, peerId: '-qB4650-bbbbbbbbbbbb', ip: '203.0.113.2', port: 5001, isSeeder: false, left: 400_000_000n, downloaded: 600_000_000n } });
  await p.userTorrentFlow.create({ data: { userId: quit.id, torrentId: t.id, day: day(3), down: 250_000_000n, got: 250_000_000n, announces: 4 } });
  await p.userTorrentFlow.create({ data: { userId: done.id, torrentId: t.id, day: day(5), down: 1_000_000_000n, got: 1_000_000_000n, announces: 9 } });

  check('liste refusée à un membre ordinaire et sans connexion', (await call('GET', `/torrents/${t.id}/completion`, tok(plain))).s === 403 && (await call('GET', `/torrents/${t.id}/completion`)).s === 401);
  const r = await call('GET', `/torrents/${t.id}/completion`, tok(mod));
  check('modérateur : liste obtenue', r.s === 200 && Array.isArray(r.b.completed) && Array.isArray(r.b.unfinished));
  const c = (n) => r.b.completed.find((x) => x.user.username === tag + n);
  const u = (n) => r.b.unfinished.find((x) => x.user.username === tag + n);
  check('ont complété : les deux membres, avec seed et hit & run', r.b.completed.length === 2 && c('d')?.hnr === true && c('d')?.seedHours === 2 && c('s')?.satisfied === true && c('s')?.seedingNow === true);
  check('n\'ont pas complété : celui qui télécharge (60 %) et celui qui a arrêté (25 %)', r.b.unfinished.length === 2 && u('l')?.downloadingNow === true && u('l')?.progress === 60 && u('q')?.downloadingNow === false && u('q')?.progress === 25, JSON.stringify(r.b.unfinished.map((x) => [x.user.username, x.progress])));
  check('celui qui a terminé n\'est pas dans « non complétés » ; l\'envoyeur non plus', !u('d') && !u('s') && !u('u'));
  check('un membre qui a terminé n\'apparaît pas dans « complétés » deux fois', r.b.completed.filter((x) => x.user.username === tag + 'd').length === 1);

  const ins = await call('GET', `/admin/users/${quit.id}/inspect/unfinished`, tok(adm));
  check('inspection d\'un membre : ses téléchargements non terminés', ins.s === 200 && ins.b.total === 1 && ins.b.items[0].primary === 'Film.' + tag && /25 %/.test(ins.b.items[0].secondary), JSON.stringify(ins.b).slice(0, 150));
  const ins2 = await call('GET', `/admin/users/${done.id}/inspect/unfinished`, tok(adm));
  check('… et rien pour celui qui a tout terminé', ins2.s === 200 && ins2.b.total === 0);

  const ids = [adm.id, mod.id, up.id, done.id, leeching.id, quit.id, seeder.id, plain.id];
  await p.activityLog.deleteMany({ where: { userId: { in: ids } } });
  await p.torrent.delete({ where: { id: t.id } });
  await p.userTorrentFlow.deleteMany({ where: { userId: { in: ids } } });
  await p.user.deleteMany({ where: { id: { in: ids } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
