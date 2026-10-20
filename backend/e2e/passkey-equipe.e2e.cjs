// Test de bout en bout : passkey visible par l'équipe (rangs, journal) et compte « [compte supprimé] » distinct du robot (seeds comptés pour le robot, stats rendues). Voir README.md.
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const bcrypt = require(B + 'bcrypt');
const BASE = E2E.BASE;
async function call(method, p, token, body) {
  const r = await fetch(BASE + p, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch {} return { s: r.status, b: j, raw: text };
}
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
const tok = (u) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, E2E.SECRET, { expiresIn: '1h' });
const DEAD = '00000000-0000-4000-8000-00000000dead';

(async () => {
  const p = new PrismaClient();
  const tag = 'pk' + Date.now().toString(36).slice(-5);
  const hash = await bcrypt.hash('Mot-de-passe-test-1', 4);
  await E2E.getAdmin(p, bcrypt);
  const mk = (n, role = 'USER') => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: new Date(Date.now() - 60 * 86400_000), role } });
  const mod = await mk('m', 'MODERATOR'), sup = await mk('s', 'SUPER_MODERATOR'), sup2 = await mk('t', 'SUPER_MODERATOR'), adm = await mk('a', 'ADMIN'), member = await mk('u');
  const [TM, TS, TA, TU] = [mod, sup, adm, member].map(tok);
  const pk = async (id) => (await p.user.findUnique({ where: { id }, select: { passkey: true } })).passkey;

  check('sans connexion, membre ordinaire ou modérateur : refusé', (await call('GET', `/admin/users/${member.id}/passkey`)).s === 401 && (await call('GET', `/admin/users/${member.id}/passkey`, TU)).s === 403 && (await call('GET', `/admin/users/${member.id}/passkey`, TM)).s === 403);
  const v = await call('GET', `/admin/users/${member.id}/passkey`, TS);
  check('super-modérateur : voit la passkey d\'un membre', v.s === 200 && v.b.passkey === (await pk(member.id)) && v.b.username === tag + 'u', v.raw.slice(0, 80));
  const log = await p.activityLog.findFirst({ where: { userId: sup.id, action: 'USER_PASSKEY_VIEW' } });
  check('chaque affichage est inscrit au journal (sans la passkey elle-même)', !!log && log.meta.targetId === member.id && !JSON.stringify(log.meta).includes(v.b.passkey));
  check('un super-modérateur ne voit ni celle d\'un égal ni celle d\'un administrateur', (await call('GET', `/admin/users/${sup2.id}/passkey`, TS)).s === 403 && (await call('GET', `/admin/users/${adm.id}/passkey`, TS)).s === 403);
  check('un administrateur voit celle d\'un super-modérateur et la sienne', (await call('GET', `/admin/users/${sup.id}/passkey`, TA)).s === 200 && (await call('GET', `/admin/users/${adm.id}/passkey`, TA)).b.passkey === (await pk(adm.id)));
  check('membre inconnu : 404', (await call('GET', '/admin/users/inconnu/passkey', TA)).s === 404);
  const lm = await call('GET', '/staff/mod-log?action=USER_PASSKEY_VIEW&pageSize=100', TA);
  check('visible dans le journal de modération, marqué sensible', lm.b.items.some((i) => i.actor?.id === sup.id && i.severity === 'grave' && /passkey/.test(i.label)));

  // ---- compte « [compte supprimé] » : robot distinct, seeds comptés pour le robot
  const { AccountDeletionService } = require(E2E.DIST + 'admin/account-deletion.service.js');
  await new AccountDeletionService(p).ensureTombstone();
  const robot = await p.user.findFirst({ where: { profileType: 'BOT', id: { not: DEAD } }, orderBy: { createdAt: 'asc' } });
  check('le robot existe et n\'est pas le compte supprimé', !!robot && robot.id !== DEAD);
  check('passkey du compte supprimé : administrateurs seulement', (await call('GET', `/admin/users/${DEAD}/passkey`, TS)).s === 403 && (await call('GET', `/admin/users/${DEAD}/passkey`, TA)).s === 200);
  const cat = (await p.category.findFirst({ where: { adult: false, parentId: null } })) ?? (await p.category.create({ data: { name: 'Test ' + tag, slug: 'test-' + tag } }));
  const infoHash = require('crypto').randomBytes(20).toString('hex');
  const t = await p.torrent.create({ data: { infoHash, name: 'Film.' + tag, filePath: '/x', size: 1_000_000n, fileList: [], categoryId: cat.id, uploaderId: member.id, status: 'APPROVED' } });
  const ghostBefore = await p.user.findUnique({ where: { id: DEAD }, select: { passkey: true, uploaded: true } });
  const hex = Buffer.from(infoHash, 'hex'); const encHash = [...hex].map((b) => '%' + b.toString(16).padStart(2, '0')).join('');
  const peerId = '-qB4650-' + tag.padEnd(12, '0').slice(0, 12);
  const url = `${BASE.replace(/\/api$/, '')}/tracker/${ghostBefore.passkey}/announce?info_hash=${encHash}&peer_id=${encodeURIComponent(peerId)}&port=51413&uploaded=0&downloaded=0&left=0&event=started&compact=1&numwant=10`;
  const ann = await fetch(url, { headers: { 'X-Forwarded-For': '203.0.113.77' } });
  const annBody = await ann.text();
  await new Promise((r) => setTimeout(r, 300));
  const peers = await p.peer.findMany({ where: { torrentId: t.id } });
  check('seed annoncé avec la passkey du compte supprimé : compté pour le robot', ann.status === 200 && peers.length === 1 && peers[0].userId === robot.id, `${ann.status} ${annBody.slice(0, 60)} peers=${peers.map((x) => x.userId === DEAD ? 'SUPPRIMÉ' : x.userId === robot.id ? 'robot' : x.userId)}`);

  // ---- réparation au démarrage : envois, points et badges du compte supprimé reviennent au robot
  await p.user.update({ where: { id: DEAD }, data: { uploaded: 5_000_000n, bonusPoints: 777 } });
  await p.userBadge.create({ data: { userId: DEAD, code: 'PREMIER_PAS' } }).catch(() => undefined);
  const r0 = await p.user.findUnique({ where: { id: robot.id }, select: { uploaded: true, bonusPoints: true } });
  const { SupportBotService } = require(E2E.DIST + 'support/support-bot.service.js');
  await new SupportBotService(p, { on() {} }, { config: async () => ({ botName: robot.username }) }, {}, {}).ensureBot();
  const g = await p.user.findUnique({ where: { id: DEAD }, select: { uploaded: true, bonusPoints: true } });
  const r1 = await p.user.findUnique({ where: { id: robot.id }, select: { uploaded: true, bonusPoints: true } });
  check('réparation : le compte supprimé est remis à zéro (envois, points, badges)', g.uploaded === 0n && g.bonusPoints === 0 && (await p.userBadge.count({ where: { userId: DEAD } })) === 0);
  check('… et le robot récupère ces envois et ces points', r1.uploaded - r0.uploaded === 5_000_000n && r1.bonusPoints - r0.bonusPoints === 777, `${r1.uploaded - r0.uploaded} / ${r1.bonusPoints - r0.bonusPoints}`);

  // ---- nettoyage
  await p.peer.deleteMany({ where: { torrentId: t.id } });
  await p.torrent.delete({ where: { id: t.id } });
  await p.snatch.deleteMany({ where: { torrentId: t.id } }).catch(() => undefined);
  await p.user.update({ where: { id: robot.id }, data: { uploaded: r0.uploaded, bonusPoints: r0.bonusPoints } });
  await p.pointsLedger.deleteMany({ where: { userId: { in: [DEAD, robot.id] }, source: 'autre', hour: { gte: new Date(Date.now() - 3600_000) } } });
  await p.activityLog.deleteMany({ where: { userId: { in: [mod.id, sup.id, sup2.id, adm.id, member.id] } } });
  await p.user.deleteMany({ where: { id: { in: [mod.id, sup.id, sup2.id, adm.id, member.id] } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
