// Test de bout en bout : suppression d'un compte = anonymisation (pseudo réservé, statistiques et torrents conservés, données privées effacées). Voir README.md.
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
const PWD = 'Mot-de-passe-test-1';

(async () => {
  const p = new PrismaClient();
  const tag = 'del' + Date.now().toString(36).slice(-5);
  const hash = await bcrypt.hash(PWD, 4);
  const old = new Date(Date.now() - 60 * 86400_000);
  const adm = await p.user.create({ data: { username: tag + 'a', email: tag + 'a@t.local', passwordHash: hash, createdAt: old, role: 'ADMIN' } });
  const mem = await p.user.create({ data: { username: tag + 'Membre', email: tag + 'm@t.local', passwordHash: hash, createdAt: old, lastIp: '203.0.113.9', uploaded: 5_000_000n, downloaded: 1_000_000n, bonusPoints: 42 } });
  const other = await p.user.create({ data: { username: tag + 'o', email: tag + 'o@t.local', passwordHash: hash, createdAt: old } });
  const TA = tok(adm), TO = tok(other);
  const oldPasskey = mem.passkey;
  const cat = (await p.category.findFirst({ where: { adult: false, parentId: null } })) ?? (await p.category.create({ data: { name: 'Test ' + tag, slug: 'test-' + tag } }));
  const t = await p.torrent.create({ data: { infoHash: require('crypto').randomBytes(20).toString('hex'), name: 'Film.' + tag, filePath: '/x', size: 1_000_000n, fileList: [], categoryId: cat.id, uploaderId: mem.id, status: 'APPROVED' } });
  await p.notification.create({ data: { userId: mem.id, type: 'test', title: 'x', body: 'y' } }).catch(() => undefined);
  await p.activityLog.create({ data: { userId: mem.id, action: 'LOGIN', ip: '203.0.113.9' } }).catch(() => undefined);

  check('connexion possible avant la suppression', (await call('POST', '/auth/login', null, { usernameOrEmail: mem.username, password: PWD })).s === 201);
  check('mauvais pseudo de confirmation : refusé', (await call('POST', `/admin/users/${mem.id}/delete`, TA, { password: PWD, confirmUsername: 'autre' })).s === 400);
  const del = await call('POST', `/admin/users/${mem.id}/delete`, TA, { password: PWD, confirmUsername: mem.username });
  check('suppression par un administrateur', del.s === 201 && del.b?.deleted === true, del.raw.slice(0, 120));

  const u = await p.user.findUnique({ where: { id: mem.id } });
  check('le compte existe toujours, marqué supprimé, avec son pseudo', !!u && !!u.deletedAt && u.username === mem.username && u.status === 'DISABLED');
  check('courriel, mot de passe, passkey et IP effacés', u.email !== mem.email && u.email.endsWith('@seeduction.invalid') && u.passwordHash === '!' && u.passkey !== oldPasskey && u.lastIp === null);
  check('statistiques conservées', u.uploaded === 5_000_000n && u.downloaded === 1_000_000n && Math.round(u.bonusPoints) === 42);
  check('torrent conservé, toujours à son nom', (await p.torrent.findUnique({ where: { id: t.id } }))?.uploaderId === mem.id);
  check('notifications effacées', (await p.notification.count({ where: { userId: mem.id } })) === 0);
  check('adresses IP du journal effacées', (await p.activityLog.count({ where: { userId: mem.id, ip: { not: null } } })) === 0);
  const log = await p.activityLog.findFirst({ where: { userId: adm.id, action: 'USER_DELETE' }, orderBy: { createdAt: 'desc' } });
  check('journal de suppression sans courriel', !!log && !JSON.stringify(log.meta).includes(mem.email));

  check('connexion impossible (pseudo et ancien courriel)', (await call('POST', '/auth/login', null, { usernameOrEmail: mem.username, password: PWD })).s === 401 && (await call('POST', '/auth/login', null, { usernameOrEmail: mem.email, password: PWD })).s === 401);
  const reg = (name) => call('POST', '/auth/register', null, { inviteCode: 'x', username: name, email: name + '@t.local', password: PWD });
  const r1 = await reg(mem.username), r2 = await reg(mem.username.toUpperCase());
  check('pseudo réservé (même en majuscules)', r1.s === 400 && /pris|réservé/.test(r1.raw) && r2.s === 400 && /pris|réservé/.test(r2.raw), r1.raw.slice(0, 100));

  const ids = await call('GET', '/users/deleted-ids', TO);
  check('liste des comptes supprimés (identifiants seulement)', ids.s === 200 && ids.b.includes(mem.id) && !ids.raw.includes('@'));
  const prof = await call('GET', `/users/${mem.id}`, TO);
  check('profil : indicateur « supprimé », sans courriel ni passkey', prof.s === 200 && prof.b.deleted === true && !prof.raw.includes('seeduction.invalid') && !prof.raw.includes(oldPasskey));
  check('un compte ordinaire n\'est pas marqué supprimé', (await call('GET', `/users/${other.id}`, TO)).b.deleted === false);
  const tl = await call('GET', `/torrents/${t.id}`, TO);
  check('la fiche du torrent montre toujours le pseudo', tl.s === 200 && JSON.stringify(tl.b).includes(mem.username));

  await p.activityLog.deleteMany({ where: { userId: { in: [adm.id, mem.id, other.id] } } });
  await p.torrent.delete({ where: { id: t.id } });
  await p.user.deleteMany({ where: { id: { in: [adm.id, mem.id, other.id] } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
