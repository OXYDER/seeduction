// Test de bout en bout : propositions de questions du quiz par les membres et import en lot. Voir README.md.
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
  const tag = 'qs' + Date.now().toString(36).slice(-4);
  const hash = await bcrypt.hash('Mot-de-passe-test-1', 4);
  const old = new Date(Date.now() - 30 * 86400_000);
  const mk = (n, extra = {}) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: old, bonusPoints: 100, ...extra } });
  const admin = await E2E.getAdmin(p, bcrypt);
  const A = tok(admin);
  const u = await mk('a'), young = await mk('y', { createdAt: new Date() });
  const T = tok(u);
  const pts = async (x) => (await p.user.findUnique({ where: { id: x.id }, select: { bonusPoints: true } })).bonusPoints;
  const Q = (n, extra = {}) => ({ category: 'Culture', text: `Question de test numéro ${tag} ${n} : combien font deux plus deux ?`, choices: ['4', '3', '5', '22'], answer: 0, explain: 'Simple addition.', ...extra });
  const cfg0 = (await call('GET', '/games/quiz/admin', A)).b.config;
  check('récompense par défaut', cfg0.suggestionReward === 20);

  // ---- côté membre
  let r = await call('POST', '/games/quiz/suggest', tok(young), Q(0));
  check('compte récent refusé', r.s === 400 && /au moins/.test(r.b?.message ?? ''));
  r = await call('POST', '/games/quiz/suggest', T, { ...Q(1), choices: ['4', '3', '5'] });
  check('question invalide refusée', r.s === 400 && /quatre réponses/.test(r.b?.message ?? ''), r.b?.message);
  r = await call('POST', '/games/quiz/suggest', T, { ...Q(1), text: 'quel peintre a réalisé la nuit étoilée ?', choices: ['Vincent van Gogh', 'Claude Monet', 'Pablo Picasso', 'Salvador Dalí'] });
  check('doublon de la banque refusé', r.s === 400 && /existe déjà/.test(r.b?.message ?? ''), r.b?.message);
  r = await call('POST', '/games/quiz/suggest', T, Q(1));
  check('proposition enregistrée en attente', r.s === 201 && r.b.status === 'PENDING');
  const first = r.b.id;
  r = await call('POST', '/games/quiz/suggest', T, Q(1));
  check('doublon d\'une proposition en attente refusé', r.s === 400 && /existe déjà/.test(r.b?.message ?? ''));
  await call('POST', '/games/quiz/suggest', T, Q(2));
  const third = await call('POST', '/games/quiz/suggest', T, Q(3));
  check('trois propositions en attente', third.s === 201);
  r = await call('POST', '/games/quiz/suggest', T, Q(4));
  check('quatrième proposition refusée (3 en attente au maximum)', r.s === 400 && /3 questions en attente/.test(r.b?.message ?? ''), r.b?.message);
  r = await call('GET', '/games/quiz/suggestions', T);
  check('mes propositions listées avec la récompense', r.s === 200 && r.b.items.length === 3 && r.b.reward === 20 && r.b.items.every((x) => x.status === 'PENDING'));
  check('administration refusée aux membres', (await call('GET', '/games/quiz/admin/suggestions', T)).s === 403 && (await call('POST', '/games/quiz/admin/import', T, { text: 'x' })).s === 403);

  // ---- côté staff
  r = await call('GET', '/games/quiz/admin/suggestions', A);
  const mine = r.b.filter((x) => x.username === u.username);
  check('le staff voit les propositions avec le pseudo', r.s === 200 && mine.length === 3);
  const before = await pts(u);
  const bankBefore = await p.quizQuestion.count();
  r = await call('POST', `/games/quiz/admin/suggestions/${first}/approve`, A, { text: `Question corrigée par le staff ${tag} : combien font 2 + 2 ?` });
  check('acceptation avec correction : la question entre dans la banque, active', r.s === 201 && (await p.quizQuestion.count()) === bankBefore + 1);
  const q = await p.quizQuestion.findUnique({ where: { id: r.b.questionId } });
  check('texte corrigé, bonne réponse conservée', q.active === true && q.text.includes('corrigée par le staff') && q.choices[q.answer] === '4');
  check('récompense versée au membre', (await pts(u)) - before === 20, 'delta=' + ((await pts(u)) - before));
  const led = await p.pointsLedger.findMany({ where: { userId: u.id, source: 'quiz' } });
  check('récompense inscrite au journal sous « quiz »', led.reduce((s, x) => s + x.credit, 0) === 20);
  r = await call('POST', `/games/quiz/admin/suggestions/${first}/approve`, A, {});
  check('deuxième acceptation refusée (pas de double récompense)', r.s === 400 && (await pts(u)) - before === 20);
  const sug = await p.quizSuggestion.findUnique({ where: { id: first } });
  check('proposition marquée acceptée avec la question liée', sug.status === 'APPROVED' && sug.questionId === q.id && sug.reward === 20);
  const second = mine.find((x) => x.id !== first && x.id !== third.b.id).id;
  r = await call('POST', `/games/quiz/admin/suggestions/${second}/reject`, A, { note: 'Trop facile pour un quiz' });
  check('refus avec raison, sans récompense', r.s === 201 && (await pts(u)) - before === 20);
  check('notification du refus avec la raison', (await p.notification.count({ where: { userId: u.id, body: { contains: 'Trop facile' } } })) === 1);
  check('notification de l\'acceptation', (await p.notification.count({ where: { userId: u.id, title: { contains: 'acceptée' } } })) === 1);
  r = await call('POST', `/games/quiz/admin/suggestions/${second}/reject`, A, {});
  check('deuxième examen refusé', r.s === 400);
  r = await call('GET', '/games/quiz/suggestions', T);
  check('statuts visibles par le membre', r.b.items.filter((x) => x.status === 'APPROVED').length === 1 && r.b.items.filter((x) => x.status === 'REJECTED').length === 1 && r.b.items.find((x) => x.status === 'REJECTED').note === 'Trop facile pour un quiz');
  r = await call('POST', '/games/quiz/suggest', T, Q(5));
  check('une place se libère après examen (2 propositions en attente puis 1)', r.s === 201, r.b?.message);

  // ---- import en lot
  const stamp = Date.now().toString(36);
  const lines = [
    '# import de test',
    `Géographie ; Capitale du test ${stamp} A ? ; Ottawa ; Toronto ; Montréal ; Québec ; Capitale du Canada.`,
    `Géographie ; Capitale du test ${stamp} B ? ; Paris ; Lyon ; Nice ; Lille`,
    `Géographie ; Ligne incomplète ${stamp} ? ; oui ; non`,
    `Géographie ; Capitale du test ${stamp} A ? ; Ottawa ; Toronto ; Montréal ; Québec`,
    `Géographie ; Réponses identiques ${stamp} ? ; oui ; Oui ; non ; peut-être`,
  ].join('\n');
  const bank0 = await p.quizQuestion.count();
  r = await call('POST', '/games/quiz/admin/import', A, { text: lines });
  check('essai à blanc : détaille sans rien écrire', r.s === 201 && r.b.dryRun === true && r.b.valid === 2 && r.b.errorCount === 3 && r.b.added === 0 && (await p.quizQuestion.count()) === bank0, JSON.stringify({ v: r.b?.valid, e: r.b?.errorCount }));
  check('les erreurs portent un numéro de ligne et une raison', r.b.errors.every((e) => e.line > 0 && e.reason.length > 5) && r.b.errors.some((e) => /6 colonnes/.test(e.reason)) && r.b.errors.some((e) => /déjà présente|double/.test(e.reason)));
  r = await call('POST', '/games/quiz/admin/import', A, { text: lines, dryRun: false });
  check('import réel : les deux questions valides sont ajoutées', r.s === 201 && r.b.added === 2 && (await p.quizQuestion.count()) === bank0 + 2);
  r = await call('POST', '/games/quiz/admin/import', A, { text: lines, dryRun: false });
  check('réimporter ne crée aucun doublon', r.s === 201 && r.b.added === 0 && (await p.quizQuestion.count()) === bank0 + 2);
  r = await call('POST', '/games/quiz/admin/import', A, { text: JSON.stringify([{ category: 'Test', text: `Question JSON ${stamp} : combien font 1 + 1 ?`, choices: ['1', '2', '3', '4'], answer: 1 }]), dryRun: false });
  check('import au format JSON', r.s === 201 && r.b.added === 1);
  check('texte vide refusé', (await call('POST', '/games/quiz/admin/import', A, { text: '  ' })).s === 400);

  // ---- réglage de la récompense
  const sv = await call('PUT', '/games/quiz/admin', A, { ...cfg0, suggestionReward: 35 });
  check('récompense réglable', sv.s === 200 && sv.b.config.suggestionReward === 35);
  await call('PUT', '/games/quiz/admin', A, cfg0);

  // nettoyage des questions de test
  await p.quizQuestion.deleteMany({ where: { OR: [{ text: { contains: tag } }, { text: { contains: stamp } }] } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTOUT PASSE');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
