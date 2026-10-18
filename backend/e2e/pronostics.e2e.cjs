// Test de bout en bout : pronostics. Voir README.md.
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

(async () => {
  const p = new PrismaClient();
  const tag = 'pk' + Date.now().toString(36).slice(-4);
  const hash = await bcrypt.hash('Mot-de-passe-test-1', 4);
  const old = new Date(Date.now() - 30 * 86400_000);
  const mk = (n, extra = {}) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: old, bonusPoints: 1000, ...extra } });
  const admin = await E2E.getAdmin(p, bcrypt);
  const A = tok(admin);
  const [u1, u2, u3, young] = [await mk('a'), await mk('b'), await mk('c'), await mk('y', { createdAt: new Date() })];
  const pts = async (x) => (await p.user.findUnique({ where: { id: x.id }, select: { bonusPoints: true } })).bonusPoints;
  const today = torontoDay();
  const base = 1_500_000_000 + (Date.now() % 90_000_000);
  const soon = (m) => new Date(Date.now() + m * 60_000);
  const mkGame = (n, extra = {}) => p.nhlGame.create({ data: { id: base + n, day: today, startUtc: soon(600), kind: 'SAISON', homeAbbrev: 'MTL', awayAbbrev: 'TOR', homeName: 'Canadiens', awayName: 'Maple Leafs', ...extra } });
  const gA = [await mkGame(1), await mkGame(2), await mkGame(3)]; // u1 / u2
  const gB = [await mkGame(4), await mkGame(5), await mkGame(6)]; // u3 avec plafond
  const gStarted = await mkGame(7, { startUtc: new Date(Date.now() - 3600_000) });
  const gVoid = await mkGame(8);

  const cfg0 = (await call('GET', '/games/picks/admin', A)).b.config;
  check('réglages par défaut', cfg0.pointsPerWin === 5 && cfg0.perfectBonus === 20 && cfg0.dailyCap === 60);

  // ---- vue d'ensemble, intégration réelle de la LNH
  let ov = await call('GET', '/games/picks', tok(u1));
  check('aperçu : jours et matchs du jour', ov.s === 200 && ov.b.day === today && ov.b.days.length === cfg0.daysAhead + 1 && ov.b.games.length >= 8, 'matchs=' + ov.b.games?.length);
  const real = ov.b.games.filter((g) => g.id >= 2026000000 && g.id < 2027000000);
  check('matchs réels de la LNH synchronisés', real.length > 0, 'réels=' + real.length);
  check('fiche des équipes (classement réel)', real.some((g) => g.home.record && g.home.record.wins >= 0), JSON.stringify(real[0]?.home?.record));
  const yo = await call('POST', '/games/picks/pick', tok(young), { gameId: gA[0].id, pick: 'H' });
  check('compte trop récent refusé', yo.s === 400 && /au moins/.test(yo.b?.message ?? ''), yo.b?.message);

  // ---- choisir, changer, retirer
  const bad = await call('POST', '/games/picks/pick', tok(u1), { gameId: gA[0].id, pick: 'X' });
  check('choix invalide refusé', bad.s === 400);
  const started = await call('POST', '/games/picks/pick', tok(u1), { gameId: gStarted.id, pick: 'H' });
  check('match commencé : pronostic refusé', started.s === 400 && /commencé/.test(started.b?.message ?? ''), started.b?.message);
  const nogame = await call('POST', '/games/picks/pick', tok(u1), { gameId: 1, pick: 'H' });
  check('match inconnu refusé', nogame.s === 400);
  let r = await call('POST', '/games/picks/pick', tok(u1), { gameId: gA[0].id, pick: 'A' });
  check('pronostic enregistré', r.s === 201 && r.b.pick === 'A');
  r = await call('POST', '/games/picks/pick', tok(u1), { gameId: gA[0].id, pick: 'H' });
  check('changer de pronostic avant le match', r.s === 201 && r.b.pick === 'H');
  check('un seul pronostic par match', (await p.nhlPick.count({ where: { userId: u1.id, gameId: gA[0].id } })) === 1);
  r = await call('DELETE', '/games/picks/pick/' + gA[1].id, tok(u1));
  check('retirer un pronostic inexistant ne casse rien', r.s === 200);
  await call('POST', '/games/picks/pick', tok(u1), { gameId: gA[1].id, pick: 'H' });
  r = await call('DELETE', '/games/picks/pick/' + gA[1].id, tok(u1));
  check('pronostic retiré', r.s === 200 && (await p.nhlPick.count({ where: { userId: u1.id, gameId: gA[1].id } })) === 0);

  // ---- règlement : série et journée parfaite (3 matchs, 3 bonnes prédictions : 5 + 6 + 7 + 20)
  for (const g of gA) await call('POST', '/games/picks/pick', tok(u1), { gameId: g.id, pick: 'H' });
  for (const g of gA) await call('POST', '/games/picks/pick', tok(u2), { gameId: g.id, pick: 'A' });
  ov = await call('GET', '/games/picks', tok(u1));
  const mineGames = ov.b.games.filter((g) => gA.some((x) => x.id === g.id));
  check('mes choix et la répartition des membres', mineGames.every((g) => g.mine?.pick === 'H' && g.crowd.home === 1 && g.crowd.away === 1));
  const b1 = await pts(u1), b2 = await pts(u2);
  const sres = await call('POST', `/games/picks/admin/games/${gA[0].id}/settle`, A, { home: 4, away: 2 });
  check('règlement manuel par l\'administration', sres.s === 201, JSON.stringify(sres.b));
  check('1re bonne prédiction : 5 points, mauvaise : rien', (await pts(u1)) - b1 === 5 && (await pts(u2)) - b2 === 0, 'u1=' + ((await pts(u1)) - b1));
  const dbl = await call('POST', `/games/picks/admin/games/${gA[0].id}/settle`, A, { home: 1, away: 0 });
  check('double règlement refusé', dbl.s === 400);
  const late = await call('POST', '/games/picks/pick', tok(u2), { gameId: gA[0].id, pick: 'H' });
  check('match réglé : pronostic refusé', late.s === 400);
  await sleep(30);
  await call('POST', `/games/picks/admin/games/${gA[1].id}/settle`, A, { home: 3, away: 1, outcome: 'Final (prolongation)' });
  check('2e bonne prédiction de suite : 6 points', (await pts(u1)) - b1 === 11, 'total=' + ((await pts(u1)) - b1));
  await sleep(30);
  await call('POST', `/games/picks/admin/games/${gA[2].id}/settle`, A, { home: 5, away: 0 });
  check('3e : 7 points + 20 de journée parfaite', (await pts(u1)) - b1 === 38, 'total=' + ((await pts(u1)) - b1));
  check('l\'autre membre n\'a rien gagné', (await pts(u2)) - b2 === 0);
  const bonusRows = await p.nhlDayBonus.findMany({ where: { userId: u1.id } });
  check('bonus de journée parfaite versé une seule fois', bonusRows.length === 1 && bonusRows[0].points === 20);
  const picks1 = await p.nhlPick.findMany({ where: { userId: u1.id, gameId: { in: gA.map((g) => g.id) } }, orderBy: { settledAt: 'asc' } });
  check('séries enregistrées 0, 1, 2', JSON.stringify(picks1.map((x) => x.streak)) === '[0,1,2]' && picks1.every((x) => x.status === 'WON'), JSON.stringify(picks1.map((x) => [x.status, x.points, x.streak])));
  const notes = await p.notification.findMany({ where: { userId: u1.id, category: 'games' }, orderBy: { createdAt: 'asc' } });
  check('notifications des pronostics réussis', notes.length >= 1 && notes.some((n) => /journée parfaite/.test(n.body ?? '')), 'n=' + notes.length);

  // ---- classement et statistiques
  ov = await call('GET', '/games/picks', tok(u1));
  check('mes statistiques', ov.b.me.streak === 3 && ov.b.me.week.wins >= 3 && ov.b.me.wins === 3 && ov.b.me.won === 38 && ov.b.me.dayEarned === 18, JSON.stringify(ov.b.me));
  check('classement de la semaine', ov.b.leaderboard.rows.some((x) => x.mine && x.wins === 3 && x.picks === 3) && ov.b.leaderboard.myRank >= 1);
  const hub = await call('GET', '/games/summary', tok(u1));
  check('résumé de la page Jeux', hub.b.picks.pickedToday === 3 && hub.b.picks.streak === 3 && hub.b.picks.won === 38, JSON.stringify(hub.b.picks));

  // ---- plafond du jour (3 points restants après le premier) et match annulé
  await call('PUT', '/games/picks/admin', A, { ...cfg0, dailyCap: 8 });
  for (const g of gB) await call('POST', '/games/picks/pick', tok(u3), { gameId: g.id, pick: 'A' });
  await call('POST', '/games/picks/pick', tok(u3), { gameId: gVoid.id, pick: 'A' });
  const b3 = await pts(u3);
  for (const g of gB) { await call('POST', `/games/picks/admin/games/${g.id}/settle`, A, { home: 1, away: 4 }); await sleep(30); }
  const got3 = (await pts(u3)) - b3;
  check('plafond du jour : 5 + 3 + 0, plus la journée parfaite (4 prédictions dont 1 annulée plus tard)', got3 === 8 || got3 === 28, 'gagné=' + got3);
  const v = await call('POST', `/games/picks/admin/games/${gVoid.id}/void`, A);
  check('match annulé', v.s === 201);
  const voidPick = await p.nhlPick.findFirst({ where: { userId: u3.id, gameId: gVoid.id } });
  check('pronostic annulé, sans points', voidPick.status === 'VOID' && voidPick.points === 0);
  const vv = await call('POST', `/games/picks/admin/games/${gVoid.id}/void`, A);
  check('annuler deux fois refusé', vv.s === 400);
  await call('PUT', '/games/picks/admin', A, cfg0);

  // ---- administration
  const adm = await call('GET', '/games/picks/admin', A);
  check('administration : statistiques et matchs', adm.s === 200 && adm.b.stats.picksToday >= 9 && adm.b.games.length >= 8 && adm.b.stats.pointsAll >= 38, JSON.stringify(adm.b.stats));
  const forb = await call('GET', '/games/picks/admin', tok(u1));
  check('administration refusée aux membres', forb.s === 403);
  const badScore = await call('POST', `/games/picks/admin/games/${gA[0].id}/settle`, A, { home: 2, away: 2 });
  check('égalité refusée', badScore.s === 400);

  // nettoyage des matchs fictifs (les vrais restent)
  await p.nhlGame.deleteMany({ where: { id: { gte: 1_500_000_000, lt: 1_600_000_000 } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTOUT PASSE');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
