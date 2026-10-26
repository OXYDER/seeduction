// Test de bout en bout : parrainage (invitations, invités, prime en points, plafond mensuel, codes génériques, même IP, réglages). Voir README.md.
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
const daysAgo = (n) => new Date(Date.now() - n * 86400_000);

(async () => {
  const p = new PrismaClient();
  const tag = 'pa' + Date.now().toString(36).slice(-5);
  const hash = await bcrypt.hash('Mot-de-passe-test-1', 4);
  const admin = await E2E.getAdmin(p, bcrypt);
  const mk = (n, extra = {}) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: daysAgo(100), ...extra } });
  const inviter = await mk('p', { memberClass: 'POWER_USER', bonusPoints: 100 });
  const other = await mk('o');
  const kid = (n, days, cls, extra = {}) => mk(n, { invitedById: inviter.id, createdAt: daysAgo(days), memberClass: cls, ...extra });
  const A = await kid('a', 25, 'MEMBRE'), Bn = await kid('b', 5, 'MEMBRE'), C = await kid('c', 30, 'NOUVEAU'), D = await kid('d', 30, 'MEMBRE'), E = await kid('e', 30, 'MEMBRE'), F = await kid('f', 30, 'POWER_USER'), G = await kid('g', 30, 'ELITE'), H = await kid('h', 30, 'MEMBRE');
  const TP = tok(inviter), TO = tok(other), TAd = tok(admin);
  // D partage une adresse IP avec son parrain ; E s'est inscrit avec un code générique
  await p.userIp.createMany({ data: [{ userId: inviter.id, ip: '198.51.100.' + (Date.now() % 200) }, { userId: D.id, ip: '198.51.100.' + (Date.now() % 200) }] });
  const generic = await p.inviteCode.create({ data: { code: tag + 'gen', createdById: admin.id, generic: true, maxUses: 5, useCount: 1 } });
  await p.inviteUse.create({ data: { inviteId: generic.id, userId: E.id } });
  const pts = async (id) => Number((await p.user.findUnique({ where: { id }, select: { bonusPoints: true } })).bonusPoints);

  // réglages : on part d'une configuration connue (plafond large)
  const prev = await call('GET', '/admin/referral', TAd);
  await call('PUT', '/admin/referral', TAd, { enabled: true, rewardPoints: 500, minDays: 14, minClass: 'MEMBRE', maxPerMonth: 1 });
  check('un membre ne règle pas le parrainage', (await call('GET', '/admin/referral', TO)).s === 403 && (await call('PUT', '/admin/referral', TO, { rewardPoints: 99999 })).s === 403);

  const o1 = await call('GET', '/referrals', TP);
  check('page Parrainage : invités, quota (Power User : 2 invitations)', o1.s === 200 && o1.b.invitees.length === 8 && o1.b.quota.max === 2 && o1.b.quota.rankLabel === 'Power User', o1.raw.slice(0, 120));
  const st = (u) => o1.b.invitees.find((i) => i.username === u.username);
  const paidNow = [A, F, G, H].filter((u) => st(u).state === 'rewarded');
  check('plafond à 1 : une seule prime versée dès l\'ouverture de la page (le plus ancien invité d\'abord, ici F), +500 points', paidNow.length === 1 && paidNow[0].id === F.id && st(F).reward === 500 && (await pts(inviter.id)) === 600, `payés=${paidNow.map((u) => u.username)} points=${await pts(inviter.id)}`);
  check('B (5 jours) : en attente, 9 jours restants', st(Bn).state === 'waiting' && st(Bn).daysLeft === 9);
  check('C (assez ancien mais rang Nouveau) : en attente du rang', st(C).state === 'waiting' && st(C).classOk === false && st(C).daysLeft === 0);
  check('les autres invités prêts (A, G, H) attendent le plafond', [A, G, H].every((u) => st(u).state === 'ready') && o1.b.rewardedThisMonth === 1);
  const o2 = await call('GET', '/referrals', TP);
  check('jamais de double prime', (await pts(inviter.id)) === 600 && o2.b.totals.rewarded === 1);
  const sD = await p.user.findUnique({ where: { id: D.id } }), sE = await p.user.findUnique({ where: { id: E.id } });
  check('même IP que le parrain : marqué sans prime', sD.referralRewardedAt !== null && sD.referralReward === 0);
  check('code générique de l\'administration : marqué sans prime', sE.referralRewardedAt !== null && sE.referralReward === 0);
  check('notification au parrain', (await p.notification.count({ where: { userId: inviter.id, title: { contains: F.username } } })) === 1);
  const ledger = await p.pointsLedger.findFirst({ where: { userId: inviter.id, source: 'referral' } });
  check('journal des points : source « referral »', !!ledger && ledger.credit === 500, JSON.stringify(ledger));

  // plafond relevé à 2 : une seule de plus (F, G, H sont tous prêts)
  await call('PUT', '/admin/referral', TAd, { maxPerMonth: 2 });
  await call('GET', '/referrals', TP);
  const paidAfter = await p.user.count({ where: { invitedById: inviter.id, referralReward: { gt: 0 } } });
  check('plafond à 2 : exactement une prime de plus (F + une autre)', paidAfter === 2 && (await pts(inviter.id)) === 1100, `payées=${paidAfter} points=${await pts(inviter.id)}`);

  // désactivé : plus rien n'est versé
  await call('PUT', '/admin/referral', TAd, { enabled: false, maxPerMonth: 10 });
  await call('GET', '/referrals', TP);
  check('parrainage coupé : aucune prime de plus', (await p.user.count({ where: { invitedById: inviter.id, referralReward: { gt: 0 } } })) === 2);
  const norm = await call('PUT', '/admin/referral', TAd, { enabled: true, rewardPoints: 99999999, minClass: 'ADMIN', minDays: -3 });
  check('réglages nettoyés', norm.b.rewardPoints === 100000 && norm.b.minClass === 'MEMBRE' && norm.b.minDays === 0, norm.raw);
  await call('PUT', '/admin/referral', TAd, { rewardPoints: 500, minDays: 14, maxPerMonth: 5 });

  // ---- invitations
  const i1 = await call('POST', '/referrals/invite', TP);
  const i2 = await call('POST', '/referrals/invite', TP);
  const i3 = await call('POST', '/referrals/invite', TP);
  check('deux invitations créées, la troisième refusée (quota du rang)', i1.s === 201 && i2.s === 201 && i3.s === 400 && /maximum 2/.test(i3.raw), i3.raw.slice(0, 120));
  check('un membre sans droit d\'inviter est refusé', (await call('POST', '/referrals/invite', TO)).s === 400);
  const o3 = await call('GET', '/referrals', TP);
  check('les invitations ouvertes sont listées', o3.b.codes.filter((c) => c.status === 'open').length === 2 && o3.b.quota.canCreate === false);
  check('un autre membre ne peut pas retirer cette invitation', (await call('DELETE', `/referrals/invite/${i1.b.id}`, TO)).s === 404);
  check('la page indique le prix d\'une invitation et le solde du membre', o3.b.purchase && o3.b.purchase.cost === 2000 && typeof o3.b.purchase.balance === 'number', JSON.stringify(o3.b.purchase));
  check('retirer une invitation libère une place', (await call('DELETE', `/referrals/invite/${i1.b.id}`, TP)).s === 200 && (await call('GET', '/referrals', TP)).b.quota.canCreate === true);
  await p.inviteCode.update({ where: { id: i2.b.id }, data: { used: true, useCount: 1 } });
  check('une invitation déjà utilisée ne se retire pas', (await call('DELETE', `/referrals/invite/${i2.b.id}`, TP)).s === 400);
  check('sans connexion : refusé', (await call('GET', '/referrals')).s === 401);
  check('« verser maintenant » est réservé aux administrateurs', (await call('POST', '/admin/referral/run', TO)).s === 403);

  // ---- nettoyage
  if (prev.b) await call('PUT', '/admin/referral', TAd, prev.b);
  await p.inviteCode.deleteMany({ where: { OR: [{ createdById: inviter.id }, { id: generic.id }] } });
  await p.pointsLedger.deleteMany({ where: { userId: inviter.id } });
  await p.activityLog.deleteMany({ where: { userId: inviter.id } });
  await p.user.deleteMany({ where: { id: { in: [A, Bn, C, D, E, F, G, H].map((u) => u.id) } } });
  await p.user.deleteMany({ where: { id: { in: [inviter.id, other.id] } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
