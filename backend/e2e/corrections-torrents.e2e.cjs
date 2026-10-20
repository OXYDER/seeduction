// Test de bout en bout : corrections proposées par les membres (file de modération, application, points, notifications) et édition groupée des torrents par l'équipe. Voir README.md.
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const BASE = E2E.BASE;
async function call(method, p, token, body) {
  const r = await fetch(BASE + p, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { s: r.status, b: j, raw: t };
}
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
const tok = (u) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, E2E.SECRET, { expiresIn: '1h' });
const DAY = 86400_000;

(async () => {
  const p = new PrismaClient();
  const tag = 'cx' + Date.now().toString(36).slice(-5);
  const mk = (n, data = {}) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: 'x', createdAt: new Date(Date.now() - 30 * DAY), bonusPoints: 100, ...data } });
  const up = await mk('u'), mem = await mk('m'), fresh = await mk('f', { createdAt: new Date() }), mod = await mk('o', { role: 'MODERATOR' });
  const cat = (await p.category.findFirst({ where: { adult: false, parentId: null } })) ?? (await p.category.create({ data: { name: 'Test ' + tag, slug: 'test-' + tag } }));
  const torrents = [];
  const tor = async (n, data = {}) => { const t = await p.torrent.create({ data: { infoHash: require('crypto').randomBytes(20).toString('hex'), name: 'T' + n + '.' + tag, filePath: '/x', size: 1000n, fileList: [], categoryId: cat.id, uploaderId: up.id, status: 'APPROVED', language: 'VO', resolution: '720p', ...data } }); torrents.push(t.id); return t; };
  const T1 = await tor(1), T2 = await tor(2), T3 = await tor(3), T4 = await tor(4);
  const [TM, TU, TF, TO] = [mem, up, fresh, mod].map(tok);

  // ---- propositions
  check('sans note : refusé', (await call('POST', `/torrents/${T1.id}/fixes`, TM, { changes: { language: 'MULTI.VFQ' }, note: 'oups' })).s === 400);
  check('l\'envoyeur corrige lui-même : refusé', (await call('POST', `/torrents/${T1.id}/fixes`, TU, { changes: { language: 'MULTI.VFQ' }, note: 'La langue est fausse, je corrige' })).s === 400);
  check('compte de moins d\'un jour : refusé', (await call('POST', `/torrents/${T1.id}/fixes`, TF, { changes: { language: 'MULTI.VFQ' }, note: 'La langue est fausse, vérifié' })).s === 403);
  check('année absurde : refusé', (await call('POST', `/torrents/${T1.id}/fixes`, TM, { changes: { year: 1500 }, note: 'Année fausse sur la fiche' })).s === 400);
  const ok = await call('POST', `/torrents/${T1.id}/fixes`, TM, { changes: { language: 'MULTI.VFQ', resolution: '1080p', uploaderId: 'pirate', status: 'REJECTED' }, note: 'Piste québécoise et image 1080p vérifiées avec MediaInfo' });
  check('proposition valide enregistrée (champs interdits ignorés)', ok.s === 201 && JSON.stringify(ok.b.changes) === JSON.stringify({ language: 'MULTI.VFQ', resolution: '1080p' }), ok.raw.slice(0, 140));
  check('une seule proposition en attente par torrent', (await call('POST', `/torrents/${T1.id}/fixes`, TM, { changes: { source: 'WEB-DL' }, note: 'La source est WEB-DL pas autre chose' })).s === 400);
  const noop = await call('POST', `/torrents/${T2.id}/fixes`, TM, { changes: { language: 'VO' }, note: 'Courte remarque' });
  check('une « correction » qui ne change rien et sans vraie explication : refusée', noop.s === 400);
  const remark = await call('POST', `/torrents/${T2.id}/fixes`, TM, { changes: {}, note: 'Le nom ne correspond pas du tout au contenu du fichier' });
  check('remarque sans correction précise (quelque chose de louche) : acceptée', remark.s === 201);
  await call('POST', `/torrents/${T3.id}/fixes`, TM, { changes: { season: '02' }, note: 'Cet épisode est de la saison 2 vérifié' });
  check('au plus 3 corrections en attente par membre', (await call('POST', `/torrents/${T4.id}/fixes`, TM, { changes: { season: '03' }, note: 'Saison 3 vérifiée sur la fiche' })).s === 400);

  // ---- file de modération
  const q = await call('GET', '/admin/queue', TO);
  check('compteur de la file : corrections en attente', q.s === 200 && q.b.pendingFixes >= 3 && q.b.total >= q.b.pendingFixes, JSON.stringify(q.b));
  check('file des corrections : refusée à un membre', (await call('GET', '/admin/torrent-fixes', TM)).s === 403);
  const list = await call('GET', '/admin/torrent-fixes', TO);
  const row = list.b.find((r) => r.id === ok.b.id);
  check('file : le détail « avant → après » et l\'auteur', !!row && row.changes.some((c) => c.field === 'language' && c.from === 'VO' && c.to === 'MULTI.VFQ') && row.author.username === tag + 'm' && row.torrent.id === T1.id);
  const mine = await call('GET', `/torrents/${T1.id}/fixes`, TM);
  const others = await call('GET', `/torrents/${T1.id}/fixes`, TU);
  check('le membre voit ses propositions, un autre membre (même l\'envoyeur) ne voit rien', mine.b.length === 1 && others.b.length === 0);
  check('un membre ne peut pas appliquer', (await call('POST', `/admin/torrent-fixes/${ok.b.id}/accept`, TM, {})).s === 403);

  // ---- application
  const before = (await p.user.findUnique({ where: { id: mem.id } })).bonusPoints;
  const acc = await call('POST', `/admin/torrent-fixes/${ok.b.id}/accept`, TO, { note: 'Merci' });
  check('correction appliquée', acc.s === 201 && acc.b.rewarded === 15, acc.raw.slice(0, 100));
  const t1 = await p.torrent.findUnique({ where: { id: T1.id } });
  check('le torrent est corrigé (langue et résolution)', t1.language === 'MULTI.VFQ' && t1.resolution === '1080p');
  check('l\'auteur reçoit 15 points et une notification', Math.round((await p.user.findUnique({ where: { id: mem.id } })).bonusPoints) === Math.round(before) + 15 && (await p.notification.count({ where: { userId: mem.id, title: { contains: 'correction a été appliquée' } } })) === 1);
  check('l\'envoyeur est prévenu de la modification', (await p.notification.count({ where: { userId: up.id, title: { contains: 'correction a été appliquée à ton torrent' } } })) === 1);
  check('inscrit au journal de modération', (await p.activityLog.count({ where: { userId: mod.id, action: 'TORRENT_FIX_ACCEPT' } })) === 1);
  check('déjà traitée : refusée', (await call('POST', `/admin/torrent-fixes/${ok.b.id}/accept`, TO, {})).s === 400);

  // ---- refus et remarque sans correction
  const rej = await call('POST', `/admin/torrent-fixes/${remark.b.id}/reject`, TO, { reason: 'Le nom est conforme' });
  check('refus avec motif, l\'auteur est prévenu', rej.s === 201 && (await p.notification.count({ where: { userId: mem.id, title: { contains: 'pas été retenue' }, body: { contains: 'conforme' } } })) === 1);
  check('un refus ne change pas le torrent', (await p.torrent.findUnique({ where: { id: T2.id } })).language === 'VO');
  const withdraw = await p.torrentFix.findFirst({ where: { authorId: mem.id, torrentId: T3.id, status: 'PENDING' } });
  check('l\'auteur retire sa propre proposition', (await call('DELETE', `/torrent-fixes/${withdraw.id}`, TM)).s === 200 && !(await p.torrentFix.findUnique({ where: { id: withdraw.id } })));

  // ---- édition groupée
  const bulkIds = [T1.id, T2.id, T3.id];
  check('édition groupée : refusée à un membre', (await call('POST', '/admin/torrents/bulk-edit', TM, { ids: bulkIds, changes: { language: 'VOF' } })).s === 403);
  check('édition groupée : sans valeur ou sans sélection, refusée', (await call('POST', '/admin/torrents/bulk-edit', TO, { ids: bulkIds, changes: {} })).s === 400 && (await call('POST', '/admin/torrents/bulk-edit', TO, { ids: [], changes: { language: 'VOF' } })).s === 400);
  check('plus de 100 torrents : refusé', (await call('POST', '/admin/torrents/bulk-edit', TO, { ids: Array.from({ length: 101 }, (_, i) => 'x' + i), changes: { language: 'VOF' } })).s === 400);
  const bulk = await call('POST', '/admin/torrents/bulk-edit', TO, { ids: [...bulkIds, 'inconnu'], changes: { language: 'VOF', resolution: '2160p', name: 'PIRATÉ', uploaderId: up.id } });
  check('trois torrents corrigés d\'un coup, l\'inconnu signalé', bulk.s === 201 && bulk.b.updated === 3 && bulk.b.failed.length === 1, bulk.raw.slice(0, 160));
  const after = await p.torrent.findMany({ where: { id: { in: bulkIds } } });
  check('langue et résolution appliquées partout, le nom jamais', after.every((t) => t.language === 'VOF' && t.resolution === '2160p' && !t.name.includes('PIRAT')));
  const log = await p.activityLog.findFirst({ where: { userId: mod.id, action: 'TORRENT_BULK_EDIT' } });
  check('édition groupée inscrite au journal', !!log && log.meta.count === 3 && log.meta.fields.includes('language'));

  const ids = [up.id, mem.id, fresh.id, mod.id];
  await p.torrentFix.deleteMany({ where: { torrentId: { in: torrents } } });
  await p.notification.deleteMany({ where: { userId: { in: ids } } });
  await p.activityLog.deleteMany({ where: { userId: { in: ids } } });
  await p.torrent.deleteMany({ where: { id: { in: torrents } } });
  await p.pointsLedger.deleteMany({ where: { userId: { in: ids } } });
  await p.user.deleteMany({ where: { id: { in: ids } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
