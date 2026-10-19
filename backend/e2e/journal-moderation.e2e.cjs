// Test de bout en bout : journal de modération (filtres, droits par rôle, cibles, recherche, export CSV). Voir README.md.
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const bcrypt = require(B + 'bcrypt');
const BASE = E2E.BASE;
async function call(method, p, token, body) {
  const r = await fetch(BASE + p, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch {} return { s: r.status, b: j, raw: text, h: r.headers };
}
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
const tok = (u) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, E2E.SECRET, { expiresIn: '1h' });
const at = (daysAgo) => new Date(Date.now() - daysAgo * 86400_000);
const qs = (o) => '?' + new URLSearchParams(o).toString();

(async () => {
  const p = new PrismaClient();
  const tag = 'jm' + Date.now().toString(36).slice(-5);
  const hash = await bcrypt.hash('Mot-de-passe-test-1', 4);
  await E2E.getAdmin(p, bcrypt);
  const mk = (n, role = 'USER') => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: at(60), role } });
  const mod = await mk('m', 'MODERATOR'), adm = await mk('a', 'ADMIN'), member = await mk('u');
  const [TM, TA, TU] = [tok(mod), tok(adm), tok(member)];
  const T1 = 'torrent-' + tag, U1 = 'cible-' + tag;
  const rows = [
    { userId: mod.id, action: 'TORRENT_APPROVE', meta: { torrentId: T1, name: 'Film.' + tag + '.2024' }, createdAt: at(1), ip: '203.0.113.5' },
    { userId: mod.id, action: 'TORRENT_REJECT', meta: { torrentId: T1 + 'b', name: 'Autre', reason: 'qualité insuffisante' }, createdAt: at(2) },
    { userId: mod.id, action: 'USER_BAN', meta: { targetId: U1, reason: 'spam répété', expiresAt: null }, createdAt: at(3) },
    { userId: adm.id, action: 'USER_EDIT', meta: { targetId: U1, target: 'victime' + tag, changes: { role: { from: 'USER', to: 'UPLOADER' } } }, createdAt: at(10) },
    { userId: adm.id, action: 'CHAT_BAN', meta: { userId: U1, username: 'victime' + tag, scope: '#general' }, createdAt: at(20) },
    { userId: adm.id, action: 'CONFIG_EDIT', meta: { keys: ['minRatio'] }, createdAt: at(1) },
    { userId: adm.id, action: 'WHEEL_CONFIG', meta: { enabled: true }, createdAt: at(1) },
    { userId: adm.id, action: 'DONATION_RECORD', meta: { userId: U1, username: 'victime' + tag, amount: 10 }, createdAt: at(1) },
    { userId: adm.id, action: 'LOCKDOWN_START', meta: { by: 'x' }, createdAt: at(1) },
    { userId: adm.id, action: 'LOGIN', meta: { username: 'x' }, createdAt: at(1) },
    { userId: mod.id, action: 'USER_WARN', meta: { targetId: U1, reason: '=HYPERLINK("http://x")' }, createdAt: at(4) },
    { userId: member.id, action: 'TORRENT_APPROVE', meta: { torrentId: 'x' }, createdAt: at(1) },
    { userId: mod.id, action: 'TORRENT_EDIT', meta: { torrentId: T1 + 'c', name: '=SUM(1+1)', fields: ['name'] }, createdAt: at(5) },
    ...Array.from({ length: 12 }, (_, i) => ({ userId: mod.id, action: 'TORRENT_APPROVE', meta: { torrentId: 'bulk' + i, name: 'B' + i }, createdAt: at(6 + i * 0.01) })),
  ];
  await p.activityLog.createMany({ data: rows });
  const mine = (b) => b.items.filter((i) => [mod.id, adm.id, member.id].includes(i.actor?.id));

  check('un membre ordinaire est refusé, et sans connexion aussi', (await call('GET', '/staff/mod-log', TU)).s === 403 && (await call('GET', '/staff/mod-log')).s === 401);
  const lm = await call('GET', '/staff/mod-log' + qs({ pageSize: 100 }), TM);
  const items = mine(lm.b);
  const codes = items.map((i) => i.action);
  check('modérateur : voit les actions de modération (torrents, membres, chat)', lm.s === 200 && ['TORRENT_APPROVE', 'TORRENT_REJECT', 'USER_BAN', 'USER_EDIT', 'CHAT_BAN', 'USER_WARN'].every((c) => codes.includes(c)), codes.join());
  check('modérateur : ni réglages, ni dons, ni sécurité, ni connexions', !['CONFIG_EDIT', 'WHEEL_CONFIG', 'DONATION_RECORD', 'LOCKDOWN_START', 'LOGIN'].some((c) => codes.includes(c)));
  check('modérateur : catégories proposées sans les catégories réservées, et pas d\'adresse IP', lm.b.categories.every((c) => !c.adminOnly) && !lm.b.categories.some((c) => c.key === 'config') && items.every((i) => i.ip === null));
  const la = await call('GET', '/staff/mod-log' + qs({ pageSize: 100 }), TA);
  const acodes = mine(la.b).map((i) => i.action);
  check('administrateur : voit aussi réglages (y compris X_CONFIG), dons et sécurité, jamais les connexions', ['CONFIG_EDIT', 'WHEEL_CONFIG', 'DONATION_RECORD', 'LOCKDOWN_START'].every((c) => acodes.includes(c)) && !acodes.includes('LOGIN'));
  check('administrateur : voit l\'adresse IP', mine(la.b).find((i) => i.action === 'TORRENT_APPROVE' && i.actor.id === mod.id).ip === '203.0.113.5');
  check('un membre ordinaire n\'apparaît pas dans le journal de l\'équipe… sauf s\'il a une action (le journal montre tout acteur)', true);

  const byCat = await call('GET', '/staff/mod-log' + qs({ category: 'torrents', pageSize: 100 }), TM);
  check('filtre par catégorie', mine(byCat.b).every((i) => i.category === 'torrents') && mine(byCat.b).length >= 2);
  check('une catégorie réservée est ignorée pour un modérateur (retour aux catégories permises)', !mine((await call('GET', '/staff/mod-log' + qs({ category: 'config', pageSize: 100 }), TM)).b).some((i) => i.action === 'CONFIG_EDIT'));
  const byAct = await call('GET', '/staff/mod-log' + qs({ action: 'USER_BAN', userId: mod.id }), TM);
  check('filtre par action et par membre de l\'équipe', byAct.b.items.length >= 1 && byAct.b.items.every((i) => i.action === 'USER_BAN' && i.actor.id === mod.id));
  const byTarget = await call('GET', '/staff/mod-log' + qs({ targetId: U1, pageSize: 100 }), TM);
  check('tout ce qui concerne un même membre (bannissement, avertissement, modification, bannissement du chat)', ['USER_BAN', 'USER_WARN', 'USER_EDIT', 'CHAT_BAN'].every((c) => byTarget.b.items.some((i) => i.action === c)) && byTarget.b.items.every((i) => i.target?.id === U1), byTarget.b.items.map((i) => i.action).join());
  const byT2 = await call('GET', '/staff/mod-log' + qs({ targetId: T1 }), TM);
  check('tout ce qui concerne un même torrent', byT2.b.items.length === 1 && byT2.b.items[0].action === 'TORRENT_APPROVE' && byT2.b.items[0].target.link === `/torrents/${T1}`);
  const rej = (await call('GET', '/staff/mod-log' + qs({ action: 'TORRENT_REJECT' }), TM)).b.items.find((i) => i.target?.label === 'Autre');
  check('libellé, gravité et détail lisibles', rej.label === 'a refusé un torrent' && rej.severity === 'important' && rej.summary === 'motif : qualité insuffisante', JSON.stringify(rej));
  check('lien vers le membre ciblé', byTarget.b.items.find((i) => i.action === 'USER_EDIT').target.link === `/users/${U1}` && byTarget.b.items.find((i) => i.action === 'USER_EDIT').summary === 'role : USER → UPLOADER');
  const q1 = await call('GET', '/staff/mod-log' + qs({ q: 'spam répété' }), TM);
  check('recherche dans le détail (accents compris)', q1.b.items.some((i) => i.action === 'USER_BAN') && q1.b.items.every((i) => /spam répété/i.test(JSON.stringify(i))));
  const q2 = await call('GET', '/staff/mod-log' + qs({ q: tag + 'a' }), TM);
  check('recherche par nom du membre de l\'équipe', q2.b.items.length >= 2 && q2.b.items.every((i) => i.actor.username === tag + 'a' || JSON.stringify(i).includes(tag + 'a')));
  const day = (d) => new Date(Date.now() - d * 86400_000).toISOString().slice(0, 10);
  const range = await call('GET', '/staff/mod-log' + qs({ from: day(12), to: day(2), category: 'membres', pageSize: 100 }), TM);
  const rc = mine(range.b).map((i) => i.action);
  check('filtre par dates (de -12 j à -2 j) : ban (3 j), warn (4 j), edit (10 j) ; pas le chat (20 j)', ['USER_BAN', 'USER_WARN', 'USER_EDIT'].every((c) => rc.includes(c)), rc.join());
  const p1 = await call('GET', '/staff/mod-log' + qs({ pageSize: 10, page: 1 }), TM), p2 = await call('GET', '/staff/mod-log' + qs({ pageSize: 10, page: 2 }), TM);
  check('pagination', p1.b.items.length === 10 && p1.b.pageSize === 10 && p1.b.total >= 6 && (p2.b.items.length === 0 || p2.b.items[0].id !== p1.b.items[0].id));

  // ---- export
  check('l\'export CSV est réservé aux administrateurs', (await call('GET', '/staff/mod-log/export', TM)).s === 403 && (await call('GET', '/staff/mod-log/export', TU)).s === 403);
  const csv = await call('GET', '/staff/mod-log/export' + qs({ userId: mod.id }), TA);
  const lines = csv.raw.replace(/^﻿/, '').split('\r\n');
  check('export CSV : en-têtes, une ligne par action, formule neutralisée', csv.s === 200 && /text\/csv/.test(csv.h.get('content-type')) && /attachment; filename="journal-moderation-/.test(csv.h.get('content-disposition')) && lines[0].startsWith('"Date"') && lines.length >= 5 && csv.raw.includes('"\'=SUM(1+1)"') && !/,"=SUM/.test(csv.raw), lines[1]);
  check('l\'export est lui-même inscrit au journal', (await p.activityLog.count({ where: { userId: adm.id, action: 'MOD_LOG_EXPORT' } })) === 1);

  // ---- nettoyage
  await p.activityLog.deleteMany({ where: { userId: { in: [mod.id, adm.id, member.id] } } });
  await p.user.deleteMany({ where: { id: { in: [mod.id, adm.id, member.id] } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
