// Test de bout en bout : un membre anonyme apparaît comme « Anonyme » pour les autres membres (torrent, profil, recherche) mais pas pour l'équipe ni pour lui-même ; l'équipe le règle par PATCH /admin/users/:id. Voir README.md.
const crypto = require('crypto');
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const bcrypt = require(B + 'bcrypt');
const BASE = E2E.BASE;
const tok = (u) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, E2E.SECRET, { expiresIn: '1h' });
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
async function call(m, p, t, body) { const r = await fetch(BASE + p, { method: m, headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, b: await r.json().catch(() => null) }; }

(async () => {
  const p = new PrismaClient();
  const admin = await E2E.getAdmin(p, bcrypt);
  const tag = 'an' + Date.now().toString(36).slice(-5);
  const mk = (n) => p.user.create({ data: { username: tag + n, email: `${tag}${n}@t.local`, passwordHash: 'x', role: 'USER', createdAt: new Date(Date.now() - 60 * 86400_000) } });
  const secret = await mk('secret'), other = await mk('autre');
  const cat = (await p.category.findFirst({ where: { adult: false, parentId: null } })) ?? (await p.category.create({ data: { name: 'T' + tag, slug: 't-' + tag } }));
  const t = await p.torrent.create({ data: { infoHash: crypto.randomBytes(20).toString('hex'), name: `Film.${tag}`, filePath: '/x', size: 1_000_000_000n, fileList: [], categoryId: cat.id, uploaderId: secret.id, status: 'APPROVED' } });
  try {
    const TA = tok(admin), TO = tok(other), TS = tok(secret);
    const before = await call('GET', `/torrents/${t.id}`, TO);
    check('avant : le pseudo de l\'envoyeur est visible', before.b?.uploader?.username === secret.username, JSON.stringify(before.b?.uploader));

    const set = await call('PATCH', `/admin/users/${secret.id}`, TA, { anonymous: true });
    check('l\'équipe rend le membre anonyme', set.s === 200 && set.b?.anonymous === true, String(set.s));

    const after = await call('GET', `/torrents/${t.id}`, TO);
    check('après : un autre membre voit « Anonyme »', after.b?.uploader?.username === 'Anonyme' && after.b?.uploader?.anonymous === true, JSON.stringify(after.b?.uploader));
    check('l\'équipe voit toujours le vrai pseudo', (await call('GET', `/torrents/${t.id}`, TA)).b?.uploader?.username === secret.username);
    check('le membre se voit lui-même', (await call('GET', `/torrents/${t.id}`, TS)).b?.uploader?.username === secret.username);
    check('sa page de profil est fermée aux autres membres (404)', (await call('GET', `/users/${secret.id}`, TO)).s === 404);
    check('son profil reste ouvert à l\'équipe et à lui-même', (await call('GET', `/users/${secret.id}`, TA)).s === 200 && (await call('GET', `/users/${secret.id}`, TS)).s === 200);
    const found = await call('GET', `/search/suggest?q=${encodeURIComponent(secret.username)}&scopes=users`, TO);
    check('on ne le trouve pas par son pseudo dans la recherche', (found.b?.users ?? []).length === 0, JSON.stringify(found.b?.users));
    check('mais l\'équipe le trouve', ((await call('GET', `/search/suggest?q=${encodeURIComponent(secret.username)}&scopes=users`, TA)).b?.users ?? []).length === 1);

    await call('PATCH', `/admin/users/${secret.id}`, TA, { anonymous: false });
    check('redevenu normal : le pseudo réapparaît', (await call('GET', `/torrents/${t.id}`, TO)).b?.uploader?.username === secret.username);
  } finally {
    await p.torrent.deleteMany({ where: { id: t.id } });
    await p.user.deleteMany({ where: { id: { in: [secret.id, other.id] } } }).catch(() => undefined);
    await p.$disconnect();
  }
  console.log(fails ? `\n${fails} échec(s)` : '\nTout est OK');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
