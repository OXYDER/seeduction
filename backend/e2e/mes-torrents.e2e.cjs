// Test de bout en bout : « Mes torrents » réunit seeds, téléchargements en cours, terminés et envois du membre en une liste (un torrent = une ligne), avec catégorie, dates et volumes. Voir README.md.
const crypto = require('crypto');
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const bcrypt = require(B + 'bcrypt');
const BASE = E2E.BASE;
const tok = (u) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, E2E.SECRET, { expiresIn: '1h' });
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
async function get(p, token) { const r = await fetch(BASE + p, { headers: { Authorization: 'Bearer ' + token } }); return { s: r.status, b: await r.json().catch(() => null) }; }

(async () => {
  const p = new PrismaClient();
  const admin = await E2E.getAdmin(p, bcrypt);
  const tag = 'mt' + Date.now().toString(36).slice(-5);
  const old = new Date(Date.now() - 60 * 86400_000);
  const me = await p.user.create({ data: { username: tag + 'm', email: tag + 'm@t.local', passwordHash: 'x', role: 'USER', createdAt: old } });
  const other = await p.user.create({ data: { username: tag + 'o', email: tag + 'o@t.local', passwordHash: 'x', role: 'USER', createdAt: old } });
  const parent = await p.category.create({ data: { name: 'Parent ' + tag, slug: 'par-' + tag } });
  const child = await p.category.create({ data: { name: 'Enfant ' + tag, slug: 'enf-' + tag, parentId: parent.id } });
  const ids = [];
  try {
    const mk = async (name, uploaderId, size, over = {}) => {
      const t = await p.torrent.create({ data: { infoHash: crypto.randomBytes(20).toString('hex'), name: `${name}.${tag}`, filePath: '/x', size, fileList: [], categoryId: child.id, uploaderId, status: 'APPROVED', ...over } });
      ids.push(t.id); return t;
    };
    const seeded = await mk('Termine.et.seede', other.id, 2_000_000_000n);
    const leech = await mk('En.cours', other.id, 4_000_000_000n);
    const done = await mk('Termine.non.seede', other.id, 1_000_000_000n);
    const mine = await mk('Mon.envoi', me.id, 3_000_000_000n);
    const now = new Date();
    const peer = (torrentId, isSeeder, left, up, down) => p.peer.create({ data: { torrentId, userId: me.id, peerId: crypto.randomBytes(10).toString('hex'), ip: '203.0.113.9', port: 51413, uploaded: BigInt(up), downloaded: BigInt(down), left: BigInt(left), isSeeder, lastAnnounceAt: now } });
    await peer(seeded.id, true, 0, 500_000_000, 0);
    await peer(leech.id, false, 1_000_000_000, 10_000_000, 3_000_000_000);
    await p.snatch.create({ data: { userId: me.id, torrentId: seeded.id, completedAt: new Date(Date.now() - 5 * 86400_000), seedSeconds: 80 * 3600, satisfied: true } });
    await p.snatch.create({ data: { userId: me.id, torrentId: done.id, completedAt: new Date(Date.now() - 9 * 86400_000), seedSeconds: 3600, satisfied: false } });
    const day = new Date(Date.now() - 6 * 86400_000); day.setUTCHours(0, 0, 0, 0);
    await p.userTorrentFlow.create({ data: { userId: me.id, torrentId: seeded.id, day, up: 1_500_000_000n, down: 2_000_000_000n, got: 2_000_000_000n, announces: 4 } });

    const r = await get('/bonus/my-torrents', tok(me));
    const rows = r.b?.items ?? [];
    const byName = (n) => rows.find((x) => x.name.startsWith(n));
    check('la liste contient les 4 torrents, une ligne chacun', r.s === 200 && rows.length === 4, `${rows.length}`);
    const a = byName('Termine.et.seede');
    check('terminé et en seed : seed en cours, obligation atteinte, volumes reçus/envoyés et ratio', a.seedingNow && a.completed && a.satisfied && a.receivedBytes === 2_000_000_000 && a.sentBytes === 1_500_000_000 && a.ratio === 0.75, JSON.stringify([a.seedingNow, a.satisfied, a.receivedBytes, a.sentBytes, a.ratio]));
    check('catégorie avec son parent', a.category?.name === child.name && a.category?.parent?.name === parent.name);
    const b = byName('En.cours');
    check('téléchargement en cours : 75 % (reste 1 Go sur 4), pas terminé', b.leechingNow && !b.completed && Math.abs(b.progress - 0.75) < 0.001, `${b.progress}`);
    const c = byName('Termine.non.seede');
    check('terminé mais ne seede plus : obligation à terminer (pas en seed)', c.completed && !c.seedingNow && c.state === 'idle' && !c.satisfied);
    const d = byName('Mon.envoi');
    check('mon envoi : marqué « own », aucune obligation', d.own && d.state === 'none');
    check('trié du plus récent au plus ancien (fin du téléchargement, sinon ajout)', new Date(rows[0].completedAt ?? rows[0].addedAt) >= new Date(rows[rows.length - 1].completedAt ?? rows[rows.length - 1].addedAt));
    check('sans connexion : refusé', (await fetch(BASE + '/bonus/my-torrents')).status === 401);
    void admin;
  } finally {
    await p.torrent.deleteMany({ where: { id: { in: ids } } });
    await p.category.deleteMany({ where: { id: { in: [child.id, parent.id] } } }).catch(() => undefined);
    await p.user.deleteMany({ where: { id: { in: [me.id, other.id] } } }).catch(() => undefined);
    await p.$disconnect();
  }
  console.log(fails ? `\n${fails} échec(s)` : '\nTout est OK');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
