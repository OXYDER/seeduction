// Test de bout en bout : des. Voir README.md.
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const D = E2E.DIST;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const bcrypt = require(B + 'bcrypt');
const dice = require(D + 'common/utils/dice');
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

(async () => {
  const p = new PrismaClient();
  const tag = 'dc' + Date.now().toString(36).slice(-4);
  const hash = await bcrypt.hash('Mot-de-passe-test-1', 4);
  const old = new Date(Date.now() - 30 * 86400_000);
  const mk = (n, extra = {}) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: old, bonusPoints: 5000, ...extra } });
  const admin = await E2E.getAdmin(p, bcrypt);
  const A = tok(admin);
  const players = [await mk('a'), await mk('b'), await mk('c'), await mk('e')];
  const young = await mk('y', { createdAt: new Date() });
  const donor = await mk('d', { bonusPoints: 400, donatedPoints: 400 });
  const pts = async (x) => (await p.user.findUnique({ where: { id: x.id }, select: { bonusPoints: true } })).bonusPoints;

  const adm = await call('GET', '/games/dice/admin', A);
  const cfg0 = adm.b.config;
  check('réglages par défaut', adm.s === 200 && cfg0.edge === 0.05 && cfg0.dailyFree.stake === 10);
  await call('PUT', '/games/dice/admin', A, { ...cfg0, dailyLossMax: 0 });

  let ov = await call('GET', '/games/dice', tok(players[0]));
  check('aperçu : liste des paris avec chances et cotes', ov.s === 200 && ov.b.bets.length >= 25 && ov.b.bets.every((b) => b.mult >= 1.1 && b.p > 0 && b.p < 1), 'paris=' + ov.b.bets.length);
  check('aucune information « maison » côté membre', !/edge|houseProfit|observedRtp|rtp/i.test(ov.raw));

  let r = await call('POST', '/games/dice/roll', tok(young), { kind: 'EXACT', n: 7, stake: 10 });
  check('compte trop récent refusé', r.s === 400 && /au moins/.test(r.b?.message ?? ''));
  r = await call('POST', '/games/dice/roll', tok(donor), { kind: 'EXACT', n: 7, stake: 10 });
  check('points de don non misables', r.s === 400 && /don/.test(r.b?.message ?? ''), r.b?.message);
  r = await call('POST', '/games/dice/roll', tok(players[0]), { kind: 'UNDER', n: 12, stake: 10 });
  check('pari non proposé refusé', r.s === 400);
  r = await call('POST', '/games/dice/roll', tok(players[0]), { kind: 'EXACT', n: 7, stake: 3 });
  check('mise invalide refusée', r.s === 400);

  // ---- beaucoup de lancers : l'argent et le règlement doivent toujours être cohérents
  const betsPool = ov.b.bets;
  const totals = new Array(13).fill(0); let rolls = 0, wins = 0, bad = 0, badMoney = 0;
  const start = new Map(); for (const u of players) start.set(u.id, await pts(u));
  async function play(u, n) {
    const T = tok(u);
    for (let i = 0; i < n; i++) {
      await sleep(950);
      const b = betsPool[Math.floor(Math.random() * betsPool.length)];
      const stake = [5, 10, 25][Math.floor(Math.random() * 3)];
      const before = await pts(u);
      const x = await call('POST', '/games/dice/roll', T, { kind: b.kind, n: b.n, stake });
      if (x.s !== 201) { check('lancer accepté', false, x.raw.slice(0, 120)); return; }
      const g = x.b;
      rolls++; totals[g.total]++; if (g.win) wins++;
      const mult = Math.floor(dice.multH({ kind: b.kind, n: b.n }, 0.05)) ;
      const shouldWin = dice.wins({ kind: b.kind, n: b.n }, g.d1, g.d2);
      const expected = shouldWin ? dice.payoutOf(stake, mult, 5000) : 0;
      if (g.d1 < 1 || g.d1 > 6 || g.d2 < 1 || g.d2 > 6 || g.win !== shouldWin || g.payout !== expected || g.total !== g.d1 + g.d2) bad++;
      const after = await pts(u);
      if (after - before !== expected - stake || g.points !== after) badMoney++;
    }
  }
  await Promise.all(players.map((u) => play(u, 30)));
  check('lancers joués', rolls === 120, `wins=${wins}`);
  check('dés valides, règlement conforme au pari et à la cote', bad === 0, 'écarts=' + bad);
  check('solde exact à chaque lancer', badMoney === 0, 'écarts=' + badMoney);
  for (const u of players) {
    const rows = await p.diceRoll.findMany({ where: { userId: u.id } });
    const exp = rows.reduce((s, g) => s + g.payout - g.stake, 0);
    check('solde final exact pour ' + u.username, (await pts(u)) - start.get(u.id) === exp, `delta=${(await pts(u)) - start.get(u.id)} attendu=${exp}`);
  }
  const mean = totals.reduce((s, n, t) => s + n * t, 0) / rolls;
  check('total moyen proche de 7', mean > 6.2 && mean < 7.8, mean.toFixed(2));
  check('tous les totaux de 2 à 12 possibles (aucun hors de 2..12)', totals[0] === 0 && totals[1] === 0 && totals.slice(2).reduce((a, b) => a + b, 0) === rolls);

  // ---- partie gratuite
  await sleep(1000);
  const f = await call('POST', '/games/dice/roll', tok(players[0]), { kind: 'OVER', n: 6, daily: true });
  check('lancer gratuit du jour', f.s === 201 && f.b.daily === true && f.b.stake === 10, JSON.stringify({ s: f.s, p: f.b?.payout }));
  await sleep(950);
  const f2 = await call('POST', '/games/dice/roll', tok(players[0]), { kind: 'OVER', n: 6, daily: true });
  check('un seul lancer gratuit par jour', f2.s === 400 && /déjà joué/.test(f2.b?.message ?? ''));
  check('lancer gratuit enregistré sans débit', (await p.diceRoll.findFirst({ where: { userId: players[0].id, daily: true } }))?.stake === 0);

  // ---- limite de pertes
  const L = await mk('l', { bonusPoints: 5000 });
  await call('PUT', '/games/dice/admin', A, { ...cfg0, dailyLossMax: 30 });
  let guard = 0, refused = null;
  while (guard++ < 12 && !refused) { await sleep(950); const x = await call('POST', '/games/dice/roll', tok(L), { kind: 'EXACT', n: 12, stake: 10 }); if (x.s === 400) refused = x.b.message; }
  const lrows = await p.diceRoll.findMany({ where: { userId: L.id, daily: false } });
  const loss = lrows.reduce((s, g) => s + g.stake - g.payout, 0);
  check('limite de pertes : refus une fois la limite atteinte', !!refused && /imite|reviens/.test(refused) && loss <= 30, `perte=${loss} message=${refused}`);
  await call('PUT', '/games/dice/admin', A, cfg0);

  // ---- administration et résumé
  const adm2 = await call('GET', '/games/dice/admin', A);
  check('administration : totaux', adm2.s === 200 && adm2.b.totals.all.rolls >= 121, JSON.stringify(adm2.b.totals.all));
  check('administration refusée aux membres', (await call('GET', '/games/dice/admin', tok(players[0]))).s === 403);
  const hub = await call('GET', '/games/summary', tok(players[0]));
  check('résumé de la page Jeux', hub.s === 200 && hub.b.dice.myRolls >= 30 && hub.b.dice.enabled, JSON.stringify(hub.b.dice));
  ov = await call('GET', '/games/dice', tok(players[0]));
  check('historique et plus gros gains', ov.b.recent.length === 10 && Array.isArray(ov.b.biggest));

  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTOUT PASSE');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
