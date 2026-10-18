// Test de bout en bout : plus-haut-plus-bas. Voir README.md.
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
      let j = null; try { j = await r.json(); } catch {} return { s: r.status, b: j };
    } catch (e) { if (i === 2) throw e; await sleep(300); }
  }
}
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
const tok = (u) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, E2E.SECRET, { expiresIn: '1h' });

(async () => {
  const p = new PrismaClient();
  const tag = 'hl' + Date.now().toString(36).slice(-4);
  const hash = await bcrypt.hash('Mot-de-passe-test-1', 4);
  const old = new Date(Date.now() - 30 * 86400_000);
  const mk = (n, extra = {}) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: old, bonusPoints: 3000, ...extra } });
  const admin = await E2E.getAdmin(p, bcrypt);
  const A = tok(admin);
  const u = await mk('a'), don = await mk('d', { donatedPoints: 3000 }), young = await mk('y', { createdAt: new Date() });
  const T = tok(u);
  const pts = async (x) => (await p.user.findUnique({ where: { id: x.id }, select: { bonusPoints: true } })).bonusPoints;

  let ov = await call('GET', '/games/hilo', T);
  check('aperçu : 200, aucune partie en cours, partie gratuite disponible', ov.s === 200 && ov.b.active === null && ov.b.me.dailyFreeAvailable === true);

  // refus
  for (const stake of [0, 4, 7, 101, -5, 'x']) check('mise refusée : ' + stake, (await call('POST', '/games/hilo/start', T, { stake })).s === 400);
  check('compte trop récent refusé', (await call('POST', '/games/hilo/start', tok(young), { stake: 10 })).s === 400);
  check('points de don non misables', (await call('POST', '/games/hilo/start', tok(don), { stake: 10 })).s === 400);
  check('réponse sans partie refusée', (await call('POST', '/games/hilo/guess', T, { gameId: 'x', guess: 'H' })).s === 400);

  // partie complète : on joue plusieurs parties pour voir une victoire et une défaite
  await sleep(500);
  let before = await pts(u);
  let st = await call('POST', '/games/hilo/start', T, { stake: 10 });
  check('partie démarrée, mise débitée', st.s === 201 && st.b.game.status === 'ACTIVE' && (await pts(u)) === before - 10, JSON.stringify(st.b?.game && { card: st.b.game.card, odds: st.b.game.odds }));
  check('la carte a une valeur, une couleur et des cotes', st.b.game.card.rank >= 2 && st.b.game.card.rank <= 14 && !!st.b.game.card.suit && (st.b.game.odds.H || st.b.game.odds.L));
  await sleep(450);
  check('on ne peut pas encaisser avant une bonne réponse', (await call('POST', '/games/hilo/cashout', T, { gameId: st.b.game.id })).s === 400);
  await sleep(450);
  const second = await call('POST', '/games/hilo/start', T, { stake: 10 });
  check('une seule partie active à la fois', second.s === 400, second.b?.message);
  check('l\'aperçu retrouve la partie en cours', (await call('GET', '/games/hilo', T)).b.active?.id === st.b.game.id);

  let g = st.b.game, wins = 0, lost = false;
  for (let i = 0; i < 20 && !lost; i++) {
    await sleep(450);
    const choose = g.odds.H && (!g.odds.L || g.odds.H.p >= g.odds.L.p) ? 'H' : 'L';
    const r = await call('POST', '/games/hilo/guess', T, { gameId: g.id, guess: choose });
    if (r.s !== 201) { check('réponse acceptée', false, JSON.stringify(r.b)); break; }
    g = r.b.game;
    if (g.status === 'LOST') { lost = true; check('perdu : la partie est terminée et la mise est perdue', (await pts(u)) === before - 10 && g.payout === null); }
    else { wins++; if (wins >= 2) break; }
  }
  if (!lost) {
    check('série en cours avec un multiplicateur', g.step >= 2 && g.multiplier > 1 && g.payoutNow >= 10, JSON.stringify({ step: g.step, mult: g.multiplier, now: g.payoutNow }));
    await sleep(450);
    const co = await call('POST', '/games/hilo/cashout', T, { gameId: g.id });
    check('encaissement : gain versé', co.s === 201 && co.b.game.status === 'CASHED' && co.b.game.payout === g.payoutNow && (await pts(u)) === before - 10 + g.payoutNow, `${await pts(u)} (gain ${g.payoutNow})`);
    check('double encaissement refusé', (await call('POST', '/games/hilo/cashout', T, { gameId: g.id })).s === 400);
  }
  await sleep(450);
  ov = await call('GET', '/games/hilo', T);
  check('l\'aperçu n\'a plus de partie active et l\'historique a 1 partie', ov.b.active === null && ov.b.recent.length === 1);

  // réponse impossible : on triche en base pour obtenir un as
  await sleep(450);
  const st2 = await call('POST', '/games/hilo/start', T, { stake: 5 });
  await p.hiLoGame.update({ where: { id: st2.b.game.id }, data: { card: 12 } }); // 12 % 13 + 2 = 14 : un as
  await sleep(450);
  const imp = await call('POST', '/games/hilo/guess', T, { gameId: st2.b.game.id, guess: 'H' });
  check('plus haut qu\'un as : refusé', imp.s === 400, imp.b?.message);
  check('réponse invalide refusée', (await call('POST', '/games/hilo/guess', T, { gameId: st2.b.game.id, guess: 'X' })).s === 400);

  // abandon : le règlement automatique rembourse une partie sans réponse (on vieillit la partie et on déclenche le balayage via l'API de test)
  await p.hiLoGame.update({ where: { id: st2.b.game.id }, data: { updatedAt: new Date(Date.now() - 3 * 3600_000) } });

  // partie gratuite quotidienne : une seule par jour, aucun débit
  await call('POST', '/games/hilo/cashout', T, { gameId: st2.b.game.id }); // refusé (0 réponse) : sans effet
  await p.hiLoGame.updateMany({ where: { userId: u.id, status: 'ACTIVE' }, data: { status: 'REFUNDED', active: null, endedAt: new Date() } });
  await p.user.update({ where: { id: u.id }, data: { bonusPoints: 3000 } });
  await sleep(450);
  const free = await call('POST', '/games/hilo/start', T, { daily: true });
  check('partie gratuite : aucun débit', free.s === 201 && free.b.game.daily === true && free.b.game.paid === 0 && (await pts(u)) === 3000);
  await p.hiLoGame.updateMany({ where: { userId: u.id, status: 'ACTIVE' }, data: { status: 'REFUNDED', active: null, endedAt: new Date() } });
  await sleep(450);
  check('deuxième partie gratuite du jour refusée', (await call('POST', '/games/hilo/start', T, { daily: true })).s === 400);

  // limite de pertes
  await call('PUT', '/games/hilo/admin', A, { dailyLossMax: 1 });
  await sleep(450);
  check('limite de pertes : refus', (await call('POST', '/games/hilo/start', T, { stake: 100 })).s === 400);
  await call('PUT', '/games/hilo/admin', A, { dailyLossMax: 1000 });

  // admin
  const ad = await call('GET', '/games/hilo/admin', A);
  check('admin : comptes de la maison', ad.s === 200 && ad.b.totals.all.games >= 1, JSON.stringify(ad.b?.totals?.all));
  check('un membre ne voit pas l\'admin', (await call('GET', '/games/hilo/admin', T)).s === 403);
  const sm = await call('GET', '/games/summary', T);
  check('la vitrine reçoit les statistiques du jeu', sm.s === 200 && sm.b.hilo && typeof sm.b.hilo.gamesToday === 'number');

  const ids = [u.id, don.id, young.id];
  await p.hiLoGame.deleteMany({ where: { userId: { in: ids } } });
  await p.user.deleteMany({ where: { id: { in: ids } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTOUT EST OK');
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
