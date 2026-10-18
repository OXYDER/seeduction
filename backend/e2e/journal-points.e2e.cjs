// Test de bout en bout : journal central des points. Voir README.md.
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

(async () => {
  const p = new PrismaClient();
  const tag = 'jp' + Date.now().toString(36).slice(-4);
  const hash = await bcrypt.hash('Mot-de-passe-test-1', 4);
  const old = new Date(Date.now() - 30 * 86400_000);
  const mk = (n, extra = {}) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: old, bonusPoints: 1000, ...extra } });
  const admin = await E2E.getAdmin(p, bcrypt);
  const A = tok(admin);
  const u = await mk('a'), u2 = await mk('b');
  const T = tok(u);
  const bal = async (x) => (await p.user.findUnique({ where: { id: x.id }, select: { bonusPoints: true } })).bonusPoints;
  const net = async (x, source) => { const rows = await p.pointsLedger.findMany({ where: { userId: x.id, ...(source ? { source } : {}) } }); return { credit: rows.reduce((s, r) => s + r.credit, 0), debit: rows.reduce((s, r) => s + r.debit, 0), count: rows.reduce((s, r) => s + r.count, 0), rows: rows.length }; };

  let ov = await call('GET', '/admin/economy', A);
  check('déclencheur installé', ov.s === 200 && ov.b.installed === true);
  check('administration seule', (await call('GET', '/admin/economy', T)).s === 403);

  // ---- écriture directe sans étiquette : « autre »
  await p.user.update({ where: { id: u.id }, data: { bonusPoints: { increment: 50 } } });
  await p.user.update({ where: { id: u.id }, data: { bonusPoints: { decrement: 20 } } });
  let n = await net(u, 'autre');
  check('changements sans étiquette comptés dans « autre » (+50, -20), regroupés par heure', n.credit === 50 && n.debit === 20 && n.count === 2 && n.rows === 1, JSON.stringify(n));
  await p.user.update({ where: { id: u.id }, data: { username: u.username } });
  check('un changement qui ne touche pas aux points n\'écrit rien', (await net(u, 'autre')).count === 2);

  // ---- écritures simultanées sur le même membre : aucune perte
  await Promise.all(Array.from({ length: 20 }, () => p.user.update({ where: { id: u2.id }, data: { bonusPoints: { increment: 3 } } })));
  n = await net(u2, 'autre');
  check('20 écritures simultanées : 60 points, 20 lignes comptées, une seule ligne d\'heure', n.credit === 60 && n.count === 20 && n.rows === 1, JSON.stringify(n));

  // ---- jeux : l'étiquette de source est posée
  let r = await call('POST', '/games/wheel/spin', T);
  const wheelReward = r.b.reward.total;
  n = await net(u, 'wheel');
  check('roue : crédit exact sous « wheel »', r.s === 201 && n.credit === wheelReward && n.debit === 0, `attendu=${wheelReward} journal=${n.credit}`);
  await sleep(1000);
  r = await call('POST', '/games/dice/roll', T, { kind: 'OVER', n: 6, stake: 10 });
  n = await net(u, 'dice');
  check('dés : mise débitée et gain crédité sous « dice »', r.s === 201 && n.debit === 10 && n.credit === r.b.payout, `payout=${r.b.payout} journal=${JSON.stringify(n)}`);
  await sleep(1000);
  r = await call('POST', '/games/slots/spin', T, { machine: 'cinema', daily: true });
  n = await net(u, 'slots');
  check('machines (tour gratuit) : gain crédité sous « slots », rien de débité', r.s === 201 && n.credit === r.b.win && n.debit === 0, `win=${r.b.win} journal=${JSON.stringify(n)}`);
  await sleep(500);
  r = await call('POST', '/games/cards/daily', T); await call('POST', '/games/cards/open', T);
  check('cartes : aucun mouvement de points', (await net(u, 'cards')).count === 0);

  // ---- l'invariant : solde = départ + somme du journal
  const all = await net(u);
  const b = await bal(u);
  check('invariant : solde = 1000 + crédits - débits du journal (toutes sources)', Math.abs(b - (1000 + all.credit - all.debit)) < 1e-6, `solde=${b} journal=${1000 + all.credit - all.debit}`);
  const all2 = await net(u2);
  check('invariant pour le second membre', Math.abs((await bal(u2)) - (1000 + all2.credit - all2.debit)) < 1e-6);

  // ---- tableau de bord
  ov = await call('GET', '/admin/economy?days=7', A);
  const d24 = ov.b.totals.h24.find((x) => x.id === 'wheel');
  check('tableau de bord : totaux par source sur 24 h', ov.s === 200 && d24.credit >= wheelReward && ov.b.totals.h24.find((x) => x.id === 'dice').debit >= 10, JSON.stringify(d24));
  check('tableau de bord : résumé et série par jour', typeof ov.b.summary.createdFree24h === 'number' && Array.isArray(ov.b.daily) && ov.b.daily.length >= 1);
  check('sources décrites (libellés lisibles)', ov.b.sources.some((s) => s.id === 'blackjack' && /lackjack/.test(s.label)));

  // ---- gains inhabituels : seuil bas, puis retour au seuil normal
  await p.user.update({ where: { id: u.id }, data: { bonusPoints: { increment: 5000 } } }); // « autre » : ne compte pas
  const cfg0 = ov.b.config;
  let sv = await call('PUT', '/admin/economy/config', A, { alertThreshold: 1 });
  check('seuil d\'alerte réglable', sv.s === 200 && sv.b.config.alertThreshold === 1);
  await sleep(300);
  ov = await call('GET', '/admin/economy', A);
  check('gains inhabituels : le membre apparaît parmi les plus gros gagnants (jeux et gratuit seulement, pas « autre »)', ov.b.earners24h.some((e) => e.username === u.username) && ov.b.earners24h.every((e) => !('autre' in e.bySource)), JSON.stringify(ov.b.earners24h.slice(0, 2)));
  const hs = await call('GET', '/admin/monitoring/health', A);
  const eco = hs.b.checks.find((c) => c.id === 'economy');
  check('la santé du site signale les gains inhabituels', !!eco && eco.level === 'warn' && eco.detail.includes(u.username), eco ? eco.detail.slice(0, 120) : 'contrôle absent');
  await call('PUT', '/admin/economy/config', A, { alertThreshold: cfg0.alertThreshold });
  await sleep(300);
  const hs2 = await call('GET', '/admin/monitoring/health', A);
  check('seuil remis : plus d\'avertissement', (hs2.b.checks.find((c) => c.id === 'economy') || {}).level !== 'warn' || hs2.b.checks.find((c) => c.id === 'economy').level === 'ok');
  check('réglage invalide ignoré', (await call('PUT', '/admin/economy/config', A, { alertThreshold: 'x' })).b.config.alertThreshold === cfg0.alertThreshold);

  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTOUT PASSE');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
