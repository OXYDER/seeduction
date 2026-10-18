// Test de bout en bout : quiz. Voir README.md.
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
  const tag = 'qz' + Date.now().toString(36).slice(-4);
  const hash = await bcrypt.hash('Mot-de-passe-test-1', 4);
  const old = new Date(Date.now() - 30 * 86400_000);
  const mk = (n, extra = {}) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: old, bonusPoints: 1000, ...extra } });
  const admin = await E2E.getAdmin(p, bcrypt);
  const A = tok(admin);
  const [u1, u2, u3, u4, young] = [await mk('a'), await mk('b'), await mk('c'), await mk('d'), await mk('y', { createdAt: new Date() })];
  const pts = async (x) => (await p.user.findUnique({ where: { id: x.id }, select: { bonusPoints: true } })).bonusPoints;

  // ---- banque et réglages
  let adm = await call('GET', '/games/quiz/admin', A);
  check('banque fournie ajoutée', adm.s === 200 && adm.b.questions.length >= 60, 'n=' + adm.b?.questions?.length);
  const cfg0 = adm.b.config;
  check('réglages par défaut', cfg0.questionsPerDay === 5 && cfg0.secondsPerQuestion === 20);
  const sc = await call('PUT', '/games/quiz/admin', A, { ...cfg0, secondsPerQuestion: 8 });
  check('réglage du chrono à 8 s', sc.s === 200 && sc.b.config.secondsPerQuestion === 8);

  // ---- avant de jouer
  let ov = await call('GET', '/games/quiz', tok(u1));
  check('aperçu avant de jouer', ov.s === 200 && ov.b.play === null && ov.b.playedToday === false && ov.b.ready === true && ov.b.rules.questions === 5);
  const yo = await call('POST', '/games/quiz/start', tok(young));
  check('compte trop récent refusé', yo.s === 400 && /au moins/.test(yo.b?.message ?? ''), yo.b?.message);
  const noStart = await call('POST', '/games/quiz/answer', tok(u1), { index: 0, choice: 0 });
  check('répondre sans avoir commencé est refusé', noStart.s === 400);

  // ---- partie 1 : mélange de bonnes et mauvaises réponses, un temps écoulé
  const start1 = await call('POST', '/games/quiz/start', tok(u1));
  const pl = start1.b.play;
  check('partie commencée', start1.s === 201 && pl.status === 'ACTIVE' && pl.total === 5 && pl.index === 0 && pl.question.choices.length === 4);
  check('la bonne réponse n\'est jamais envoyée', !/"answer"|"correctText"|"explain"/.test(start1.raw), '');
  const ids = (await p.quizPlay.findFirst({ where: { userId: u1.id } })).questionIds;
  const qs = new Map((await p.quizQuestion.findMany({ where: { id: { in: ids } } })).map((q) => [q.id, q]));
  check('les 5 questions sont distinctes', new Set(ids).size === 5);
  const again = await call('POST', '/games/quiz/start', tok(u1));
  check('reprendre renvoie la même partie', again.b.play.question.id === pl.question.id && JSON.stringify(again.b.play.question.choices) === JSON.stringify(pl.question.choices));
  const early = await call('POST', '/games/quiz/answer', tok(u1), { index: 0, choice: 0 });
  check('répondre avant le début du chrono est refusé', early.s === 400 && /pas encore/.test(early.b?.message ?? ''), early.b?.message);

  async function waitFor(play) { const w = play.startsAt - play.serverNow + 80; if (w > 0) await sleep(w); }
  async function answer(T, play, which) {
    // which : 'good' | 'bad' | 'none'
    const q = qs.get(play.question.id) ?? (await p.quizQuestion.findUnique({ where: { id: play.question.id } }));
    qs.set(q.id, q);
    const choice = which === 'good' ? q.answer : which === 'bad' ? (q.answer + 1) % 4 : null;
    return call('POST', '/games/quiz/answer', T, { index: play.index, choice });
  }

  await waitFor(pl);
  const before1 = await pts(u1);
  let r = await answer(tok(u1), pl, 'good');
  check('bonne réponse : points avec bonus de rapidité', r.s === 201 && r.b.correct === true && r.b.points >= 10 && r.b.points <= 15, 'points=' + r.b.points);
  check('la bonne réponse est révélée', typeof r.b.answer === 'number');
  const dbl = await call('POST', '/games/quiz/answer', tok(u1), { index: 0, choice: 0 });
  check('répondre deux fois à la même question est refusé', dbl.s === 400, dbl.b?.message);
  let play = r.b.play;
  check('question suivante avec nouveau chrono', play.index === 1 && play.startsAt > play.serverNow && play.answered === 1);

  await waitFor(play);
  // deux requêtes simultanées pour la même question : une seule est comptée
  const q2 = qs.get(play.question.id) ?? (await p.quizQuestion.findUnique({ where: { id: play.question.id } }));
  const both = await Promise.all([call('POST', '/games/quiz/answer', tok(u1), { index: 1, choice: (q2.answer + 1) % 4 }), call('POST', '/games/quiz/answer', tok(u1), { index: 1, choice: (q2.answer + 1) % 4 })]);
  check('deux réponses simultanées : une seule compte', both.filter((x) => x.s === 201).length === 1 && both.filter((x) => x.s === 400).length === 1, both.map((x) => x.s).join(','));
  play = (both.find((x) => x.s === 201)).b.play;
  check('mauvaise réponse comptée', both.find((x) => x.s === 201).b.correct === false && both.find((x) => x.s === 201).b.points === 0 && play.correct === 1);

  await waitFor(play);
  r = await answer(tok(u1), play, 'good'); play = r.b.play;
  check('3e question réussie', r.b.correct === true && play.index === 3);

  // 4e : on laisse le temps passer (8 s + marge)
  await waitFor(play);
  await sleep(8000 + 1700);
  ov = await call('GET', '/games/quiz', tok(u1));
  check('question sans réponse : comptée ratée, on passe à la suivante', ov.b.play.index === 4 && ov.b.play.answered === 4 && ov.b.play.correct === 2, 'index=' + ov.b.play.index);
  const late = await call('POST', '/games/quiz/answer', tok(u1), { index: 3, choice: 0 });
  check('répondre après le temps est refusé', late.s === 400);
  play = ov.b.play;
  await waitFor(play);
  r = await answer(tok(u1), play, 'good');
  check('fin de partie', r.s === 201 && r.b.done === true && r.b.play.status === 'DONE', JSON.stringify(r.b.play?.result ?? r.b).slice(0, 200));
  const res = r.b.play.result;
  check('résultat : 3 bonnes sur 5, sans bonus sans-faute', res.correct === 3 && res.questions === 5 && res.perfect === false && res.bonus === 0 && res.reward === res.points, JSON.stringify({ c: res.correct, p: res.points, b: res.bonus }));
  check('points versés exactement', (await pts(u1)) - before1 === res.reward, 'delta=' + ((await pts(u1)) - before1) + ' attendu=' + res.reward);
  check('revue des questions avec bonnes réponses', res.review.length === 5 && res.review[3].myText === null && res.review[0].correct === true && !!res.review[0].correctText);
  check('solde renvoyé à la fin', typeof r.b.balance === 'number');
  const after = await call('POST', '/games/quiz/answer', tok(u1), { index: 4, choice: 0 });
  check('partie terminée : pas de nouveau crédit', after.s === 201 && after.b.done === true && (await pts(u1)) - before1 === res.reward);
  const re = await call('POST', '/games/quiz/start', tok(u1));
  check('recommencer le même jour renvoie le résultat', re.b.play.status === 'DONE' && re.b.play.result.reward === res.reward);
  const dbPlay = await p.quizPlay.findFirst({ where: { userId: u1.id } });
  check('partie enregistrée', dbPlay.status === 'DONE' && dbPlay.correct === 3 && dbPlay.streak === 1 && dbPlay.finishedAt !== null);

  // ---- partie 2 : aucune bonne réponse -> prix de consolation
  const s2 = await call('POST', '/games/quiz/start', tok(u2)); play = s2.b.play;
  const b2 = await pts(u2);
  for (let i = 0; i < 5; i++) { await waitFor(play); r = await answer(tok(u2), play, 'bad'); play = r.b.play; }
  check('aucune bonne réponse : prix de consolation (jamais zéro)', play.status === 'DONE' && play.result.correct === 0 && play.result.reward === cfg0.consolation && play.result.consolation === true, JSON.stringify(play.result && { r: play.result.reward }));
  check('consolation versée', (await pts(u2)) - b2 === cfg0.consolation);

  // ---- partie 3 : sans-faute avec une série de 2 jours déjà en cours (série de 3 aujourd'hui)
  const yday = torontoDay(new Date(Date.now() - 86400_000));
  await p.quizPlay.create({ data: { userId: u3.id, day: yday, questionIds: ['x'], answers: [], current: 1, startsAt: new Date(), status: 'DONE', correct: 1, points: 10, bonus: 0, streak: 2, totalMs: 1000 } });
  const s3 = await call('POST', '/games/quiz/start', tok(u3)); play = s3.b.play;
  const b3 = await pts(u3);
  for (let i = 0; i < 5; i++) { await waitFor(play); r = await answer(tok(u3), play, 'good'); play = r.b.play; }
  const res3 = play.result;
  check('sans-faute : bonus', res3.perfect === true && res3.correct === 5 && res3.streak === 3, JSON.stringify({ p: res3.points, b: res3.bonus, s: res3.streak }));
  const expected3 = Math.round((res3.points + cfg0.perfectBonus) * 1.1);
  check('total = (points + bonus sans-faute) × série (+10 %)', res3.reward === expected3 && (await pts(u3)) - b3 === expected3, 'reward=' + res3.reward + ' attendu=' + expected3);

  // ---- partie 4 : abandon d'une partie d'hier, réglée d'office
  const yq = (await p.quizDay.findFirst({ orderBy: { day: 'desc' } })).questionIds;
  await p.quizPlay.create({ data: { userId: u4.id, day: yday, questionIds: yq, answers: [], current: 0, startsAt: new Date(Date.now() - 3600_000), status: 'ACTIVE', streak: 1 } });
  const b4 = await pts(u4);
  const s4 = await call('POST', '/games/quiz/start', tok(u4));
  const old4 = await p.quizPlay.findFirst({ where: { userId: u4.id, day: yday } });
  check('partie abandonnée d\'hier réglée d\'office (consolation)', old4.status === 'DONE' && old4.correct === 0 && (await pts(u4)) - b4 === cfg0.consolation, 'status=' + old4.status + ' delta=' + ((await pts(u4)) - b4));
  check('nouvelle partie du jour démarrée', s4.b.play.status === 'ACTIVE');

  // ---- classements
  ov = await call('GET', '/games/quiz', tok(u3));
  check('classement du jour : le sans-faute est premier de nos joueurs', ov.b.today.some((t) => t.mine && t.correct === 5) && ov.b.myRank >= 1);
  check('classement de la semaine', ov.b.weekly.length >= 1);
  check('statistiques personnelles', ov.b.me.plays >= 2 && ov.b.me.perfects === 1 && ov.b.me.won > 0 && ov.b.streak.current === 3);
  const hub = await call('GET', '/games/summary', tok(u3));
  check('résumé de la page Jeux', hub.b.quiz.playedToday === true && hub.b.quiz.streak === 3 && hub.b.quiz.won === expected3 + 10, "won=" + hub.b.quiz.won);

  // ---- administration
  let bad = await call('POST', '/games/quiz/admin/questions', A, { category: 'Test', text: 'Question de test ?', choices: ['a', 'b', 'c'], answer: 0 });
  check('question invalide refusée', bad.s === 400, bad.b?.message);
  const created = await call('POST', '/games/quiz/admin/questions', A, { category: 'Test', text: 'Combien font deux plus deux ?', choices: ['4', '3', '5', '22'], answer: 0, explain: 'Simple addition.' });
  check('question créée', created.s === 201 && !!created.b.id);
  const upd = await call('PUT', '/games/quiz/admin/questions/' + created.b.id, A, { active: false, text: 'Combien font trois plus trois ?', choices: ['6', '5', '7', '33'], answer: 0 });
  check('question modifiée et désactivée', upd.s === 200 && upd.b.active === false && upd.b.text.startsWith('Combien font trois'));
  const forbidden = await call('GET', '/games/quiz/admin', tok(u1));
  check('administration refusée aux membres', forbidden.s === 403);
  const del = await call('DELETE', '/games/quiz/admin/questions/' + created.b.id, A);
  check('question supprimée', del.s === 200);
  const miss = await call('PUT', '/games/quiz/admin/questions/' + created.b.id, A, { active: true });
  check('question supprimée introuvable', miss.s === 404);
  adm = await call('GET', '/games/quiz/admin', A);
  check('statistiques admin', adm.b.stats.playsToday >= 4 && adm.b.stats.pointsWeek > 0, JSON.stringify(adm.b.stats));
  check('compteurs par question', adm.b.questions.some((q) => q.asked > 0));

  await call('PUT', '/games/quiz/admin', A, cfg0); // remet le réglage
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTOUT PASSE');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
