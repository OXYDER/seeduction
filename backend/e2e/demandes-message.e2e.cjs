// Test de bout en bout : demandes de message (obligatoires avant d'écrire à un non-ami, sauf pour l'équipe, les amis, les discussions déjà commencées). Voir README.md.
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

(async () => {
  const p = new PrismaClient();
  const tag = 'dr' + Date.now().toString(36).slice(-5);
  const mk = (n, role = 'USER') => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: 'x', role, createdAt: new Date(Date.now() - 30 * 86400_000) } });
  const a = await mk('a'), b = await mk('b'), c = await mk('c'), mod = await mk('m', 'MODERATOR'), d = await mk('d'), e = await mk('e'), f = await mk('f'), g = await mk('g'), h = await mk('h');
  const [TA, TB, TC, TM, TD, TF] = [a, b, c, mod, d, f].map(tok);
  const direct = (t, id) => call('POST', '/messenger/direct', t, { userId: id });

  const r0 = await direct(TA, b.id);
  check('écrire à un non-ami : refusé, avec le code « demande requise »', r0.s === 403 && r0.b.code === 'MESSAGE_REQUEST_REQUIRED' && r0.b.toId === b.id && r0.b.toUsername === b.username, r0.raw.slice(0, 160));
  const st = await call('GET', `/message-requests/status/${b.id}`, TA);
  check('état : demande requise, rien d\'envoyé', st.s === 200 && st.b.allowed === false && st.b.reason === 'request_required' && st.b.request === null);

  const sent = await call('POST', '/message-requests', TA, { toId: b.id, intro: 'Salut, je voudrais te parler de ton dernier envoi' });
  check('demande envoyée (message d\'introduction facultatif)', sent.s === 201 && sent.b.status === 'PENDING');
  check('une deuxième demande en attente : refusée', (await call('POST', '/message-requests', TA, { toId: b.id })).s === 400);
  const noIntro = await call('POST', '/message-requests', TC, { toId: b.id });
  check('une demande sans introduction est acceptée aussi', noIntro.s === 201 && noIntro.b.intro === null);
  check('le destinataire est prévenu', (await p.notification.count({ where: { userId: b.id, title: { contains: 'voudrait t\'écrire' } } })) >= 1);
  const list = await call('GET', '/message-requests', TB);
  const inc = list.b.incoming.find((x) => x.from.id === a.id);
  check('le destinataire voit la demande et l\'introduction', !!inc && /dernier envoi/.test(inc.intro) && list.b.pendingCount === 2);
  check('l\'expéditeur voit sa demande envoyée', (await call('GET', '/message-requests', TA)).b.outgoing.some((x) => x.to.id === b.id && x.status === 'PENDING'));
  check('tant que ce n\'est pas accepté, toujours refusé', (await direct(TA, b.id)).s === 403);
  check('personne d\'autre ne peut répondre à sa place', (await call('POST', `/message-requests/${sent.b.id}/accept`, TA)).s === 404);

  const acc = await call('POST', `/message-requests/${sent.b.id}/accept`, TB);
  check('demande acceptée', acc.s === 201 && acc.b.ok === true);
  check('l\'expéditeur est prévenu de l\'acceptation', (await p.notification.count({ where: { userId: a.id, title: { contains: 'a accepté ta demande' } } })) === 1);
  const open = await direct(TA, b.id);
  check('la discussion peut commencer (dans les deux sens)', open.s === 201 && (await direct(TB, a.id)).s === 201, String(open.s));

  const dec = await call('POST', `/message-requests/${noIntro.b.id}/decline`, TB);
  check('demande refusée : pas de notification à l\'expéditeur, pas de nouvelle demande avant 7 jours', dec.s === 201 && (await p.notification.count({ where: { userId: c.id, title: { contains: 'refus' } } })) === 0 && (await call('POST', '/message-requests', TC, { toId: b.id })).s === 400 && (await direct(TC, b.id)).s === 403);
  const stc = await call('GET', `/message-requests/status/${b.id}`, TC);
  check('l\'état indique quand renvoyer', stc.b.request.status === 'DECLINED' && !!stc.b.request.retryAt);

  check('l\'équipe écrit sans demande', (await direct(TM, a.id)).s === 201 && (await direct(TM, c.id)).s === 201);
  check('et un membre peut écrire à l\'équipe sans demande', (await direct(TD, mod.id)).s === 201);

  await p.friendship.create({ data: { requesterId: d.id, addresseeId: e.id, status: 'ACCEPTED' } });
  check('des amis s\'écrivent sans demande', (await direct(TD, e.id)).s === 201);

  await p.conversation.create({ data: { type: 'DIRECT', directKey: [f.id, g.id].sort().join(':'), members: { create: [{ userId: f.id }, { userId: g.id }] } } });
  check('une discussion déjà commencée reste ouverte', (await direct(TF, g.id)).s === 201);

  await p.friendship.create({ data: { requesterId: h.id, addresseeId: a.id, status: 'BLOCKED' } });
  const blocked = await call('POST', '/message-requests', tok(h), { toId: a.id });
  check('un membre bloqué ne peut pas envoyer de demande', blocked.s === 403);

  check('une demande à soi-même ou à un inconnu : refusée', (await call('POST', '/message-requests', TA, { toId: a.id })).s === 400 && (await call('POST', '/message-requests', TA, { toId: 'inconnu' })).s === 404);
  const cancelTarget = await call('POST', '/message-requests', tok(g), { toId: c.id, intro: 'x' });
  check('l\'expéditeur peut annuler sa demande en attente', cancelTarget.s === 201 && (await call('DELETE', `/message-requests/${cancelTarget.b.id}`, tok(g))).s === 200);

  const ids = [a, b, c, mod, d, e, f, g, h].map((u) => u.id);
  await p.notification.deleteMany({ where: { userId: { in: ids } } });
  await p.messageRequest.deleteMany({ where: { OR: [{ fromId: { in: ids } }, { toId: { in: ids } }] } });
  await p.friendship.deleteMany({ where: { OR: [{ requesterId: { in: ids } }, { addresseeId: { in: ids } }] } });
  await p.conversation.deleteMany({ where: { members: { some: { userId: { in: ids } } } } });
  await p.activityLog.deleteMany({ where: { userId: { in: ids } } });
  await p.user.deleteMany({ where: { id: { in: ids } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
