// Test de bout en bout : membres fondateurs (candidats, nomination, pseudo en or, badge, invitations, salon, changement de pseudo, retrait). Voir README.md.
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const bcrypt = require(B + 'bcrypt');
const { randomBytes } = require('crypto');
const BASE = E2E.BASE;
const tok = (u) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, E2E.SECRET, { expiresIn: '1h' });
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
async function call(method, p, token, body) {
  const r = await fetch(BASE + p, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { s: r.status, b: j };
}

(async () => {
  const p = new PrismaClient();
  const tag = 'fd' + Date.now().toString(36).slice(-5);
  const admin = await E2E.getAdmin(p, bcrypt);
  const mk = (n, extra = {}) => p.user.create({ data: { username: tag + n, email: `${tag}${n}@t.local`, passwordHash: 'x', role: 'USER', createdAt: new Date(Date.now() - 60 * 86400_000), lastSeenAt: new Date(), ...extra } });
  const [a, b, c, other] = [await mk('a'), await mk('b'), await mk('c'), await mk('u')];
  const [TA, T_A, T_C] = [tok(admin), tok(a), tok(c)];
  const prevCfg = await p.siteSetting.findUnique({ where: { key: 'founders' } });
  const prevSalon = await p.siteSetting.findUnique({ where: { key: 'foundersChat' } });
  const torrentIds = [];
  const torrent = async (n, uploaderId) => { const t = await p.torrent.create({ data: { infoHash: randomBytes(20).toString('hex'), name: `${tag}.${n}`, filePath: '/x', size: 1n, fileList: [], categoryId: (await p.category.findFirst({ select: { id: true } })).id, uploaderId, status: 'APPROVED' } }); torrentIds.push(t.id); return t; };
  let renamed = null;
  try {
    // A : un torrent envoyé + 25 h de seed = deux critères ; C : un seul critère ; B : aucune activité.
    const ta = await torrent('A', a.id); const tc = await torrent('C', c.id); const tother = await torrent('O', other.id);
    await p.snatch.create({ data: { torrentId: tother.id, userId: a.id, seedSeconds: 25 * 3600 } });
    await call('PUT', '/founders/admin/config', TA, { cutoff: '2026-11-23T05:00:00.000Z', minCriteria: 2, activeDays: 60, loginDays: 5, posts: 5, uploads: 1, feedback: 1, seedHours: 24 });

    check('un membre ordinaire ne voit pas la page d\'administration', (await call('GET', '/founders/admin', T_C)).s === 403);
    const ov = (await call('GET', '/founders/admin', TA)).b;
    const row = (id) => ov?.rows?.find((r) => r.id === id);
    check('les membres de la bêta sont listés avec leurs chiffres', row(a.id)?.metrics.uploads === 1 && row(a.id)?.metrics.seedHours >= 25, JSON.stringify(row(a.id)?.metrics));
    check('A (2 critères, vu récemment) est proposé', row(a.id)?.eligible === true && row(a.id)?.met.length === 2);
    check('C (1 critère) et B (aucun) ne le sont pas', row(c.id)?.eligible === false && row(b.id)?.eligible === false);
    const old = await call('PUT', '/founders/admin/config', TA, { cutoff: new Date(Date.now() - 90 * 86400_000).toISOString() });
    check('après la date limite : les comptes plus récents ne sont plus candidats', !old.b?.rows?.some((r) => r.id === a.id));
    await call('PUT', '/founders/admin/config', TA, { cutoff: '2026-11-23T05:00:00.000Z' });
    await p.user.update({ where: { id: b.id }, data: { lastSeenAt: new Date(Date.now() - 400 * 86400_000) } });
    await call('PUT', '/founders/admin/config', TA, { minCriteria: 1 });
    const ov2 = (await call('GET', '/founders/admin', TA)).b;
    check('absent depuis longtemps : jamais proposé (présence récente exigée)', ov2.rows.find((r) => r.id === b.id)?.eligible === false);
    await call('PUT', '/founders/admin/config', TA, { minCriteria: 2 });

    // Nomination (la validation de l'administration)
    const g = await call('POST', '/founders/admin/grant', TA, { ids: [a.id, b.id] });
    check('l\'administrateur nomme deux fondateurs', g.s === 201 && g.b.granted === 2, JSON.stringify(g.b?.granted));
    check('un membre ordinaire ne peut pas nommer', (await call('POST', '/founders/admin/grant', T_C, { ids: [c.id] })).s === 403);
    const fa = await p.user.findUnique({ where: { id: a.id } });
    check('le statut est enregistré avec le cadeau de l\'année (3 jetons freeleech)', !!fa.founderAt && fa.freeleechTokens === 3 && fa.founderGiftYear === new Date().getFullYear());
    check('le badge Fondateur est attribué', !!(await p.userBadge.findFirst({ where: { userId: a.id, code: 'FONDATEUR' } })));
    check('une notification prévient le membre', !!(await p.notification.findFirst({ where: { userId: a.id, title: { contains: 'fondateur' } } })));

    const rc = (await call('GET', '/users/rank-colors', T_C)).b;
    check('le pseudo en or : A figure dans les fondateurs des couleurs de rang', rc.byId.FOUNDER?.includes(a.id) && rc.byName.FOUNDER?.includes((tag + 'a').toLowerCase()));
    check('le profil indique « fondateur »', (await call('GET', `/users/${a.id}`, T_C)).b?.founder === true && (await call('GET', `/users/${c.id}`, T_C)).b?.founder === false);

    // Avantages
    let made = 0; let last;
    for (let i = 0; i < 4; i++) { last = await call('POST', '/auth/invite', T_A); if (last.s < 300) made++; }
    check('3 invitations de plus que son rang (la quatrième est refusée)', made === 3 && last.s === 400, `${made} créée(s)`);
    check('un non-fondateur de rang ordinaire n\'a aucune invitation', (await call('POST', '/auth/invite', T_C)).s === 400);

    const wallC = (await call('GET', '/founders', T_C)).b;
    const wallA = (await call('GET', '/founders', T_A)).b;
    check('le mur liste les fondateurs, avec les avantages', wallC.founders.some((f) => f.id === a.id) && wallC.me.founder === false && wallC.perks.extraInvites === 3 && wallC.perks.bonusPercent === 5);
    check('le fondateur voit son statut et son changement de pseudo gratuit', wallA.me.founder === true && wallA.me.renameAvailable === true);

    // Salon
    check('un non-fondateur n\'entre pas dans le salon', (await call('GET', '/founders/chat', T_C)).s === 403);
    const salon = await call('GET', '/founders/chat', T_A);
    const members = salon.b?.conversationId ? await p.conversationMember.findMany({ where: { conversationId: salon.b.conversationId }, select: { userId: true } }) : [];
    check('le salon réunit les fondateurs (et l\'administration)', members.some((m) => m.userId === a.id) && members.some((m) => m.userId === b.id) && members.some((m) => m.userId === admin.id) && !members.some((m) => m.userId === c.id), `${members.length} participants`);

    // Changement de pseudo gratuit
    check('pseudo déjà pris : refusé', (await call('POST', '/founders/rename', T_A, { username: tag + 'c' })).s === 400);
    check('pseudo invalide : refusé', (await call('POST', '/founders/rename', T_A, { username: 'a b' })).s === 400);
    check('un non-fondateur ne peut pas changer de pseudo', (await call('POST', '/founders/rename', T_C, { username: tag + 'zz' })).s === 403);
    renamed = tag + 'neo';
    const rn = await call('POST', '/founders/rename', T_A, { username: renamed });
    check('le fondateur change son pseudo une fois', rn.s === 201 && rn.b.username === renamed && rn.b.mustLogin === true, JSON.stringify(rn.b));
    const after = await p.user.findUnique({ where: { id: a.id } });
    check('…enregistré, avec les sessions fermées', after.username === renamed && after.founderRenameUsed === true && !!after.sessionsValidAfter);
    check("l'ancienne session est fermée (il faut se reconnecter)", (await call('GET', '/founders', T_A)).s === 401);
    await new Promise((r) => setTimeout(r, 1500));
    check('un deuxième changement est refusé', (await call('POST', '/founders/rename', tok({ ...after, role: 'USER' }), { username: tag + 'neo2' })).s === 400);

    // Retrait
    const rv = await call('POST', '/founders/admin/revoke', TA, { id: b.id });
    check('l\'administrateur retire le statut', rv.s === 201 && !(await p.user.findUnique({ where: { id: b.id } })).founderAt);
    check('…le badge et le salon aussi', !(await p.userBadge.findFirst({ where: { userId: b.id, code: 'FONDATEUR' } })) && !(await p.conversationMember.findFirst({ where: { conversationId: salon.b.conversationId, userId: b.id } })));
    check('le retrait de ce qui n\'existe pas : erreur claire', (await call('POST', '/founders/admin/revoke', TA, { id: b.id })).s === 404);
  } finally {
    const ids = [a.id, b.id, c.id, other.id];
    const conv = ((await p.siteSetting.findUnique({ where: { key: 'foundersChat' } }))?.value || {}).id;
    if (conv && !prevSalon) { await p.conversationMember.deleteMany({ where: { conversationId: conv } }); await p.message.deleteMany({ where: { conversationId: conv } }).catch(() => undefined); await p.conversation.delete({ where: { id: conv } }).catch(() => undefined); }
    if (prevSalon) await p.siteSetting.update({ where: { key: 'foundersChat' }, data: { value: prevSalon.value } }); else await p.siteSetting.deleteMany({ where: { key: 'foundersChat' } });
    if (prevCfg) await p.siteSetting.update({ where: { key: 'founders' }, data: { value: prevCfg.value } }); else await p.siteSetting.deleteMany({ where: { key: 'founders' } });
    await p.inviteCode.deleteMany({ where: { createdById: { in: ids } } });
    await p.userBadge.deleteMany({ where: { userId: { in: ids } } });
    await p.notification.deleteMany({ where: { userId: { in: ids } } });
    await p.snatch.deleteMany({ where: { userId: { in: ids } } });
    await p.torrent.deleteMany({ where: { id: { in: torrentIds } } });
    await p.activityLog.deleteMany({ where: { OR: [{ userId: { in: ids } }, { action: { in: ['FOUNDERS_CONFIG', 'FOUNDER_GRANT', 'FOUNDER_REVOKE'] }, userId: admin.id, createdAt: { gt: new Date(Date.now() - 900_000) } }] } });
    await p.user.deleteMany({ where: { id: { in: ids } } }).catch(() => undefined);
    await p.$disconnect();
  }
  console.log(fails ? `\n${fails} échec(s)` : '\nTout est OK');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
