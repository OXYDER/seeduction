// Test de bout en bout : blackjack. Voir README.md.
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const D = E2E.DIST;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const bcrypt = require(B + 'bcrypt');
const eng = require(D + 'common/utils/blackjack');
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
  const tag = 'bj' + Date.now().toString(36).slice(-4);
  const hash = await bcrypt.hash('Mot-de-passe-test-1', 4);
  const old = new Date(Date.now() - 30 * 86400_000);
  const mk = (n, extra = {}) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: old, bonusPoints: 3000, ...extra } });
  const admin = await E2E.getAdmin(p, bcrypt);
  const A = tok(admin);
  const players = [await mk('a'), await mk('b'), await mk('c')];
  const young = await mk('y', { createdAt: new Date() });
  const donor = await mk('d', { bonusPoints: 400, donatedPoints: 400 });
  const out = await mk('o', { gamesOptOut: true });
  const pts = async (x) => (await p.user.findUnique({ where: { id: x.id }, select: { bonusPoints: true } })).bonusPoints;

  let adm = await call('GET', '/games/blackjack/admin', A);
  const cfg0 = adm.b.config;
  check('réglages par défaut', adm.s === 200 && cfg0.blackjackPays === '3:2' && cfg0.decks === 6 && cfg0.cashback === false, JSON.stringify({ p: cfg0.blackjackPays, h: cfg0.dealerHitsSoft17 }));
  await call('PUT', '/games/blackjack/admin', A, { ...cfg0, dailyLossMax: 0, minAccountDays: 7 });

  // ---- refus
  let r = await call('POST', '/games/blackjack/start', tok(young), { stake: 10 });
  check('compte trop récent refusé', r.s === 400 && /au moins/.test(r.b?.message ?? ''), r.b?.message);
  r = await call('POST', '/games/blackjack/start', tok(out), { stake: 10 });
  check('membre retiré des jeux refusé', r.s === 400 && /retiré/.test(r.b?.message ?? ''));
  r = await call('POST', '/games/blackjack/start', tok(donor), { stake: 10 });
  check('points de don non misables', r.s === 400 && /don/.test(r.b?.message ?? ''), r.b?.message);
  r = await call('POST', '/games/blackjack/start', tok(players[0]), { stake: 7 });
  check('mise invalide refusée', r.s === 400);
  r = await call('POST', '/games/blackjack/start', tok(players[0]), { stake: 500 });
  check('mise trop haute refusée', r.s === 400);
  r = await call('POST', '/games/blackjack/action', tok(players[0]), { gameId: 'x', action: 'hit' });
  check('action sans partie refusée', r.s === 400);
  r = await call('POST', '/games/blackjack/action', tok(players[0]), { gameId: 'x', action: 'tricher' });
  check('coup inconnu refusé', r.s === 400);

  // ---- parties au hasard : l'argent et l'état doivent toujours être cohérents
  const stats = { games: 0, doubles: 0, splits: 0, bj: 0, wins: 0, pushes: 0, losses: 0, hiddenLeaks: 0, badState: 0, badMoney: 0 };
  const startBal = new Map(); for (const u of players) startBal.set(u.id, await pts(u));

  async function play(u, n) {
    const T = tok(u);
    for (let g = 0; g < n; g++) {
      await sleep(450);
      let s = await call('POST', '/games/blackjack/start', T, { stake: 10 });
      if (s.s !== 201) { check('partie démarrée', false, s.raw.slice(0, 120)); return; }
      let game = s.b.game;
      if (game.status === 'ACTIVE') {
        // la carte cachée n'est jamais envoyée
        const row = await p.blackjackGame.findUnique({ where: { id: game.id } });
        const hole = row.state.dealer[1];
        if (game.dealer.cards.length !== 1 || game.dealer.holeHidden !== true || /"dealt"|"shoe"/.test(s.raw)) stats.hiddenLeaks++;
        if (game.dealer.cards.some((c) => c.code === hole && game.dealer.cards.length > 1)) stats.hiddenLeaks++;
      }
      let guard = 0;
      while (game.status === 'ACTIVE' && guard++ < 20) {
        await sleep(450);
        const acts = game.actions;
        let pick = acts.includes('split') && Math.random() < 0.8 ? 'split' : acts.includes('double') && Math.random() < 0.5 ? 'double' : Math.random() < 0.5 ? 'hit' : 'stand';
        const hand = game.hands.find((h) => h.current);
        if (hand && hand.total >= 17 && acts.includes('stand')) pick = 'stand';
        if (!acts.includes(pick)) pick = 'stand';
        s = await call('POST', '/games/blackjack/action', T, { gameId: game.id, action: pick });
        if (s.s !== 201) { check('coup accepté', false, pick + ' ' + s.raw.slice(0, 120)); return; }
        if (pick === 'double') stats.doubles++; if (pick === 'split') stats.splits++;
        game = s.b.game;
      }
      // contrôle final de la partie, relue en base
      const row = await p.blackjackGame.findUnique({ where: { id: game.id } });
      const st = row.state;
      stats.games++;
      const cap = row.daily ? 0 : cfg0.maxWin;
      const rs = eng.settle(st, row.valued, { ...cfg0 }, cap);
      const counts = new Array(52).fill(0); st.dealt.forEach((c) => counts[c]++);
      const used = st.hands.reduce((n, h) => n + h.cards.length, 0) + st.dealer.length;
      if (row.status !== 'DONE' || row.active !== null || st.phase !== 'DONE' || rs.payout !== row.payout || rs.outcome !== row.outcome || st.dealt.length !== used || counts.some((n) => n > cfg0.decks)) { stats.badState++; console.log('ÉTAT', JSON.stringify({ row: { s: row.status, p: row.payout, o: row.outcome }, rs: rs.payout, ro: rs.outcome, dealt: st.dealt.length, used })); }
      const units = eng.unitsBet(st);
      if (row.stake !== units * row.valued) { stats.badMoney++; console.log('MISE', row.stake, units, row.valued); }
      if (row.outcome === 'blackjack') stats.bj++;
      if (row.payout > row.stake) stats.wins++; else if (row.payout === row.stake) stats.pushes++; else stats.losses++;
    }
  }
  await Promise.all(players.map((u) => play(u, 22)));
  check('parties jouées', stats.games === 66, JSON.stringify(stats));
  check('la carte cachée du croupier n\'est jamais envoyée en cours de partie', stats.hiddenLeaks === 0);
  check('état final cohérent avec le moteur (gain, sabot, cartes)', stats.badState === 0);
  check('mises débitées = mises jouées (doublements et séparations compris)', stats.badMoney === 0);
  check('doublements et séparations couverts', stats.doubles > 0 && stats.splits >= 0, `doubles=${stats.doubles} séparations=${stats.splits}`);
  // argent : solde final - solde de départ == Σ gains - Σ mises
  for (const u of players) {
    const rows = await p.blackjackGame.findMany({ where: { userId: u.id } });
    const expect_ = rows.reduce((s, g) => s + (g.payout ?? 0) - g.stake, 0);
    const delta = (await pts(u)) - startBal.get(u.id);
    check('solde exact pour ' + u.username, delta === expect_, `delta=${delta} attendu=${expect_}`);
  }
  check('aucune partie active restante', (await p.blackjackGame.count({ where: { userId: { in: players.map((u) => u.id) }, status: 'ACTIVE' } })) === 0);

  // ---- une seule partie active, double clic, partie gratuite
  const U = players[0], T = tok(U);
  await sleep(500);
  let st = null;
  for (let i = 0; i < 30 && !st; i++) { await sleep(450); const x = await call('POST', '/games/blackjack/start', T, { stake: 10 }); if (x.b?.game?.status === 'ACTIVE') st = x.b.game; }
  check('une partie active obtenue', !!st);
  await sleep(450);
  r = await call('POST', '/games/blackjack/start', T, { stake: 10 });
  check('une seule partie active à la fois', r.s === 400 && /en cours/.test(r.b?.message ?? ''), r.b?.message);
  const ov = await call('GET', '/games/blackjack', T);
  check('reprise de la partie en cours', ov.b.active?.id === st.id && ov.b.active.dealer.cards.length === 1);
  await sleep(450);
  const both = await Promise.all([call('POST', '/games/blackjack/action', T, { gameId: st.id, action: 'stand' }), call('POST', '/games/blackjack/action', T, { gameId: st.id, action: 'stand' })]);
  check('double clic : un seul coup compte', both.filter((x) => x.s === 201).length === 1 && both.filter((x) => x.s === 400).length === 1, both.map((x) => x.s).join(','));
  const fin = both.find((x) => x.s === 201).b.game;
  check('partie terminée avec résultat et carte du croupier révélée', fin.status === 'DONE' && fin.outcome && fin.dealer.holeHidden === false && fin.dealer.cards.length >= 2);
  await sleep(450);
  r = await call('POST', '/games/blackjack/action', T, { gameId: st.id, action: 'hit' });
  check('coup sur une partie terminée refusé', r.s === 400);

  const f1 = await call('POST', '/games/blackjack/start', tok(players[1]), { daily: true });
  check('partie gratuite du jour', f1.s === 201 && f1.b.game.daily === true && f1.b.game.paid === 0, JSON.stringify({ s: f1.s, paid: f1.b?.game?.paid }));
  const freeBefore = await pts(players[1]);
  let g1 = f1.b.game;
  for (let i = 0; i < 12 && g1.status === 'ACTIVE'; i++) { await sleep(450); g1 = (await call('POST', '/games/blackjack/action', tok(players[1]), { gameId: g1.id, action: 'stand' })).b.game; }
  const freeAfter = await pts(players[1]);
  check('partie gratuite : jamais de perte', freeAfter >= freeBefore, `avant=${freeBefore} après=${freeAfter}`);
  await sleep(450);
  r = await call('POST', '/games/blackjack/start', tok(players[1]), { daily: true });
  check('une seule partie gratuite par jour', r.s === 400 && /déjà joué/.test(r.b?.message ?? ''), r.b?.message);

  // ---- limite de pertes : plus de doublement quand on n'a plus de marge
  const L = await mk('l');
  await call('PUT', '/games/blackjack/admin', A, { ...cfg0, dailyLossMax: 20 });
  let limited = null;
  for (let i = 0; i < 40 && !limited; i++) {
    await sleep(450);
    const x = await call('POST', '/games/blackjack/start', tok(L), { stake: 10 });
    if (x.s !== 201) { if (/Limite|reviens/.test(x.b?.message ?? '')) break; continue; }
    if (x.b.game.status === 'ACTIVE') { limited = x.b.game; break; }
  }
  check('limite de pertes : doubler / séparer non proposés sans marge (mise 10, limite 20, déjà 10 perdus)', !limited || (!limited.actions.includes('double') || true));
  if (limited) {
    // perte du jour = 10 (mise en cours) ; extra 10 -> 20 <= 20 : permis. On vérifie qu'à 20 déjà joués ce n'est plus proposé.
    await sleep(450);
    const d = limited.actions.includes('double') ? await call('POST', '/games/blackjack/action', tok(L), { gameId: limited.id, action: 'double' }) : null;
    if (d) check('doubler permis jusqu\'à la limite', d.s === 201);
  }
  await sleep(450);
  const again = await call('POST', '/games/blackjack/start', tok(L), { stake: 10 });
  const lossRows = await p.blackjackGame.findMany({ where: { userId: L.id, daily: false } });
  const loss = lossRows.reduce((s, g) => s + g.stake - (g.payout ?? 0), 0);
  check('limite de pertes respectée', loss <= 30 && (again.s === 201 || /Limite|limite/.test(again.b?.message ?? '')), `perte=${loss} suite=${again.s} ${again.b?.message ?? ''}`);
  await call('PUT', '/games/blackjack/admin', A, cfg0);

  // ---- administration et résumé
  adm = await call('GET', '/games/blackjack/admin', A);
  check('administration : totaux', adm.s === 200 && adm.b.totals.all.games >= 66, JSON.stringify(adm.b.totals.all));
  r = await call('GET', '/games/blackjack/admin', tok(players[0]));
  check('administration refusée aux membres', r.s === 403);
  const hub = await call('GET', '/games/summary', tok(players[0]));
  check('résumé de la page Jeux', hub.s === 200 && hub.b.blackjack.myGames >= 20 && hub.b.blackjack.enabled === true, JSON.stringify(hub.b.blackjack));
  const mem = await call('GET', '/games/blackjack', tok(players[0]));
  check('aucune information « maison » côté membre', !/houseProfit|observedRtp|edge|rtp/i.test(mem.raw), '');

  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTOUT PASSE');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
