// Test de bout en bout : réalisations (badges d'ancienneté, de seed, d'entraide), progression et attribution. Voir README.md.
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const bcrypt = require(B + 'bcrypt');
const BASE = E2E.BASE;
async function call(method, p, token, body) {
  const r = await fetch(BASE + p, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch {} return { s: r.status, b: j, raw: text };
}
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
const tok = (u) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, E2E.SECRET, { expiresIn: '1h' });
const SRT = Array.from({ length: 8 }, (_, i) => `${i + 1}\n00:00:${String(i * 2 + 1).padStart(2, '0')},500 --> 00:00:${String(i * 2 + 2).padStart(2, '0')},000\nLigne ${i + 1}\n`).join('\n');

(async () => {
  const p = new PrismaClient();
  const tag = 'bd' + Date.now().toString(36).slice(-5);
  const hash = await bcrypt.hash('Mot-de-passe-test-1', 4);
  await E2E.getAdmin(p, bcrypt);
  const mk = (n, extra = {}) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: new Date(Date.now() - 400 * 86400_000), ...extra } });
  const me = await mk('a'), newbie = await mk('n', { createdAt: new Date() }), up = await mk('u');
  const kids = [await mk('k1', { invitedById: me.id, memberClass: 'MEMBRE' }), await mk('k2', { invitedById: me.id, memberClass: 'POWER_USER' }), await mk('k3', { invitedById: me.id, memberClass: 'MEMBRE' }), await mk('k4', { invitedById: me.id, memberClass: 'NOUVEAU' })];
  const [TM, TN] = [tok(me), tok(newbie)];
  const cat = (await p.category.findFirst({ where: { adult: false, parentId: null } })) ?? (await p.category.create({ data: { name: 'Test ' + tag, slug: 'test-' + tag } }));
  let n = 0;
  const mkT = (name) => p.torrent.create({ data: { infoHash: (tag + n++).padEnd(40, '9'), name, filePath: '/x', size: 1n, fileList: [{ path: 'a.mkv', size: 1 }], categoryId: cat.id, uploaderId: up.id, status: 'APPROVED' } });
  const t0 = await mkT('Film.' + tag + '.2024');
  await p.snatch.createMany({ data: Array.from({ length: 30 }, () => ({ torrentId: t0.id, userId: me.id, seedSeconds: 20 * 3600, satisfied: true })) });
  await p.subtitleFile.createMany({ data: Array.from({ length: 4 }, (_, i) => ({ torrentId: t0.id, language: 'fr', content: SRT, cues: 8, uploaderId: me.id, label: 'n' + i })) });

  const pr = await call('GET', '/badges/progress', TM);
  check('page Réalisations accessible', pr.s === 200 && pr.b.items.length >= 20 && pr.b.categories.length === 5, pr.raw.slice(0, 100));
  const by = (code) => pr.b.items.find((i) => i.code === code);
  check('ancienneté : Fidèle et Vétéran obtenus, Ancien en cours (400 / 730 jours)', by('FIDELE').earned && by('VETERAN').earned && !by('ANCIEN').earned && by('ANCIEN').value === 400 && by('ANCIEN').target === 730 && by('ANCIEN').unit === 'jours');
  check('seed : 600 h cumulées = Gardien ; 30 torrents conformes = Bon élève ; pas encore Exemplaire', by('GARDIEN').earned && by('BON_ELEVE').earned && !by('EXEMPLAIRE').earned && by('EXEMPLAIRE').value === 30, JSON.stringify([by('GARDIEN'), by('EXEMPLAIRE')].map((x) => [x.value, x.target])));
  check('irréprochable : 30 / 50 torrents terminés', !by('IRREPROCHABLE').earned && by('IRREPROCHABLE').value === 30);
  check('mentor : 3 parrainés devenus membres (le « nouveau » ne compte pas)', by('MENTOR').earned && by('MENTOR').value === 3);
  check('sous-titres : 4 / 5, pas encore Sous-titreur', !by('SOUS_TITREUR').earned && by('SOUS_TITREUR').value === 4 && by('SOUS_TITREUR').target === 5);
  check('rareté présente pour chaque badge', pr.b.items.every((i) => typeof i.percentOfMembers === 'number'));
  const pn = await call('GET', '/badges/progress', TN);
  check('un compte neuf n\'a rien d\'obtenu', pn.b.earnedCount === 0 && pn.b.items.every((i) => !i.earned));
  check('sans connexion : refusé', (await call('GET', '/badges/progress')).s === 401);

  // l'envoi d'un 5e sous-titre déclenche l'attribution (de tous les badges gagnés) et la notification
  const fd = new FormData(); fd.append('file', new Blob([SRT]), 's.srt'); fd.append('language', 'fr');
  const up5 = await fetch(BASE + `/subtitles/torrent/${t0.id}`, { method: 'POST', headers: { Authorization: 'Bearer ' + TM }, body: fd });
  check('5e sous-titre envoyé', up5.status === 201);
  const mine = (await call('GET', '/badges/mine', TM)).b.map((b) => b.code);
  check('badges attribués : Sous-titreur, Gardien, Bon élève, Mentor, Fidèle, Vétéran (pas Ancien)', ['SOUS_TITREUR', 'GARDIEN', 'BON_ELEVE', 'MENTOR', 'FIDELE', 'VETERAN'].every((c) => mine.includes(c)) && !mine.includes('ANCIEN'), mine.join());
  check('une notification par badge', (await p.notification.count({ where: { userId: me.id, type: 'BADGE_EARNED' } })) === mine.length);
  const pr2 = await call('GET', '/badges/progress', TM);
  check('la page montre la date d\'obtention', !!pr2.b.items.find((i) => i.code === 'SOUS_TITREUR').awardedAt && pr2.b.earnedCount === mine.length);
  const pub = await call('GET', `/badges/user/${me.id}`, TN);
  check('un autre membre voit les badges obtenus (profil public)', pub.s === 200 && pub.b.length === mine.length);

  // ---- nettoyage
  await p.torrent.deleteMany({ where: { uploaderId: up.id } });
  await p.user.deleteMany({ where: { id: { in: [...kids.map((k) => k.id), me.id, newbie.id, up.id] } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
