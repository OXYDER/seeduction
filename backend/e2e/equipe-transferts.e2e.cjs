// Test de bout en bout : l'équipe n'est pas comptabilisée (upload, téléchargé, ratio) et n'apparaît pas dans les classements ; un client dont la ligne de pair a été purgée n'est pas crédité deux fois. Voir README.md.
const crypto = require('crypto');
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const BASE = E2E.BASE;
const tok = (u) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, E2E.SECRET, { expiresIn: '1h' });
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(p, token) { const r = await fetch(BASE + p, { headers: { Authorization: 'Bearer ' + token } }); return { s: r.status, b: await r.json().catch(() => null) }; }

(async () => {
  const p = new PrismaClient();
  const tag = 'eq' + Date.now().toString(36).slice(-5);
  const old = new Date(Date.now() - 90 * 86400_000);
  const mk = (n, role = 'USER', extra = {}) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: 'x', role, createdAt: old, ...extra } });
  const TB = 1_000_000_000_000n;
  const staff = await mk('s', 'MODERATOR', { uploaded: 2n * TB, downloaded: 10_000_000n }); // énorme upload : il serait premier des classements
  const member = await mk('m', 'USER', { uploaded: 5_000_000_000n, downloaded: 1_000_000_000n });
  const rich = await mk('r', 'USER', { uploaded: 1n * TB, downloaded: 100_000_000_000n });
  const poor = await mk('p', 'USER', { uploaded: 1_000_000_000n, downloaded: 100_000_000_000n }); // ratio 0,01 : sous le minimum du site
  const cat = (await p.category.findFirst({ where: { adult: false, parentId: null } })) ?? (await p.category.create({ data: { name: 'Test ' + tag, slug: 'test-' + tag } }));
  const mkTorrent = (n) => p.torrent.create({ data: { infoHash: crypto.randomBytes(20).toString('hex'), name: `Film.${n}.${tag}`, filePath: '/x', size: 5_000_000_000n, fileList: [], categoryId: cat.id, uploaderId: rich.id, status: 'APPROVED' } });
  const torrents = [];
  let ip = 20;
  const announce = async (user, t, q) => {
    const enc = [...Buffer.from(t.infoHash, 'hex')].map((b) => '%' + b.toString(16).padStart(2, '0')).join('');
    const peerId = '-qB4650-' + (tag + user.username.slice(-1)).padEnd(12, '0').slice(0, 12);
    const url = `${BASE.replace(/\/api$/, '')}/tracker/${user.passkey}/announce?info_hash=${enc}&peer_id=${encodeURIComponent(peerId)}&port=51413&uploaded=${q.up}&downloaded=${q.down}&left=${q.left}${q.event ? '&event=' + q.event : ''}&compact=1&numwant=5`;
    const r = await fetch(url, { headers: { 'X-Forwarded-For': '203.0.113.' + (ip++) } });
    return { s: r.status, t: await r.text() };
  };
  const totals = async (u) => { const r = await p.user.findUnique({ where: { id: u.id }, select: { uploaded: true, downloaded: true } }); return { up: r.uploaded, down: r.downloaded }; };
  try {
    const t1 = await mkTorrent('A'); torrents.push(t1);
    // ── L'équipe : rien n'est ajouté à son compte, même en téléchargeant et en envoyant
    const s0 = await totals(staff);
    await announce(staff, t1, { up: 0, down: 0, left: 5_000_000_000, event: 'started' });
    await announce(staff, t1, { up: 3_000_000, down: 50_000_000, left: 4_950_000_000 });
    await announce(staff, t1, { up: 9_000_000, down: 120_000_000, left: 4_880_000_000 });
    const s1 = await totals(staff);
    check('équipe : ni upload ni téléchargé ajoutés à son compte', s1.up === s0.up && s1.down === s0.down, `${s1.up}/${s1.down}`);

    // ── Un membre ordinaire est comptabilisé normalement
    const m0 = await totals(member);
    await announce(member, t1, { up: 0, down: 0, left: 5_000_000_000, event: 'started' });
    await announce(member, t1, { up: 3_000_000, down: 50_000_000, left: 4_950_000_000 });
    await announce(member, t1, { up: 9_000_000, down: 120_000_000, left: 4_880_000_000 });
    const m1 = await totals(member);
    check('membre : ses transferts sont comptés (+9 Mo envoyés, +120 Mo reçus)', m1.up - m0.up === 9_000_000n && m1.down - m0.down === 120_000_000n, `${m1.up - m0.up}/${m1.down - m0.down}`);

    // ── Ratio minimum : un membre au ratio trop bas est refusé, l'équipe non
    const t2 = await mkTorrent('B'); torrents.push(t2);
    const low = await announce(poor, t2, { up: 0, down: 0, left: 5_000_000_000, event: 'started' });
    check('membre au ratio trop bas : refusé (contrôle)', /Ratio insuffisant|ratio/i.test(low.t) || low.s === 403, low.t.slice(0, 70));
    await p.user.update({ where: { id: staff.id }, data: { uploaded: 0n, downloaded: 900_000_000_000n } });
    const lowStaff = await announce(staff, t2, { up: 0, down: 0, left: 5_000_000_000, event: 'started' });
    check('équipe : aucun ratio minimum imposé', !/Ratio insuffisant/i.test(lowStaff.t) && lowStaff.s === 200, lowStaff.t.slice(0, 70));
    await p.user.update({ where: { id: staff.id }, data: { uploaded: 2n * TB, downloaded: 10_000_000n } });

    // ── Double comptage : ligne de pair purgée en pleine session (pas de « started »)
    const t3 = await mkTorrent('C'); torrents.push(t3);
    await announce(member, t3, { up: 0, down: 0, left: 5_000_000_000, event: 'started' });
    await announce(member, t3, { up: 1_000_000, down: 40_000_000, left: 4_960_000_000 });
    const a = await totals(member);
    await p.peer.deleteMany({ where: { userId: member.id, torrentId: t3.id } }); // purge (45 min sans annonce : déploiement, mise en veille...)
    await announce(member, t3, { up: 2_000_000, down: 80_000_000, left: 4_920_000_000 });
    const b = await totals(member);
    check('ligne purgée puis annonce sans « started » : la session n\'est pas recomptée', b.up === a.up && b.down === a.down, `+${b.up - a.up}/+${b.down - a.down}`);
    await announce(member, t3, { up: 3_000_000, down: 100_000_000, left: 4_900_000_000 });
    const c = await totals(member);
    check('…et la suite est comptée normalement (+1 Mo, +20 Mo)', c.up - b.up === 1_000_000n && c.down - b.down === 20_000_000n, `+${c.up - b.up}/+${c.down - b.down}`);
    await p.peer.deleteMany({ where: { userId: member.id, torrentId: t3.id } });
    await announce(member, t3, { up: 0, down: 5_000_000, left: 4_995_000_000, event: 'started' });
    const d = await totals(member);
    check('un vrai démarrage (« started ») est compté', d.down - c.down === 5_000_000n, `+${d.down - c.down}`);

    // ── Classements et statistiques : sans l'équipe
    const boards = (await get('/stats/members', TOKEN(member))).b;
    const names = (k) => (boards?.boards?.[k] ?? []).map((r) => r.user.username);
    check('classement upload : l\'équipe n\'y est pas, les membres oui', !names('uploadVolume').includes(staff.username) && names('uploadVolume').includes(rich.username));
    check('classement ratio : sans l\'équipe', !names('ratioHigh').includes(staff.username) && !names('ratioLow').includes(staff.username));
    const lb = (await get('/users/leaderboard', TOKEN(member))).b;
    check('classement des membres : sans l\'équipe', Array.isArray(lb) && !lb.some((u) => u.username === staff.username) && lb.some((u) => u.username === rich.username));
    const me = (await get('/stats/me', TOKEN(member))).b;
    check('ma position : calculée sans l\'équipe (l\'équipe ne passe pas devant moi)', me && me.uploadRank != null && me.uploadRank <= 5, JSON.stringify(me).slice(0, 80));
  } finally {
    await p.torrent.deleteMany({ where: { id: { in: torrents.map((t) => t.id) } } });
    await p.user.deleteMany({ where: { id: { in: [staff.id, member.id, rich.id, poor.id] } } }).catch(() => undefined);
    await p.$disconnect();
  }
  console.log(fails ? `\n${fails} échec(s)` : '\nTout est OK');
  process.exit(fails ? 1 : 0);

  function TOKEN(u) { return tok(u); }
})().catch((e) => { console.error(e); process.exit(2); });
