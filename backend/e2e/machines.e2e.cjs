// Test de bout en bout : machines. Voir README.md.
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
  const tag = 'sl' + Date.now().toString(36).slice(-4);
  const hash = await bcrypt.hash('Mot-de-passe-test-1', 4);
  const old = new Date(Date.now() - 30 * 86400_000);
  const mk = (n, extra = {}) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: old, bonusPoints: 5000, ...extra } });
  const admin = await E2E.getAdmin(p, bcrypt);
  const A = tok(admin);
  const u = await mk('a'), don = await mk('d', { donatedPoints: 5000, bonusPoints: 5000 }), young = await mk('y', { createdAt: new Date() });
  const T = tok(u), TD = tok(don), TY = tok(young);
  const pts = async (x) => (await p.user.findUnique({ where: { id: x.id }, select: { bonusPoints: true } })).bonusPoints;
  const spin = (t, body) => call('POST', '/games/slots/spin', t, body);

  const ov = await call('GET', '/games/slots', T);
  check('aperçu : 200, aucune information de retour envoyée aux membres', ov.s === 200 && ov.b.game.rtp === undefined && ov.b.game.hitRate === undefined && ov.b.game.atLeastStake === undefined);
  check('aperçu : gros lot visible', ov.b.jackpot.enabled === true && ov.b.jackpot.pool >= 500 && ov.b.jackpot.minStake === 25, JSON.stringify(ov.b.jackpot));
  check('aperçu : 3 rouleaux de 24, 5 lignes, tour gratuit disponible', ov.b.game.strips.length === 3 && ov.b.game.strips[0].length === 24 && ov.b.game.paylines.length === 5 && ov.b.me.dailyFreeAvailable === true);

  // mise invalide
  for (const stake of [0, 4, 7, 101, 500, -5, 'x']) check('mise refusée : ' + stake, (await spin(T, { machine: 'cinema', stake })).s === 400);
  check('machine inconnue refusée', (await spin(T, { machine: 'zzz', stake: 10 })).s === 400);
  check('compte trop récent refusé', (await spin(TY, { machine: 'cinema', stake: 10 })).s === 400);
  check('points de don non misables', (await spin(TD, { machine: 'or', stake: 10 })).s === 400);

  const poolBefore = ov.b.jackpot.pool;
  // un tour payant : le solde varie de -mise + gain
  const before = await pts(u);
  const r = await spin(T, { machine: 'cinema', stake: 10 });
  check('tour payant OK', r.s === 201 && r.b.rounds.length >= 1 && r.b.rounds[0].grid.length === 3, JSON.stringify(r.b?.message ?? { win: r.b.win, tier: r.b.tier }));
  const after = await pts(u);
  check('solde = avant − mise + gain', after === before - 10 + r.b.win, `${before} -> ${after} (gain ${r.b.win})`);
  check('le serveur renvoie le solde', r.b.points === Math.floor(after));
  const pool1 = (await call('GET', '/games/slots', T)).b.jackpot.pool;
  check('le gros lot grossit avec la mise (ou a été remporté)', pool1 >= poolBefore || r.b.jackpot !== null, `${poolBefore} -> ${pool1}`);
  check('cohérence : gain = somme des tours', r.b.win === r.b.rounds.reduce((s, x) => s + x.win, 0) || r.b.win < r.b.rounds.reduce((s, x) => s + x.win, 0));
  const fast = await spin(T, { machine: 'cinema', stake: 10 });
  check('deux tours trop rapprochés refusés', fast.s === 400, fast.b?.message);
  await sleep(1000);

  // tour gratuit quotidien : une fois, aucun débit
  const b2 = await pts(u);
  const d1 = await spin(T, { machine: 'or', daily: true });
  const a2 = await pts(u);
  check('tour gratuit quotidien : aucun débit', d1.s === 201 && a2 === b2 + d1.b.win && d1.b.daily === true && d1.b.stake === 10, `${b2} -> ${a2} gain ${d1.b?.win}`);
  await sleep(1000);
  const d2 = await spin(T, { machine: 'or', daily: true });
  check('deuxième tour gratuit du jour refusé', d2.s === 400, d2.b?.message);
  const ov2 = await call('GET', '/games/slots', T);
  check('tour gratuit marqué utilisé', ov2.b.me.dailyFreeAvailable === false);
  check('historique : 2 parties', ov2.b.recent.length === 2);

  // plafond de gain d'une partie
  await call('PUT', '/games/slots/admin', A, { maxWin: 15 });
  let capped = true; let seen = 0;
  for (let i = 0; i < 12; i++) { await sleep(950); const x = await spin(T, { machine: 'pirate', stake: 100 }); if (x.s === 201) { seen++; if (x.b.win > 15) capped = false; } }
  await call('PUT', '/games/slots/admin', A, { maxWin: 10000 });
  check('plafond de gain respecté sur ' + seen + ' parties', capped && seen > 0);

  // limite de pertes
  await call('PUT', '/games/slots/admin', A, { dailyLossMax: 1 });
  await sleep(1000);
  const lim = await spin(T, { machine: 'cinema', stake: 100 });
  check('limite de pertes : refus', lim.s === 400, lim.b?.message);
  await call('PUT', '/games/slots/admin', A, { dailyLossMax: 1000 });

  // machine coupée
  await call('PUT', '/games/slots/admin', A, { machines: { hockey: false } });
  check('machine coupée par l\'admin', (await spin(T, { machine: 'hockey', stake: 10 })).s === 400);
  await call('PUT', '/games/slots/admin', A, { machines: { hockey: true } });

  // retrait des jeux
  await call('PUT', '/games/moj/opt-out', T, { value: true });
  await sleep(1000);
  check('retiré des jeux : plus de tour', (await spin(T, { machine: 'cinema', stake: 10 })).s === 400);
  await call('PUT', '/games/moj/opt-out', T, { value: false });

  // admin
  const ad = await call('GET', '/games/slots/admin', A);
  check('admin : comptes de la maison', ad.s === 200 && ad.b.totals.all.spins >= 3 && ad.b.theoretical.houseEdge > 3 && ad.b.theoretical.houseEdge < 7, JSON.stringify(ad.b?.totals?.all));
  check('un membre ne voit pas l\'admin', (await call('GET', '/games/slots/admin', T)).s === 403);
  const cfg = await call('PUT', '/games/slots/admin', A, { minStake: 23, maxStake: 'x' });
  check('réglages : mise arrondie à un multiple de 5', cfg.s === 200 && cfg.b.config.minStake % 5 === 0 && cfg.b.config.maxStake === 100, JSON.stringify(cfg.b?.config && { min: cfg.b.config.minStake, max: cfg.b.config.maxStake }));
  await call('PUT', '/games/slots/admin', A, { minStake: 5 });

  // nettoyage
  const ids = [u.id, don.id, young.id];
  await p.slotSpin.deleteMany({ where: { userId: { in: ids } } });
  await p.user.deleteMany({ where: { id: { in: ids } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTOUT EST OK');
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
