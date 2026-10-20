// Test de bout en bout : points versés une seule fois à l'obtention d'un badge (comptes ordinaires seulement), étiquetés « badges » dans le journal des points. Voir README.md.
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };

(async () => {
  const p = new PrismaClient();
  const { BadgesService } = require(E2E.DIST + 'badges/badges.service.js');
  const sent = [];
  const svc = new BadgesService(p, { notify: async (n) => { sent.push(n); } });
  const tag = 'bp' + Date.now().toString(36).slice(-5);
  const mk = (n, data = {}) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: 'x', createdAt: new Date(Date.now() - 10 * 86400_000), bonusPoints: 100, ...data } });
  const member = await mk('m'), kid = await mk('k'), robot = await mk('r', { profileType: 'BOT' });
  await p.user.update({ where: { id: kid.id }, data: { parentId: member.id, profileName: 'Kid', profileType: 'KID' } }).catch(async () => p.user.update({ where: { id: kid.id }, data: { parentId: member.id } }));
  const cat = (await p.category.findFirst({ where: { adult: false, parentId: null } })) ?? (await p.category.create({ data: { name: 'Test ' + tag, slug: 'test-' + tag } }));
  const ids = [];
  for (const [owner, n] of [[member.id, 5], [kid.id, 1], [robot.id, 1]]) {
    for (let i = 0; i < n; i++) ids.push((await p.torrent.create({ data: { infoHash: require('crypto').randomBytes(20).toString('hex'), name: 'T.' + tag + i, filePath: '/x', size: 1_000_000n, fileList: [], categoryId: cat.id, uploaderId: owner, status: 'APPROVED' } })).id);
  }
  const pts = async (id) => Math.round((await p.user.findUnique({ where: { id }, select: { bonusPoints: true } })).bonusPoints);

  const got = await svc.checkAndAward(member.id);
  check('badges obtenus : Premier pas et Contributeur', got.includes('PREMIER_PAS') && got.includes('CONTRIBUTEUR'), got.join(','));
  check('points versés : 25 + 50', (await pts(member.id)) === 175, String(await pts(member.id)));
  check('la notification annonce les points', sent.some((n) => n.userId === member.id && /\+25 points/.test(n.body)));
  const again = await svc.checkAndAward(member.id);
  check('second balayage : rien de plus, aucun double paiement', again.length === 0 && (await pts(member.id)) === 175);
  const led = await p.pointsLedger.findMany({ where: { userId: member.id, source: 'badges' } });
  check('journal des points : source « badges »', led.reduce((n, r) => n + r.credit, 0) === 75, JSON.stringify(led.map((r) => r.credit)));
  await svc.checkAndAward(kid.id);
  check('profil famille : le badge est donné, mais sans points', (await p.userBadge.count({ where: { userId: kid.id } })) >= 1 && (await pts(kid.id)) === 100);
  await svc.checkAndAward(robot.id);
  const prog = await svc.progressFor(member.id);
  check('page Réalisations : points par badge et total à gagner', prog.items.every((i) => i.points > 0) && prog.pointsToWin > 0 && prog.items.find((i) => i.code === 'CONTRIBUTEUR').earned);

  await p.pointsLedger.deleteMany({ where: { userId: { in: [member.id, kid.id, robot.id] } } });
  await p.torrent.deleteMany({ where: { id: { in: ids } } });
  await p.userBadge.deleteMany({ where: { userId: { in: [member.id, kid.id, robot.id] } } });
  await p.user.deleteMany({ where: { id: { in: [kid.id, robot.id] } } });
  await p.user.deleteMany({ where: { id: member.id } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
