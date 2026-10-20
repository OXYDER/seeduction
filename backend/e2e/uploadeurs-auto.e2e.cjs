// Test de bout en bout : rang « Uploadeur » automatique (promotion, refus, rétrogradation, rangs nommés à la main épargnés, approbation à l'envoi, journal). Voir README.md.
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const BASE = E2E.BASE;
async function call(method, p, token, body) {
  const r = await fetch(BASE + p, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { s: r.status, b: j };
}
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
const tok = (u) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, E2E.SECRET, { expiresIn: '1h' });
const DAY = 86_400_000;

(async () => {
  const p = new PrismaClient();
  const tag = 'up' + Date.now().toString(36).slice(-5);
  const mk = (n, data = {}) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: 'x', createdAt: new Date(Date.now() - 120 * DAY), ...data } });
  const adm = await mk('a', { role: 'ADMIN' }), good = await mk('g'), sloppy = await mk('s'), manual = await mk('m', { role: 'UPLOADER' }), idle = await mk('i', { role: 'UPLOADER', autoUploaderAt: new Date(Date.now() - 100 * DAY) }), plain = await mk('p');
  const TA = tok(adm), TP = tok(plain);
  const cat = (await p.category.findFirst({ where: { adult: false, parentId: null } })) ?? (await p.category.create({ data: { name: 'Test ' + tag, slug: 'test-' + tag } }));
  const made = [];
  const addTorrents = async (uploaderId, n, daysAgoFrom = 5, status = 'APPROVED') => {
    for (let i = 0; i < n; i++) made.push((await p.torrent.create({ data: { infoHash: require('crypto').randomBytes(20).toString('hex'), name: 'T.' + tag + uploaderId.slice(0, 4) + i, filePath: '/x', size: 1_000_000n, fileList: [], categoryId: cat.id, uploaderId, status, createdAt: new Date(Date.now() - (daysAgoFrom + i) * DAY) } })).id);
  };
  await addTorrents(good.id, 20);
  await addTorrents(sloppy.id, 20);
  // 6 des torrents du « brouillon » ont reçu une demande de correction : trop pour la promotion
  for (const id of made.slice(20, 26)) await p.activityLog.create({ data: { userId: adm.id, action: 'TORRENT_HOLD', meta: { torrentId: id } } });
  await addTorrents(idle.id, 3, 90);

  check('réglages et liste : refusés à un membre ordinaire', (await call('GET', '/admin/trusted-uploaders', TP)).s === 403 && (await call('POST', '/admin/trusted-uploaders/run', TP)).s === 403);
  const before = (await call('GET', '/admin/trusted-uploaders', TA)).b;
  check('liste : réglages, Uploadeurs et candidats', before?.config?.enabled === true && Array.isArray(before.trusted) && before.candidates.some((c) => c.username === good.username && c.ready));

  const run = await call('POST', '/admin/trusted-uploaders/run', TA);
  check('évaluation lancée', run.s === 201 && run.b?.checked > 0, JSON.stringify(run.b).slice(0, 120));
  const g = await p.user.findUnique({ where: { id: good.id } });
  check('membre assidu et sans faute : promu Uploadeur (automatique)', g.role === 'UPLOADER' && !!g.autoUploaderAt);
  check('membre avec trop de corrections : pas promu', (await p.user.findUnique({ where: { id: sloppy.id } })).role === 'USER');
  const m = await p.user.findUnique({ where: { id: manual.id } });
  check('Uploadeur nommé à la main : jamais rétrogradé automatiquement', m.role === 'UPLOADER' && m.autoUploaderAt === null);
  const i = await p.user.findUnique({ where: { id: idle.id } });
  check('Uploadeur automatique inactif depuis trop longtemps : rang retiré', i.role === 'USER' && i.autoUploaderAt === null);
  check('promotion et rétrogradation inscrites au journal (acteur « système »)', (await p.activityLog.count({ where: { userId: null, action: 'UPLOADER_AUTO_PROMOTE', meta: { path: ['targetId'], equals: good.id } } })) === 1 && (await p.activityLog.count({ where: { userId: null, action: 'UPLOADER_AUTO_DEMOTE', meta: { path: ['targetId'], equals: idle.id } } })) === 1);
  check('les deux sont prévenus par notification', (await p.notification.count({ where: { userId: good.id, title: { contains: 'Uploadeur' } } })) === 1 && (await p.notification.count({ where: { userId: idle.id, title: { contains: 'Uploadeur' } } })) === 1);
  const again = await call('POST', '/admin/trusted-uploaders/run', TA);
  check('relancée : rien ne change, aucun doublon', !again.b.promoted.includes(good.username) && (await p.notification.count({ where: { userId: good.id, title: { contains: 'Uploadeur' } } })) === 1);

  // approbation à l'envoi
  const { TrustedUploadersService } = require(E2E.DIST + 'admin/trusted-uploaders.service.js');
  const svc = new TrustedUploadersService(p, {}, {}, {}, { approveTorrent: async (id) => p.torrent.update({ where: { id }, data: { status: 'APPROVED' } }) });
  const mkPending = async (uploaderId) => { const t = await p.torrent.create({ data: { infoHash: require('crypto').randomBytes(20).toString('hex'), name: 'P.' + tag + uploaderId.slice(0, 4), filePath: '/x', size: 1n, fileList: [], categoryId: cat.id, uploaderId } }); made.push(t.id); return t.id; };
  const t1 = await mkPending(good.id), t2 = await mkPending(plain.id);
  check('envoi d\'un Uploadeur : approuvé tout de suite', (await svc.autoApproveIfTrusted(good.id, t1)) === true && (await p.torrent.findUnique({ where: { id: t1 } })).status === 'APPROVED');
  check('envoi d\'un membre ordinaire : reste en attente', (await svc.autoApproveIfTrusted(plain.id, t2)) === false && (await p.torrent.findUnique({ where: { id: t2 } })).status === 'PENDING');

  // réglages : désactivation, bornes
  const saved = await call('PUT', '/admin/trusted-uploaders/config', TA, { ...before.config, enabled: false, minApproved: -3 });
  check('réglages enregistrés et ramenés à des bornes valides', saved.s === 200 && saved.b.enabled === false && saved.b.minApproved === 1);
  const off = await call('POST', '/admin/trusted-uploaders/run', TA);
  check('désactivé : aucune évaluation', off.b.checked === 0 && off.b.promoted.length === 0);
  await call('PUT', '/admin/trusted-uploaders/config', TA, before.config);

  // changer un rôle à la main efface la marque « automatique »
  await p.user.update({ where: { id: good.id }, data: { role: 'UPLOADER', autoUploaderAt: new Date() } });
  const edit = await call('PATCH', `/admin/users/${good.id}`, TA, { role: 'USER' });
  check('rôle changé à la main : plus « automatique »', edit.s < 300 && (await p.user.findUnique({ where: { id: good.id } })).autoUploaderAt === null, String(edit.s));

  const ids = [adm.id, good.id, sloppy.id, manual.id, idle.id, plain.id];
  await p.activityLog.deleteMany({ where: { userId: { in: ids } } });
  await p.activityLog.deleteMany({ where: { action: { in: ['UPLOADER_AUTO_PROMOTE', 'UPLOADER_AUTO_DEMOTE'] }, meta: { path: ['target'], string_starts_with: tag } } });
  await p.torrent.deleteMany({ where: { id: { in: made } } });
  await p.user.deleteMany({ where: { id: { in: ids } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
