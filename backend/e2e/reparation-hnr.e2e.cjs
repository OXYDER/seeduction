// Test de bout en bout : hit & run « en réparation » (le membre seede de nouveau le torrent) : plus de blocage des téléchargements, pastille et listes à jour. Voir README.md.
const crypto = require('crypto');
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const BASE = E2E.BASE;
const tok = (u) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, E2E.SECRET, { expiresIn: '1h' });
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
async function get(p, token) { const r = await fetch(BASE + p, { headers: { Authorization: 'Bearer ' + token } }); return { s: r.status, b: await r.json().catch(() => null) }; }

(async () => {
  const p = new PrismaClient();
  const tag = 'rp' + Date.now().toString(36).slice(-5);
  const member = await p.user.create({ data: { username: tag + 'm', email: tag + 'm@t.local', passwordHash: 'x', role: 'USER', createdAt: new Date(Date.now() - 60 * 86400_000) } });
  const other = await p.user.create({ data: { username: tag + 'o', email: tag + 'o@t.local', passwordHash: 'x', role: 'USER', createdAt: new Date(Date.now() - 60 * 86400_000) } });
  const T = tok(member);
  const cat = (await p.category.findFirst({ where: { adult: false, parentId: null } })) ?? (await p.category.create({ data: { name: 'Test ' + tag, slug: 'test-' + tag } }));
  const mkTorrent = (n) => p.torrent.create({ data: { infoHash: crypto.randomBytes(20).toString('hex'), name: `Film.${n}.${tag}`, filePath: '/x', size: 1_000_000n, fileList: [], categoryId: cat.id, uploaderId: other.id, status: 'APPROVED' } });
  const torrents = [];
  try {
    // 5 hit & run confirmés (la limite qui bloque les téléchargements), aucun seed en cours
    for (let i = 0; i < 5; i++) {
      const t = await mkTorrent('H' + i); torrents.push(t);
      await p.snatch.create({ data: { userId: member.id, torrentId: t.id, completedAt: new Date(Date.now() - 3 * 86400_000), seedSeconds: 60 * 3600, lastSeedAt: new Date(Date.now() - 10 * 3600_000), hnr: true, satisfied: false } });
    }
    const target = await mkTorrent('Nouveau'); torrents.push(target);
    const announce = async (t, n) => {
      const enc = [...Buffer.from(t.infoHash, 'hex')].map((b) => '%' + b.toString(16).padStart(2, '0')).join('');
      const url = `${BASE.replace(/\/api$/, '')}/tracker/${member.passkey}/announce?info_hash=${enc}&peer_id=${encodeURIComponent('-qB4650-' + (tag + n).padEnd(12, '0').slice(0, 12))}&port=51413&uploaded=0&downloaded=0&left=500000&event=started&compact=1&numwant=5`;
      const r = await fetch(url, { headers: { 'X-Forwarded-For': '203.0.113.' + (50 + n) } });
      return { s: r.status, t: await r.text() };
    };

    let me = (await get('/bonus/me', T)).b;
    check('5 hit & run, aucun seed : 5 cas, aucun en réparation', me.unresolved.length === 5 && me.unresolved.every((u) => u.repairing === false));
    const blocked = await announce(target, 1);
    check('la limite de 5 bloque un nouveau téléchargement', blocked.s === 200 && /abandonn/.test(blocked.t) || blocked.s === 403, `${blocked.s} ${blocked.t.slice(0, 80)}`);

    // Le membre seede de nouveau le premier torrent (ligne de pair active)
    await p.peer.create({ data: { torrentId: torrents[0].id, userId: member.id, peerId: '-qB4650-' + tag.padEnd(12, 'x').slice(0, 12), ip: '203.0.113.9', port: 51413, uploaded: 0n, downloaded: 0n, left: 0n, isSeeder: true, lastAnnounceAt: new Date() } });
    me = (await get('/bonus/me', T)).b;
    const u0 = me.unresolved.find((u) => u.torrentId === torrents[0].id);
    check('il seede de nouveau le torrent : son cas est « en réparation », les autres non', u0.repairing === true && me.unresolved.filter((u) => u.repairing).length === 1);
    const seeds = (await get('/bonus/seeds', T)).b;
    const s0 = seeds.items.find((i) => i.torrentId === torrents[0].id);
    check('« Seeds à terminer » : statut « repairing » et compteurs séparés', s0.status === 'repairing' && seeds.counts.repairing === 1 && seeds.counts.hnr === 4);
    const mine = (await get('/bonus/my-seeds', T)).b;
    const m0 = mine.items.find((i) => i.torrentId === torrents[0].id);
    check('« Mes seeds » : le cas est marqué en réparation, la pastille compte 4', m0.state === 'hnr' && m0.repairing === true && mine.counts.hnr === 4 && mine.counts.repairing === 1);
    const hnr = (await get('/bonus/hnr', T)).b;
    check('la page Hit & run montre toujours les 5 cas (celui-ci « seedé à nouveau »)', hnr.items.length === 5 && hnr.items.find((i) => i.torrentId === torrents[0].id).seedingNow === true);

    const ok = await announce(target, 2);
    check('en réparation : le nouveau téléchargement n\'est plus bloqué', ok.s === 200 && !/abandonn/.test(ok.t), `${ok.s} ${ok.t.slice(0, 80)}`);

    // Il s'arrête de nouveau : la ligne devient trop vieille, le cas redevient un hit & run et la limite s'applique
    await p.peer.updateMany({ where: { userId: member.id, torrentId: torrents[0].id }, data: { lastAnnounceAt: new Date(Date.now() - 2 * 3600_000) } });
    me = (await get('/bonus/me', T)).b;
    check('plus de seed : le cas redevient un hit & run', me.unresolved.every((u) => u.repairing === false));
    const t7 = await mkTorrent('Encore'); torrents.push(t7);
    const again = await announce(t7, 3);
    check('et la limite bloque de nouveau les téléchargements', /abandonn/.test(again.t) || again.s === 403, `${again.s} ${again.t.slice(0, 80)}`);
  } finally {
    await p.torrent.deleteMany({ where: { id: { in: torrents.map((t) => t.id) } } });
    await p.user.deleteMany({ where: { id: { in: [member.id, other.id] } } }).catch(() => undefined);
    await p.$disconnect();
  }
  console.log(fails ? `\n${fails} échec(s)` : '\nTout est OK');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
