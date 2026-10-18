// Test de bout en bout : duels entre membres. Voir README.md.
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const bcrypt = require(B + 'bcrypt');
const BASE = E2E.BASE;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(method, p, token, body) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(BASE + p, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch {} return { s: r.status, b: j, raw: text };
    } catch (e) { if (i === 2) throw e; await sleep(300); }
  }
}
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
const tok = (u) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, E2E.SECRET, { expiresIn: '1h' });
const torontoDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const shift = (day, n) => { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10); };

(async () => {
  const p = new PrismaClient();
  const tag = 'du' + Date.now().toString(36).slice(-4);
  const hash = await bcrypt.hash('Mot-de-passe-test-1', 4);
  const old = new Date(Date.now() - 30 * 86400_000);
  const mk = (n, extra = {}) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: old, bonusPoints: 100, ...extra } });
  const admin = await E2E.getAdmin(p, bcrypt);
  const A = await mk('a'), Bm = await mk('b'), C = await mk('c'), D = await mk('d'), young = await mk('y', { createdAt: new Date() }), out = await mk('o', { gamesOptOut: true });
  const users = [A, Bm, C, D, young, out];
  const ta = tok(A), tb = tok(Bm), tc = tok(C), td = tok(D), tAdmin = tok(admin);
  const pts = async (x) => (await p.user.findUnique({ where: { id: x.id }, select: { bonusPoints: true } })).bonusPoints;
  const today = torontoDay();
  const quiz = (u, day, correct, points) => p.quizPlay.create({ data: { userId: u.id, day, questionIds: [], startsAt: new Date(), status: 'DONE', correct, points, bonus: 0 } });
  // fait « terminer » un duel déjà accepté : période dans le passé
  const backdate = (id, days = 3) => p.duel.update({ where: { id }, data: { startDay: shift(today, -days), endDay: shift(today, -1) } });

  const cfg0 = (await call('GET', '/games/duels/admin', tAdmin)).b.config;
  check('réglages par défaut', cfg0.winPoints === 20 && cfg0.consolationPoints === 5 && cfg0.maxRewardedPerDay === 3 && cfg0.pairCooldownDays === 7);
  await call('PUT', '/games/duels/admin', tAdmin, { ...cfg0, maxRewardedPerDay: 3, pairCooldownDays: 7, enabled: true });

  // ---- invitations : refus clairs
  const inv = (t, body) => call('POST', '/games/duels', t, body);
  let r = await inv(ta, { opponent: A.username, kind: 'quiz', days: 3 });
  check('on ne peut pas se défier soi-même', r.s === 400, r.raw.slice(0, 80));
  r = await inv(ta, { opponent: 'personne-inconnu-xyz', kind: 'quiz', days: 3 });
  check('adversaire inconnu', r.s === 404);
  r = await inv(ta, { opponent: Bm.username, kind: 'poker', days: 3 });
  check('activité inconnue', r.s === 400);
  r = await inv(ta, { opponent: Bm.username, kind: 'quiz', days: 5 });
  check('durée interdite', r.s === 400);
  r = await inv(ta, { opponent: young.username, kind: 'quiz', days: 3 });
  check('adversaire trop récent', r.s === 400 && /récent/.test(r.raw), r.raw.slice(0, 80));
  r = await inv(ta, { opponent: out.username, kind: 'quiz', days: 3 });
  check('adversaire retiré des jeux', r.s === 400 && /retiré/.test(r.raw));
  r = await inv(tok(young), { opponent: Bm.username, kind: 'quiz', days: 3 });
  check('compte trop récent ne peut pas inviter', r.s === 403);

  // ---- invitation, doublon, annulation
  r = await inv(ta, { opponent: Bm.username.toUpperCase(), kind: 'quiz', days: 3 });
  check('invitation créée (pseudo insensible à la casse)', r.s === 201 && r.b.id, r.raw.slice(0, 80));
  const id1 = r.b.id;
  r = await inv(tb, { opponent: A.username, kind: 'picks', days: 7 });
  check('un seul duel à la fois par paire (même en sens inverse)', r.s === 400 && /déjà/.test(r.raw));
  let ov = await call('GET', '/games/duels', tb);
  check('l\'adversaire voit l\'invitation reçue', ov.s === 200 && ov.b.incoming.length === 1 && ov.b.incoming[0].other === A.username && ov.b.outgoing.length === 0);
  ov = await call('GET', '/games/duels', ta);
  check('le challenger la voit en attente', ov.b.outgoing.length === 1 && ov.b.incoming.length === 0);
  const notif = await p.notification.count({ where: { userId: Bm.id, title: { contains: A.username } } });
  check('notification envoyée à l\'adversaire', notif >= 1);
  r = await call('POST', `/games/duels/${id1}/accept`, tc);
  check('un tiers ne peut pas accepter', r.s === 404);
  r = await call('POST', `/games/duels/${id1}/accept`, ta);
  check('le challenger ne peut pas accepter sa propre invitation', r.s === 404);

  const rc = await inv(ta, { opponent: C.username, kind: 'picks', days: 3 });
  r = await call('POST', `/games/duels/${rc.b.id}/cancel`, tb);
  check('seul le challenger annule', r.s === 404);
  r = await call('POST', `/games/duels/${rc.b.id}/cancel`, ta);
  check('annulation', r.s === 201);
  r = await call('POST', `/games/duels/${rc.b.id}/accept`, tc);
  check('une invitation annulée ne s\'accepte plus', r.s === 400);

  // limite d'invitations en attente
  const names = []; for (let i = 0; i < 4; i++) names.push(await mk('p' + i));
  const outs = [];
  for (let i = 0; i < 3; i++) { const x = await inv(ta, { opponent: names[i].username, kind: 'challenges', days: 3 }); outs.push(x); }
  // A a déjà 1 en attente (vers B) : la 3e supplémentaire dépasse la limite de 3
  check('limite d\'invitations en attente', outs[0].s === 201 && outs[1].s === 201 && outs[2].s === 400 && /en attente/.test(outs[2].raw), outs.map((x) => x.s).join());
  for (const o of outs) if (o.b?.id) await call('POST', `/games/duels/${o.b.id}/cancel`, ta);
  users.push(...names);

  // ---- acceptation : commence demain
  r = await call('POST', `/games/duels/${id1}/accept`, tb);
  check('acceptation', r.s === 201 && r.b.status === 'ACTIVE' && r.b.startDay === shift(today, 1) && r.b.endDay === shift(today, 3), r.raw.slice(0, 120));
  ov = await call('GET', '/games/duels', ta);
  check('duel en cours, pas encore commencé, scores à zéro', ov.b.active.length === 1 && !ov.b.active[0].started && ov.b.active[0].mine === 0);
  r = await call('POST', `/games/duels/${id1}/decline`, tb);
  check('on ne refuse plus un duel accepté', r.s === 400);

  // ---- règlement : A 4 bonnes réponses, B 2
  await backdate(id1);
  await quiz(A, shift(today, -2), 4, 50); await quiz(Bm, shift(today, -2), 2, 30);
  await quiz(A, shift(today, -10), 5, 60); // hors période : ne compte pas
  const a0 = await pts(A), b0 = await pts(Bm);
  ov = await call('GET', '/games/duels', ta);
  const done1 = ov.b.recent.find((d) => d.id === id1);
  check('duel réglé à l\'ouverture de la page', !!done1 && done1.result === 'won' && done1.mine === 4 && done1.theirs === 2, JSON.stringify(done1));
  check('gagnant +20, perdant +5 (consolation)', (await pts(A)) === a0 + 20 && (await pts(Bm)) === b0 + 5);
  await call('GET', '/games/duels', ta); await call('GET', '/games/duels', tb);
  check('jamais payé deux fois', (await pts(A)) === a0 + 20 && (await pts(Bm)) === b0 + 5);
  ov = await call('GET', '/games/duels', tb);
  check('côté perdant : « lost » et points de consolation', ov.b.recent[0].result === 'lost' && ov.b.recent[0].points === 5 && ov.b.stats.lost === 1 && ov.b.stats.points === 5);
  const led = await p.pointsLedger.findMany({ where: { source: 'duels', userId: { in: [A.id, Bm.id] } } });
  check('journal des points : source « duels »', led.reduce((s, x) => s + x.credit, 0) === 25, JSON.stringify(led.map((x) => x.credit)));

  // ---- même paire : pas de nouvelle récompense avant le délai
  r = await inv(ta, { opponent: Bm.username, kind: 'quiz', days: 3 });
  const id2 = r.b.id; await call('POST', `/games/duels/${id2}/accept`, tb); await backdate(id2);
  await quiz(A, shift(today, -1), 3, 20); await quiz(Bm, shift(today, -1), 1, 10);
  const a1 = await pts(A), b1 = await pts(Bm);
  await call('GET', '/games/duels', ta);
  const d2 = await p.duel.findUnique({ where: { id: id2 } });
  check('même paire : résultat gardé, aucune récompense', d2.status === 'DONE' && d2.winnerId === A.id && d2.pointsA === 0 && d2.pointsB === 0 && /récemment/.test(d2.note) && (await pts(A)) === a1 && (await pts(Bm)) === b1);

  // ---- plafond quotidien : 1 duel récompensé par jour
  await call('PUT', '/games/duels/admin', tAdmin, { ...cfg0, maxRewardedPerDay: 1 });
  r = await inv(ta, { opponent: C.username, kind: 'quiz', days: 3 });
  const id3 = r.b.id; await call('POST', `/games/duels/${id3}/accept`, tc); await backdate(id3);
  // les quiz des jours -2 et -1 existent déjà pour A ; C fait mieux que A
  await quiz(C, shift(today, -2), 9, 90);
  const a2 = await pts(A), c2 = await pts(C);
  await call('GET', '/games/duels', tc);
  const d3 = await p.duel.findUnique({ where: { id: id3 } });
  check('plafond : A (déjà récompensé aujourd\'hui) ne reçoit rien, C reçoit le prix du gagnant', d3.winnerId === C.id && d3.pointsA === 0 && d3.pointsB === 20 && /Plafond/.test(d3.note) && (await pts(A)) === a2 && (await pts(C)) === c2 + 20, JSON.stringify(d3));
  await call('PUT', '/games/duels/admin', tAdmin, cfg0);

  // ---- personne n'a joué : rien du tout
  r = await inv(td, { opponent: C.username, kind: 'picks', days: 3 });
  const id4 = r.b.id; await call('POST', `/games/duels/${id4}/accept`, tc); await backdate(id4);
  const d0 = await pts(D), c3 = await pts(C);
  await call('GET', '/games/duels', td);
  const d4 = await p.duel.findUnique({ where: { id: id4 } });
  check('duel sans activité : terminé sans points', d4.status === 'DONE' && d4.winnerId === null && d4.pointsA === 0 && d4.pointsB === 0 && (await pts(D)) === d0 && (await pts(C)) === c3);

  // ---- invitation expirée
  r = await inv(td, { opponent: A.username, kind: 'challenges', days: 7 });
  const id5 = r.b.id; await p.duel.update({ where: { id: id5 }, data: { createdAt: new Date(Date.now() - 72 * 3600_000) } });
  r = await call('POST', `/games/duels/${id5}/accept`, ta);
  check('invitation expirée : refus clair', r.s === 400 && /expiré/.test(r.raw));
  check('marquée « expirée »', (await p.duel.findUnique({ where: { id: id5 } })).status === 'EXPIRED');

  // ---- refus
  r = await inv(td, { opponent: A.username, kind: 'quiz', days: 3 });
  const id6 = r.b.id;
  r = await call('POST', `/games/duels/${id6}/decline`, ta);
  check('refus', r.s === 201 && (await p.duel.findUnique({ where: { id: id6 } })).status === 'DECLINED');

  // ---- résumé de la page Jeux
  const hub = await call('GET', '/games/summary', ta);
  check('résumé sur la page Jeux', hub.s === 200 && hub.b.duels && hub.b.duels.enabled === true && hub.b.duels.won === 2, JSON.stringify(hub.b?.duels));

  // ---- fermeture par l'administrateur
  await call('PUT', '/games/duels/admin', tAdmin, { ...cfg0, enabled: false });
  r = await inv(ta, { opponent: Bm.username, kind: 'quiz', days: 3 });
  check('duels fermés : invitation refusée', r.s === 403);
  await call('PUT', '/games/duels/admin', tAdmin, cfg0);

  // ---- nettoyage
  const ids = users.map((u) => u.id);
  await p.duel.deleteMany({ where: { OR: [{ challengerId: { in: ids } }, { opponentId: { in: ids } }] } });
  await p.quizPlay.deleteMany({ where: { userId: { in: ids } } });
  await p.notification.deleteMany({ where: { userId: { in: ids } } });
  await p.pointsLedger.deleteMany({ where: { userId: { in: ids } } });
  await p.user.deleteMany({ where: { id: { in: ids } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
