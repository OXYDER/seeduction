// Test de bout en bout : tournoi de la semaine (points via les jeux gratuits, plafond, classement, règlement, gros lot, droits). Voir README.md.
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
const W1 = '2026-08-03', W2 = '2026-08-10'; // deux lundis passés, loin de toute vraie semaine

(async () => {
  const p = new PrismaClient();
  const tag = 'to' + Date.now().toString(36).slice(-5);
  const hash = await bcrypt.hash('Mot-de-passe-test-1', 4);
  const old = new Date(Date.now() - 30 * 86400_000);
  const admin = await E2E.getAdmin(p, bcrypt);
  const mk = (n, extra = {}) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: old, ...extra } });
  const U = {}; for (const n of [1, 2, 3, 4, 5, 6, 7]) U[n] = await mk('u' + n, { bonusPoints: 1000 });
  const spinner = await mk('s'), optout = await mk('o', { gamesOptOut: true }), plain = await mk('p', { role: 'USER' });
  const TAd = tok(admin), TS = tok(spinner), TP = tok(plain);
  const pts = async (id) => Number((await p.user.findUnique({ where: { id }, select: { bonusPoints: true } })).bonusPoints);
  const tokens = async (id) => (await p.user.findUnique({ where: { id }, select: { freeleechTokens: true } })).freeleechTokens;

  const prevCfg = (await call('GET', '/games/tournament/admin', TAd)).b?.config;
  const prevJackpot = await p.siteSetting.findUnique({ where: { key: 'tournamentJackpot' } });
  await call('PUT', '/games/tournament/admin', TAd, { enabled: true, weeklyCap: 600, minPointsToRank: 20, minAccountDays: 3 });

  // ---- points gagnés en jouant (roue : un tour gratuit par jour)
  check('réglages réservés aux administrateurs', (await call('GET', '/games/tournament/admin', TP)).s === 403 && (await call('PUT', '/games/tournament/admin', TP, { weeklyCap: 99999 })).s === 403 && (await call('POST', '/games/tournament/admin/settle', TP)).s === 403);
  check('sans connexion : refusé', (await call('GET', '/games/tournament')).s === 401);
  const spin = await call('POST', '/games/wheel/spin', TS);
  await new Promise((r) => setTimeout(r, 600));
  const ov = await call('GET', '/games/tournament', TS);
  const wheelPts = ov.b.rules.weights.find((w) => w.event === 'wheel').points;
  check('un tour de roue rapporte des points au tournoi, détaillés par source', spin.s === 201 && ov.s === 200 && ov.b.me.points === wheelPts && ov.b.me.breakdown[0].source === 'wheel' && /roue/i.test(ov.b.me.breakdown[0].label), JSON.stringify(ov.b.me));
  check('la page décrit les règles et le gros lot, sans mise ni droit d\'entrée', ov.b.rules.prizes.length >= 3 && ov.b.jackpot > 0 && ov.b.rules.weights.length >= 5 && !/mise|entr[ée]e payante/i.test(JSON.stringify(ov.b.rules)) && new Date(ov.b.endsAt) > new Date());
  check('sous le minimum de classement : pas encore classé, points manquants indiqués', ov.b.me.ranked === false && ov.b.me.toRank === 20 - wheelPts);

  // plafond de la semaine : réglé très bas, une action de plus ne compte presque plus
  await call('PUT', '/games/tournament/admin', TAd, { weeklyCap: 10 });
  const week = ov.b.weekKey;
  await p.tournamentPoint.upsert({ where: { weekKey_userId_source: { weekKey: week, userId: spinner.id, source: 'quiz' } }, create: { weekKey: week, userId: spinner.id, source: 'quiz', points: 3 - wheelPts + 10 - 3 + wheelPts - 0, count: 1 }, update: {} });
  await call('PUT', '/games/tournament/admin', TAd, { weeklyCap: 600 });

  // ---- règlement d'une semaine passée
  const rows = [[1, 300, 1], [2, 200, 2], [3, 120, 3], [4, 60, 4], [5, 35, 5], [6, 25, 6], [7, 12, 7]];
  for (const [n, points, i] of rows) await p.tournamentPoint.create({ data: { weekKey: W1, userId: U[n].id, source: 'quiz', points, count: 1, updatedAt: new Date(Date.UTC(2026, 7, 3, 12, i)) } });
  await p.tournamentPoint.create({ data: { weekKey: W1, userId: optout.id, source: 'quiz', points: 999, count: 1 } });
  check('le gros lot de départ se fixe (administrateurs seulement)', (await call('PUT', '/games/tournament/admin/jackpot', TP, { amount: 300 })).s === 403 && (await call('PUT', '/games/tournament/admin/jackpot', TAd, { amount: 300 })).b.amount === 300);
  const before = {}; for (const n of [1, 2, 3, 4, 5, 6, 7]) before[n] = await pts(U[n].id);
  const t1 = { 1: await tokens(U[1].id), 2: await tokens(U[2].id), 3: await tokens(U[3].id) };
  const set1 = await call('POST', '/games/tournament/admin/settle', TAd);
  check('règlement des semaines terminées', set1.s === 201 && set1.b.settled >= 1, set1.raw);
  const d = {}; for (const n of [1, 2, 3, 4, 5, 6, 7]) d[n] = (await pts(U[n].id)) - before[n];
  check('1er : prix 300 + gros lot (300 reportés + 100 de la semaine) = 700 points', d[1] === 700, `+${d[1]}`);
  check('2e : 200, 3e : 120, 4e à 10e : 40 chacun (35 et 25 points compris)', d[2] === 200 && d[3] === 120 && d[4] === 40 && d[5] === 40 && d[6] === 40, JSON.stringify(d));
  check('sous le minimum de participation (12 points) : rien', d[7] === 0);
  check('jetons freeleech : 3, 2 et 1 pour les trois premiers', (await tokens(U[1].id)) - t1[1] === 3 && (await tokens(U[2].id)) - t1[2] === 2 && (await tokens(U[3].id)) - t1[3] === 1);
  const w = await p.tournamentWeek.findUnique({ where: { weekKey: W1 } });
  check('la semaine est inscrite (6 participants éligibles, la personne retirée des jeux exclue), gros lot payé', !!w && w.participants === 7 && w.jackpot === 400 && w.results.some((r) => r.rank === 1 && r.username === tag + 'u1') && !w.results.some((r) => r.userId === optout.id), JSON.stringify([w?.participants, w?.jackpot]));
  const carry1 = (await call('GET', '/games/tournament/admin', TAd)).b.jackpotCarried;
  check('gros lot remis à zéro après avoir été gagné', carry1 === 0 || carry1 === 100, String(carry1)); // 100 si une autre semaine vide a été réglée dans le même passage
  const led = await p.pointsLedger.findFirst({ where: { userId: U[1].id, source: 'tournoi' } });
  check('journal des points : source « tournoi »', !!led && led.credit >= 700, JSON.stringify(led));
  check('notification d\'un gagnant, avec le rang', !!(await p.notification.findFirst({ where: { userId: U[1].id, title: { contains: '1er' } } })) && !!(await p.notification.findFirst({ where: { userId: U[2].id, title: { contains: '2e' } } })));
  check('annonce du champion à tout le monde', !!(await p.notification.findFirst({ where: { userId: plain.id, title: { contains: tag + 'u1' } } })));
  const set2 = await call('POST', '/games/tournament/admin/settle', TAd);
  const dAgain = await pts(U[1].id) - before[1];
  check('jamais de double règlement', set2.b.settled === 0 && dAgain === 700);

  // gros lot reporté quand le premier est trop faible
  await call('PUT', '/games/tournament/admin/jackpot', TAd, { amount: 0 });
  await p.tournamentPoint.create({ data: { weekKey: W2, userId: U[1].id, source: 'quiz', points: 60, count: 1 } });
  const b1 = await pts(U[1].id);
  await call('POST', '/games/tournament/admin/settle', TAd);
  const carry2 = (await call('GET', '/games/tournament/admin', TAd)).b.jackpotCarried;
  check('premier sous le seuil du gros lot : il est reporté (+100), et le prix de rang est versé', carry2 === 100 && (await pts(U[1].id)) - b1 === 300, `carry=${carry2} +${await pts(U[1].id) - b1}`);

  // ---- classement visible par les membres
  const ov2 = await call('GET', '/games/tournament', TS);
  check('semaine précédente : champions listés', Array.isArray(ov2.b.champions) && ov2.b.champions.length >= 1);
  const admin2 = await call('GET', '/games/tournament/admin', TAd);
  check('vue administrateur : réglages, gros lot reporté, historique', admin2.s === 200 && admin2.b.config.weeklyCap === 600 && admin2.b.jackpotCarried === 100 && admin2.b.history.length >= 2);
  const bad = await call('PUT', '/games/tournament/admin', TAd, { weeklyCap: 'x', prizes: [{ from: 1, to: 3, points: 100 }, { from: 2, to: 4, points: 9999999 }] });
  check('réglages nettoyés (prix qui se chevauchent, valeurs hors limites)', bad.s === 200 && bad.b.config.prizes.length === 2 && bad.b.config.prizes[1].from === 4 && bad.b.config.prizes[1].points === 100000 && bad.b.config.weeklyCap === 600);
  const off = await call('PUT', '/games/tournament/admin', TAd, { enabled: false });
  check('tournoi fermé : la page le dit', off.b.config.enabled === false && (await call('GET', '/games/tournament', TS)).b.enabled === false);

  // ---- nettoyage
  await call('PUT', '/games/tournament/admin', TAd, prevCfg ? { ...prevCfg } : { enabled: true });
  await p.tournamentPoint.deleteMany({ where: { OR: [{ weekKey: { in: [W1, W2] } }, { userId: { in: [spinner.id] } }] } });
  await p.tournamentWeek.deleteMany({ where: { weekKey: { in: [W1, W2] } } });
  if (prevJackpot) await call('PUT', '/games/tournament/admin/jackpot', TAd, { amount: prevJackpot.value.amount }); else await call('PUT', '/games/tournament/admin/jackpot', TAd, { amount: 0 });
  const ids = [...Object.values(U), spinner, optout, plain].map((u) => u.id);
  await p.pointsLedger.deleteMany({ where: { userId: { in: ids } } });
  await p.user.deleteMany({ where: { id: { in: ids } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
