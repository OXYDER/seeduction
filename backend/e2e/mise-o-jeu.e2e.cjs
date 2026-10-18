// Test de bout en bout : mise-o-jeu. Voir README.md.
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
  const tag = 'moj' + Date.now().toString(36).slice(-4);
  const hash = await bcrypt.hash('Mot-de-passe-test-1', 4);
  const old = new Date(Date.now() - 30 * 86400_000);
  const mk = (n, extra = {}) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: old, bonusPoints: 1000, ...extra } });
  const admin = await E2E.getAdmin(p, bcrypt);
  const u1 = await mk('a'), u2 = await mk('b'), u3 = await mk('c', { donatedPoints: 900 }), young = await mk('y', { createdAt: new Date() });
  const T = { a: tok(u1), b: tok(u2), c: tok(u3), y: tok(young), admin: tok(admin) };
  const pts = async (u) => { const r = await p.user.findUnique({ where: { id: u.id }, select: { bonusPoints: true, donatedPoints: true } }); return r; };
  const mkMatch = (n, hours) => p.mojMatch.create({ data: { nhlGameId: 990000 + Math.floor(Math.random() * 9000) + n, team: 'MTL', startUtc: new Date(Date.now() + hours * 3600_000), kind: 'SAISON', homeAbbrev: 'MTL', awayAbbrev: 'BOS', homeName: 'Canadiens', awayName: 'Bruins', mineSide: 'home' } });

  // --- aperçu
  const m1 = await mkMatch(1, 2);
  let ov = await call('GET', '/games/moj', T.a);
  check('aperçu : 200 et le match est listé', ov.s === 200 && ov.b.matches.some((m) => m.id === m1.id), JSON.stringify(ov.b?.me));
  check('aperçu : 1000 misables', ov.b.me.stakeable === 1000);
  const ov3 = await call('GET', '/games/moj', T.c);
  check('points de don : 900 non misables, 100 misables', ov3.b.me.stakeable === 100 && ov3.b.me.donated === 900, JSON.stringify(ov3.b.me));

  // --- paris
  const bet = (t, market, pick, stake) => call('POST', '/games/moj/bet', t, { matchId: m1.id, market, pick, stake });
  check('u1 mise 100 sur victoire', (await bet(T.a, 'WIN', 'W', 100)).s === 201);
  check('u2 mise 50 sur défaite', (await bet(T.b, 'WIN', 'L', 50)).s === 201);
  const over = await bet(T.c, 'WIN', 'L', 200);
  check('u3 ne peut pas miser plus que ses points non issus d\'un don', over.s === 400, over.b?.message);
  check('u3 mise 100 (tout ce qui est misable)', (await bet(T.c, 'WIN', 'L', 100)).s === 201);
  const dup = await bet(T.a, 'WIN', 'W', 100);
  check('pari en double refusé', dup.s === 400, dup.b?.message);
  check('mise trop petite refusée', (await bet(T.a, 'MODE', 'REG', 5)).s === 400);
  check('mise trop grande refusée', (await bet(T.a, 'MODE', 'REG', 9999)).s === 400);
  check('choix invalide refusé', (await bet(T.a, 'MODE', 'ZZZ', 0)).s === 400);
  check('compte trop récent refusé', (await bet(T.y, 'WIN', 'W', 0)).s === 400);
  check('pronostic gratuit : u1 fin de match REG', (await bet(T.a, 'MODE', 'REG', 0)).s === 201);
  check('pronostic gratuit : u2 score 3-2', (await bet(T.b, 'SCORE', '3-2', 0)).s === 201);
  check('pronostic gratuit : u3 score 5-0 (perdant)', (await bet(T.c, 'SCORE', '5-0', 0)).s === 201);
  check('déduction des mises : u1 900, donated u3 inchangé', (await pts(u1)).bonusPoints === 900 && (await pts(u3)).donatedPoints === 900 && (await pts(u3)).bonusPoints === 900);
  ov = await call('GET', '/games/moj', T.a);
  const pool = ov.b.matches.find((m) => m.id === m1.id).pools.WIN;
  check('caisse visible : W=100, L=150', pool.W.points === 100 && pool.L.points === 150 && pool.L.players === 2, JSON.stringify(pool));

  // --- pari après le début
  await p.mojMatch.update({ where: { id: m1.id }, data: { startUtc: new Date(Date.now() - 60_000) } });
  check('pari après le début refusé', (await bet(T.b, 'MODE', 'OT', 0)).s === 400);

  // --- règlement manuel (admin)
  check('un membre ordinaire ne peut pas régler', (await call('POST', `/games/moj/admin/${m1.id}/settle`, T.a, { mine: 3, theirs: 2, mode: 'REG' })).s === 403);
  check('égalité refusée', (await call('POST', `/games/moj/admin/${m1.id}/settle`, T.admin, { mine: 2, theirs: 2, mode: 'REG' })).s === 400);
  const st = await call('POST', `/games/moj/admin/${m1.id}/settle`, T.admin, { mine: 3, theirs: 2, mode: 'REG' });
  check('règlement admin 3-2 en temps réglementaire', st.s === 201, JSON.stringify(st.b));
  const a = await pts(u1), b = await pts(u2), c = await pts(u3);
  // WIN : caisse 250 -> u1 gagne 250. u1 : 900 + 250 + 15 (MODE gratuit) = 1165. u2 : 950 + 40 = 990. u3 : 900 (rien).
  check('u1 gagne la caisse (250) + 15 gratuit', a.bonusPoints === 1165, String(a.bonusPoints));
  check('u2 gagne le pronostic exact (40)', b.bonusPoints === 990, String(b.bonusPoints));
  check('u3 perd sa mise, ses points de don intacts', c.bonusPoints === 900 && c.donatedPoints === 900, JSON.stringify(c));
  const twice = await call('POST', `/games/moj/admin/${m1.id}/settle`, T.admin, { mine: 3, theirs: 2, mode: 'REG' });
  check('double règlement refusé', twice.s === 400);
  check('aucun point créé ni perdu sur les mises (somme des 3 : avant 3000, après 3055 = +15 +40 de gratuits)', a.bonusPoints + b.bonusPoints + c.bonusPoints === 3055);
  const nb = await p.notification.findMany({ where: { userId: u1.id, category: 'games' } });
  check('u1 notifié du gain', nb.length === 1 && /gagné 165/.test(nb[0].title), nb[0]?.title);
  ov = await call('GET', '/games/moj', T.a);
  check('classement : u1 en tête', ov.b.leaderboard[0]?.username === u1.username, JSON.stringify(ov.b.leaderboard.slice(0, 2)));

  // --- remboursement
  const m2 = await mkMatch(2, 3);
  const bet2 = (t, pick, stake) => call('POST', '/games/moj/bet', t, { matchId: m2.id, market: 'WIN', pick, stake });
  await bet2(T.a, 'W', 100); await bet2(T.b, 'L', 100);
  const before = [(await pts(u1)).bonusPoints, (await pts(u2)).bonusPoints];
  check('mises débitées', before[0] === 1065 && before[1] === 890, JSON.stringify(before));
  check('remboursement admin', (await call('POST', `/games/moj/admin/${m2.id}/refund`, T.admin)).s === 201);
  check('mises rendues', (await pts(u1)).bonusPoints === 1165 && (await pts(u2)).bonusPoints === 990);

  // --- pas assez de joueurs : un seul joueur => remboursé au règlement
  const m3 = await mkMatch(3, 4);
  await call('POST', '/games/moj/bet', T.a, { matchId: m3.id, market: 'WIN', pick: 'W', stake: 100 });
  await p.mojMatch.update({ where: { id: m3.id }, data: { startUtc: new Date(Date.now() - 60_000) } });
  await call('POST', `/games/moj/admin/${m3.id}/settle`, T.admin, { mine: 1, theirs: 4, mode: 'REG' });
  check('un seul joueur : mise remboursée', (await pts(u1)).bonusPoints === 1165);

  // --- les points de don voyagent avec un envoi
  const tr = await call('POST', '/bonus/transfer', T.c, { userId: u2.id, amount: 400 });
  check('envoi de 400 points par u3', tr.s === 201, JSON.stringify(tr.b));
  const c2 = await pts(u3), b2 = await pts(u2);
  check('la part don suit : u3 donated 500, u2 donated 400', c2.donatedPoints === 500 && b2.donatedPoints === 400, JSON.stringify({ c2, b2 }));
  // --- dépense : les points de don partent en premier
  const sh = await call('POST', '/bonus/redeem', T.c, { item: 'freeleech_token' });
  check('achat boutique (300) : points de don dépensés en premier', sh.s === 201 && (await pts(u3)).donatedPoints === 200 && (await pts(u3)).bonusPoints === 200, JSON.stringify(await pts(u3)));

  // --- retrait des jeux
  check('se retirer des jeux', (await call('PUT', '/games/moj/opt-out', T.a, { value: true })).s === 200);
  const m4 = await mkMatch(4, 5);
  const blocked = await call('POST', '/games/moj/bet', T.a, { matchId: m4.id, market: 'WIN', pick: 'W', stake: 0 });
  check('retiré : plus de pari', blocked.s === 400, blocked.b?.message);

  // --- réglages
  const cfg = await call('PUT', '/games/moj/admin', T.admin, { minStake: 20, freePrize: { WIN: 12 } });
  check('réglages enregistrés', cfg.s === 200 && cfg.b.config.minStake === 20 && cfg.b.config.freePrize.WIN === 12 && cfg.b.config.freePrize.MODE === 15, JSON.stringify(cfg.b?.config?.freePrize));
  await call('PUT', '/games/moj/admin', T.admin, { minStake: 10, freePrize: { WIN: 10 } });

  await p.mojBet.deleteMany({ where: { userId: { in: [u1.id, u2.id, u3.id, young.id] } } });
  await p.mojMatch.deleteMany({ where: { id: { in: [m1.id, m2.id, m3.id, m4.id] } } });
  await p.notification.deleteMany({ where: { userId: { in: [u1.id, u2.id, u3.id] } } });
  await p.pointTransfer.deleteMany({ where: { OR: [{ fromId: u3.id }, { toId: u3.id }] } });
  await p.user.deleteMany({ where: { id: { in: [u1.id, u2.id, u3.id, young.id] } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTOUT EST OK');
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
