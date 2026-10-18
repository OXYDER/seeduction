// Test de bout en bout : defis. Voir README.md.
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const D = E2E.DIST;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const bcrypt = require(B + 'bcrypt');
const ch = require(D + 'common/utils/challenges');
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
  const tag = 'ch' + Date.now().toString(36).slice(-4);
  const hash = await bcrypt.hash('Mot-de-passe-test-1', 4);
  const old = new Date(Date.now() - 30 * 86400_000);
  const mk = (n, extra = {}) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: old, bonusPoints: 3000, ...extra } });
  const admin = await E2E.getAdmin(p, bcrypt);
  const A = tok(admin);
  const u = await mk('a'), young = await mk('y', { createdAt: new Date() }), u2 = await mk('b');
  const pts = async (x) => (await p.user.findUnique({ where: { id: x.id }, select: { bonusPoints: true } })).bonusPoints;
  const today = torontoDay();

  const adm = await call('GET', '/games/challenges/admin', A);
  const cfg0 = adm.b.config;
  check('réglages par défaut', adm.s === 200 && cfg0.rewardScale === 100 && cfg0.dailyBonus.packs === 1);
  let ov = await call('GET', '/games/challenges', tok(u));
  check('aperçu : trois défis du jour (facile, moyen, difficile) et trois de la semaine', ov.s === 200 && ov.b.daily.map((d) => d.tier).join() === 'easy,medium,hard' && ov.b.weekly.length === 3 && ov.b.daily.every((d) => d.progress === 0 && !d.done), ov.b.daily.map((d) => d.id).join());
  check('mêmes défis que le catalogue pour la date', JSON.stringify(ov.b.daily.map((d) => d.id)) === JSON.stringify(ch.pick('daily', today).map((d) => d.id)));
  ov = await call('GET', '/games/challenges', tok(young));
  check('compte trop récent : message clair', ov.s === 200 && /au moins/.test(ov.b.blocked ?? ''));

  // ---- vraies actions dans tous les jeux (activités gratuites)
  const counts = { wheel: 0, cards_daily: 0, cards_open: 0, free_play: 0, picks: 0, picks_won: 0, quiz: 0, quiz_correct: 0, quiz_perfect: 0 };
  const games = new Set();
  const T = tok(u);
  let r = await call('POST', '/games/wheel/spin', T); check('roue tournée', r.s === 201); counts.wheel++; games.add('wheel');
  r = await call('POST', '/games/cards/daily', T); check('paquet du jour réclamé', r.s === 201); counts.cards_daily++; games.add('cards');
  r = await call('POST', '/games/cards/open', T); check('paquet ouvert', r.s === 201); counts.cards_open++;
  await sleep(1000);
  r = await call('POST', '/games/slots/spin', T, { machine: 'cinema', daily: true }); check('tour gratuit des machines', r.s === 201, r.raw.slice(0, 80)); counts.free_play++; games.add('slots');
  await sleep(1000);
  r = await call('POST', '/games/dice/roll', T, { kind: 'OVER', n: 6, daily: true }); check('lancer gratuit des dés', r.s === 201, r.raw.slice(0, 80)); counts.free_play++; games.add('dice');
  await sleep(500);
  r = await call('POST', '/games/blackjack/start', T, { daily: true }); check('main gratuite de blackjack', r.s === 201); counts.free_play++; games.add('blackjack');
  await sleep(500);
  r = await call('POST', '/games/hilo/start', T, { daily: true }); check('partie gratuite Plus haut ou plus bas', r.s === 201); counts.free_play++; games.add('hilo');

  // pronostics : 6 matchs fictifs
  const base = 1_500_000_000 + (Date.now() % 90_000_000);
  const gs = []; for (let i = 0; i < 6; i++) gs.push(await p.nhlGame.create({ data: { id: base + i, day: today, startUtc: new Date(Date.now() + 600 * 60_000), kind: 'SAISON', homeAbbrev: 'MTL', awayAbbrev: 'TOR', homeName: 'Canadiens', awayName: 'Maple Leafs' } }));
  for (const g of gs) { r = await call('POST', '/games/picks/pick', T, { gameId: g.id, pick: 'H' }); if (r.s === 201) counts.picks++; }
  check('6 pronostics faits', counts.picks === 6); games.add('picks');
  r = await call('POST', '/games/picks/pick', T, { gameId: gs[0].id, pick: 'A' });
  check('changer de pronostic ne compte pas deux fois', r.s === 201);
  for (let i = 0; i < 6; i++) { const home = i < 4 ? 4 : 1, away = i < 4 ? 1 : 4; await call('POST', `/games/picks/admin/games/${gs[i].id}/settle`, A, { home, away }); if (i < 4 && i > 0) counts.picks_won++; await sleep(30); }
  // gs[0] : le membre a changé pour « visiteur » (A) alors que le domicile gagne : perdu ; gs[1..3] gagnés ; gs[4..5] perdus (H choisi, visiteur gagne)
  check('pronostics réglés', (await p.nhlPick.count({ where: { userId: u.id, status: 'WON' } })) === 3);
  games.add('quiz');

  // quiz : 5 bonnes réponses (chrono réduit)
  const qcfg = (await call('GET', '/games/quiz/admin', A)).b.config;
  await call('PUT', '/games/quiz/admin', A, { ...qcfg, secondsPerQuestion: 8 });
  const st = await call('POST', '/games/quiz/start', T); let play = st.b.play;
  for (let i = 0; i < 5; i++) {
    await sleep(Math.max(0, play.startsAt - play.serverNow) + 100);
    const q = await p.quizQuestion.findUnique({ where: { id: play.question.id } });
    const a = await call('POST', '/games/quiz/answer', T, { index: play.index, choice: q.answer }); play = a.b.play;
  }
  check('quiz sans faute', play.status === 'DONE' && play.result.perfect === true);
  counts.quiz = 1; counts.quiz_correct = 5; counts.quiz_perfect = 1;
  await call('PUT', '/games/quiz/admin', A, qcfg);
  await sleep(2500); // les défis sont comptés en arrière-plan

  // ---- vérification des défis du jour et de la semaine
  ov = await call('GET', '/games/challenges', T);
  const all = [...ov.b.daily, ...ov.b.weekly];
  const defs = [...ch.pick('daily', today), ...ch.pick('weekly', ov.b.weekStart)];
  counts.distinct = games.size;
  let okProg = true, detail = [];
  for (const d of all) {
    const def = defs.find((x) => x.id === d.id);
    const exp = Math.min(def.target, counts[def.event] ?? 0);
    if (d.progress !== exp || d.done !== (exp >= def.target)) { okProg = false; detail.push(`${d.id}: ${d.progress}/${d.target} done=${d.done} attendu ${exp}`); }
  }
  check('progression exacte de chaque défi du jour et de la semaine', okProg, detail.join(' | ') || all.map((d) => `${d.id} ${d.progress}/${d.target}${d.done ? '✓' : ''}`).join(', '));
  const rows = await p.challengeProgress.findMany({ where: { userId: u.id, done: true } });
  check('récompense enregistrée pour chaque défi réussi (points du catalogue)', rows.every((x) => x.points === ch.scaled(ch.challengeById(x.cid).points, cfg0)) && rows.length === all.filter((d) => d.done).length, `réussis=${rows.length}`);
  const dailyDone = ov.b.daily.every((d) => d.done);
  check('bonus du jour versé seulement si les trois défis sont réussis', ov.b.bonus.daily.done === dailyDone && (await p.challengeBonus.count({ where: { userId: u.id, scope: 'daily' } })) === (dailyDone ? 1 : 0), 'trois réussis=' + dailyDone);
  check('activités gratuites : jeux différents comptés', (await p.challengeActivity.count({ where: { userId: u.id, day: today } })) === games.size, 'jeux=' + games.size);
  check('résumé de la page Jeux', (await call('GET', '/games/summary', T)).b.challenges.dailyDone === ov.b.daily.filter((d) => d.done).length);
  const notes = await p.notification.count({ where: { userId: u.id, category: 'games', title: { contains: 'Défi réussi' } } });
  check('notification de défi réussi', rows.length === 0 || notes >= 1, 'n=' + notes);

  // ---- aucune double récompense : mêmes événements répétés
  const before = new Map(rows.map((x) => [x.cid, x.points]));
  const bal0 = await pts(u); const t0 = new Date();
  await p.cardWallet.update({ where: { userId: u.id }, data: { packs: 6 } });
  const doneBefore = await p.challengeProgress.count({ where: { userId: u.id, done: true } });
  for (let i = 0; i < 6; i++) { await call('POST', '/games/cards/open', T); await sleep(120); }
  await sleep(2000);
  const after = await p.challengeProgress.findMany({ where: { userId: u.id, done: true } });
  const newly = after.filter((x) => !before.has(x.cid));
  const bonusNew = await p.challengeBonus.findMany({ where: { userId: u.id } });
  check('rouvrir des paquets ne repaie aucun défi déjà réussi', after.filter((x) => before.has(x.cid)).every((x) => x.points === before.get(x.cid)));
  const expectedExtra = newly.reduce((s, x) => s + x.points, 0);
  const packsSets = await p.cardSetReward.aggregate({ where: { userId: u.id }, _sum: { points: true } });
  const bonusExtra = bonusNew.filter((b) => b.createdAt > t0).reduce((s, b) => s + b.points, 0);
  check('solde : seulement les nouveaux défis réussis éventuels', (await pts(u)) - bal0 === expectedExtra + bonusExtra + (packsSets._sum.points ?? 0), `delta=${(await pts(u)) - bal0} attendu=${expectedExtra + bonusExtra}`);
  check('nombre de défis réussis cohérent', after.length >= doneBefore);

  // ---- compte récent, défis fermés, réglages
  r = await call('POST', '/games/cards/daily', tok(young));
  await sleep(500);
  check('compte récent : aucune progression', (await p.challengeProgress.count({ where: { userId: young.id } })) === 0);
  await call('PUT', '/games/challenges/admin', A, { ...cfg0, enabled: false });
  await call('POST', '/games/cards/daily', tok(u2)); await sleep(1500);
  check('défis fermés : aucune progression', (await p.challengeProgress.count({ where: { userId: u2.id } })) === 0);
  const sv = await call('PUT', '/games/challenges/admin', A, { ...cfg0, rewardScale: 50 });
  check('échelle des points réglable', sv.s === 200 && sv.b.config.rewardScale === 50);
  ov = await call('GET', '/games/challenges', tok(u2));
  check('points affichés à l\'échelle', ov.b.daily.every((d) => d.points === ch.scaled(ch.challengeById(d.id).points, { ...cfg0, rewardScale: 50 })));
  await call('PUT', '/games/challenges/admin', A, cfg0);

  // ---- administration
  const a2 = await call('GET', '/games/challenges/admin', A);
  check('administration : défis en cours et statistiques', a2.s === 200 && a2.b.current.length === 6 && a2.b.stats.completions7d >= rows.length && a2.b.current.every((c) => typeof c.done === 'number'), JSON.stringify(a2.b.stats));
  check('administration refusée aux membres', (await call('GET', '/games/challenges/admin', T)).s === 403);

  await p.nhlGame.deleteMany({ where: { id: { gte: 1_500_000_000, lt: 1_600_000_000 } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTOUT PASSE');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
