// Test de bout en bout : tableau de bord de l'équipe (files, ancienneté, niveaux, délais, visibilité selon le rôle). Voir README.md.
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
const hoursAgo = (h) => new Date(Date.now() - h * 3600_000);

(async () => {
  const p = new PrismaClient();
  const tag = 'tb' + Date.now().toString(36).slice(-5);
  const hash = await bcrypt.hash('Mot-de-passe-test-1', 4);
  const old = new Date(Date.now() - 60 * 86400_000);
  await E2E.getAdmin(p, bcrypt);
  const mk = (n, role = 'USER') => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: old, role } });
  const mod = await mk('m', 'MODERATOR'), adm = await mk('a', 'ADMIN'), member = await mk('u'), up = await mk('x');
  const [TM, TA, TU] = [tok(mod), tok(adm), tok(member)];
  const cat = (await p.category.findFirst({ where: { adult: false, parentId: null } })) ?? (await p.category.create({ data: { name: 'Test ' + tag, slug: 'test-' + tag } }));

  check('un membre ordinaire n\'a pas accès au tableau', (await call('GET', '/staff/board', TU)).s === 403 && (await call('GET', '/staff/board')).s === 401);
  const before = (await call('GET', '/staff/board', TA)).b;
  const bq = (k) => before.queues.find((q) => q.key === k);

  let n = 0;
  const mkT = (extra) => p.torrent.create({ data: { infoHash: (tag + n++).padEnd(40, '7'), name: 'Film.' + tag + '.' + n, filePath: '/x', size: 1n, fileList: [], categoryId: cat.id, uploaderId: up.id, ...extra } });
  const t1 = await mkT({ status: 'PENDING', createdAt: hoursAgo(60) });
  const t2 = await mkT({ status: 'PENDING', createdAt: hoursAgo(1) });
  const tc = await mkT({ status: 'PENDING', resubmittedAt: hoursAgo(14) });
  const tHeld = await mkT({ status: 'PENDING', holdAt: hoursAgo(5) });
  const ta = await mkT({ status: 'APPROVED', createdAt: hoursAgo(30), approvedAt: hoursAgo(6) }); // approuvé en 24 h
  const ticket = await p.supportTicket.create({ data: { subject: 'Aide ' + tag, requesterId: member.id, status: 'OPEN', lastReplyAt: hoursAgo(30), createdAt: hoursAgo(31) } });
  const answered = await p.supportTicket.create({ data: { subject: 'Réglé ' + tag, requesterId: member.id, status: 'ANSWERED', createdAt: hoursAgo(10), firstResponseAt: hoursAgo(8) } });
  const sugg = await p.suggestion.create({ data: { title: 'Idée ' + tag, body: 'x', authorId: member.id, createdAt: hoursAgo(2) } });
  const don = await p.donationEvent.create({ data: { provider: 'kofi', externalId: tag, kind: 'donation', status: 'PENDING', amount: 5, currency: 'CAD', createdAt: hoursAgo(80) } });
  const report = await p.report.create({ data: { reporterId: member.id, targetType: 'torrent', targetId: t1.id, reason: 'test ' + tag, createdAt: hoursAgo(3) } });

  const after = (await call('GET', '/staff/board', TA)).b;
  const aq = (k) => after.queues.find((q) => q.key === k);
  check('tableau accessible à l\'administrateur', !!after && after.queues.length >= 8 && typeof after.total === 'number');
  check('torrents à valider : +2 (celui en correction demandée n\'est pas compté)', aq('torrents').count === bq('torrents').count + 2, `${bq('torrents').count} → ${aq('torrents').count}`);
  check('le plus ancien (60 h) met la file « en retard »', aq('torrents').oldestHours >= 59 && aq('torrents').level === 'late', JSON.stringify([aq('torrents').oldestHours, aq('torrents').level]));
  check('corrigés à revoir : +1, attente de 14 h = à surveiller', aq('corrections').count === bq('corrections').count + 1 && aq('corrections').level !== 'ok', JSON.stringify([aq('corrections').count, aq('corrections').oldestHours, aq('corrections').level]));
  check('support : +1 billet en attente de l\'équipe (le billet déjà répondu n\'est pas compté)', aq('support').count === bq('support').count + 1);
  check('suggestions : +1', aq('suggestions').count === bq('suggestions').count + 1);
  check('signalements : +1', aq('reports').count === bq('reports').count + 1);
  check('dons à attribuer : +1 (80 h = en retard), visible par l\'administrateur', aq('donations').count === bq('donations').count + 1 && aq('donations').level === 'late');
  check('file vide : niveau ok', after.queues.filter((q) => q.count === 0).every((q) => q.level === 'ok' && q.oldestHours === null));
  check('délai de validation : l\'approbation en 24 h est dans l\'échantillon', after.delays.torrentApprovalHours && after.delays.torrentApprovalHours.sample >= 1);
  check('délai de première réponse du support : échantillon et médiane', after.delays.ticketFirstResponseHours && after.delays.ticketFirstResponseHours.sample >= 1 && after.delays.ticketFirstResponseHours.median >= 0);
  const m = (await call('GET', '/staff/board', TM)).b;
  check('un modérateur ne voit pas les files réservées aux administrateurs (dons, imports)', !m.queues.some((q) => ['donations', 'review'].includes(q.key)) && m.queues.some((q) => q.key === 'torrents'));
  check('le total compte ce que la personne voit', m.total === m.queues.reduce((s, q) => s + q.count, 0));

  // activité de l'équipe (7 jours)
  await p.activityLog.createMany({ data: [{ userId: mod.id, action: 'TORRENT_APPROVE' }, { userId: mod.id, action: 'TORRENT_APPROVE' }, { userId: mod.id, action: 'USER_WARN' }, { userId: member.id, action: 'TORRENT_APPROVE' }] });
  const act = (await call('GET', '/staff/board', TA)).b.activity;
  const mine = act.find((a) => a.id === mod.id);
  check('activité : 3 actions du modérateur, détail par type ; un simple membre n\'y figure pas', !!mine && mine.total === 3 && mine.detail[0].count === 2 && mine.detail[0].label === 'validés' && !act.some((a) => a.id === member.id), JSON.stringify(mine));

  // ---- nettoyage
  await p.report.delete({ where: { id: report.id } });
  await p.donationEvent.delete({ where: { id: don.id } });
  await p.suggestion.delete({ where: { id: sugg.id } });
  await p.supportTicket.deleteMany({ where: { id: { in: [ticket.id, answered.id] } } });
  await p.torrent.deleteMany({ where: { id: { in: [t1.id, t2.id, tc.id, tHeld.id, ta.id] } } });
  await p.activityLog.deleteMany({ where: { userId: { in: [mod.id, member.id] } } });
  await p.user.deleteMany({ where: { id: { in: [mod.id, adm.id, member.id, up.id] } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
