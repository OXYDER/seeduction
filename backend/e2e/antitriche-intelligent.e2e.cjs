// Test de bout en bout : anti-triche qui tient compte des privilèges (freeleech, double upload, cadeaux de départ), des proches, des seedbox et des receveurs, et n'alerte que sur des indices solides. Voir README.md.
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
const GB = 1024 ** 3;
const today = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; };

(async () => {
  const p = new PrismaClient();
  const { SettingsService } = require(E2E.DIST + 'settings/settings.service.js');
  const { AntiCheatService } = require(E2E.DIST + 'anticheat/anticheat.service.js');
  const { AntiCheatAnalysisService } = require(E2E.DIST + 'anticheat/anticheat-analysis.service.js');
  const settings = new SettingsService(p);
  const sent = [];
  const core = new AntiCheatService(p, settings, { notify: async (n) => { sent.push(n); } }, { log: async () => undefined });
  const an = new AntiCheatAnalysisService(p, core, settings);
  const tag = 'ai' + Date.now().toString(36).slice(-5);
  const mk = (n, data = {}) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: 'x', createdAt: new Date(Date.now() - 5 * 86400_000), ...data } });
  const users = [];
  const u = async (n, data) => { const x = await mk(n, data); users.push(x.id); return x; };
  const cat = (await p.category.findFirst({ where: { adult: false, parentId: null } })) ?? (await p.category.create({ data: { name: 'Test ' + tag, slug: 'test-' + tag } }));
  const owner = await u('own');
  const torrents = [];
  const tor = async (n, data = {}) => { const t = await p.torrent.create({ data: { infoHash: require('crypto').randomBytes(20).toString('hex'), name: 'T' + n + tag, filePath: '/x', size: 50n * 1073741824n, fileList: [], categoryId: cat.id, uploaderId: owner.id, status: 'APPROVED', ...data } }); torrents.push(t.id); return t; };
  const flow = (userId, torrentId, up, down) => p.userTorrentFlow.create({ data: { userId, torrentId, day: today(), up: BigInt(Math.round(up)), down: BigInt(Math.round(down)), got: BigInt(Math.round(down)), announces: 3 } });
  const ip = (userId, addr) => p.userIp.create({ data: { userId, ip: addr, firstSeenAt: new Date(), lastSeenAt: new Date() } });
  const events = (userId, kind) => p.cheatEvent.findMany({ where: { userId, ...(kind ? { kind } : {}) } });

  const plainT = await tor('plain'), freeT = await tor('free', { freeleech: true });
  const net = (i) => `10.${Math.floor(Math.random() * 200) + 20}.${i}.7`;

  // ---------- transferts entre comptes de même adresse
  const pairs = {};
  for (const k of ['plain', 'boost', 'kin', 'recip']) {
    const a = await u(k + 'a'), b = await u(k + 'b', k === 'kin' ? { invitedById: undefined } : {});
    pairs[k] = [a, b];
    const addr = net(k.length + Math.floor(Math.random() * 50));
    await ip(a.id, addr); await ip(b.id, addr);
  }
  await p.user.update({ where: { id: pairs.kin[1].id }, data: { invitedById: pairs.kin[0].id } });
  await flow(pairs.plain[0].id, plainT.id, 12 * GB, 0); await flow(pairs.plain[1].id, plainT.id, 0, 12 * GB);
  await flow(pairs.boost[0].id, freeT.id, 12 * GB, 0); await flow(pairs.boost[1].id, freeT.id, 0, 12 * GB);
  await flow(pairs.kin[0].id, freeT.id, 12 * GB, 0); await flow(pairs.kin[1].id, freeT.id, 0, 12 * GB);
  await flow(pairs.recip[0].id, plainT.id, 30 * GB, 30 * GB); await flow(pairs.recip[1].id, plainT.id, 30 * GB, 30 * GB);
  await an.linkedAccounts();
  check('foyer : 12 Go échangés sur un torrent ordinaire ne comptent pas comme complicité', (await events(pairs.plain[0].id, 'ACCOUNT_COLLUSION')).length === 0 && (await events(pairs.plain[1].id, 'ACCOUNT_COLLUSION')).length === 0);
  const boost = await events(pairs.boost[0].id, 'ACCOUNT_COLLUSION');
  check('12 Go sur un torrent freeleech entre comptes de même adresse : ratio fabriqué, signalé', boost.length === 1 && boost[0].points >= 30, JSON.stringify(boost.map((e) => e.points)));
  const kin = await events(pairs.kin[0].id, 'ACCOUNT_COLLUSION');
  check('même chose entre parrain et filleul : indice allégé de moitié', kin.length === 1 && kin[0].points < boost[0].points && /proches/.test(JSON.stringify(kin[0].details)), JSON.stringify(kin.map((e) => e.points)));
  check('échanges réciproques du même ordre, sans ratio fabriqué : des proches, pas une ferme', (await events(pairs.recip[0].id, 'ACCOUNT_COLLUSION')).length === 0);
  check('adresse partagée par des comptes parrain / filleul : aucun indice', (await events(pairs.kin[0].id, 'SHARED_IP')).length === 0 && (await events(pairs.kin[1].id, 'SHARED_IP')).length === 0);
  check('adresse partagée par deux inconnus : petit indice seulement', (await events(pairs.plain[0].id, 'SHARED_IP')).every((e) => e.points <= 5) && (await events(pairs.plain[0].id, 'SHARED_IP')).length === 1);

  // ---------- envolée du ratio : seul l'upload sans receveur compte
  const t3 = await tor('conf'), t4 = await tor('unconf');
  const s1 = await u('conf'), r1 = await u('recv'), s2 = await u('unconf'), bot = await u('bot', { profileType: 'BOT' });
  await flow(s1.id, t3.id, 150 * GB, 0); await flow(r1.id, t3.id, 0, 150 * GB);
  await flow(s2.id, t4.id, 150 * GB, 0);
  await flow(bot.id, t4.id, 150 * GB, 0);
  await an.ratioSurge(100);
  check('150 Go envoyés et reçus par un autre membre (sortie très demandée) : confirmé, aucune alerte', (await events(s1.id, 'RATIO_SURGE')).length === 0);
  const surge = await events(s2.id, 'RATIO_SURGE');
  check('150 Go envoyés sans aucun receveur sur un compte récent : signalé', surge.length === 1 && surge[0].details.unconfirmedGb >= 100, JSON.stringify(surge.map((e) => e.details)));
  check('le robot du site n\'est jamais examiné', (await events(bot.id)).length === 0);

  // ---------- passkey sur plusieurs réseaux
  const walker = await u('walk'), boxer = await u('box');
  for (let i = 0; i < 5; i++) { await ip(walker.id, `172.${20 + i}.${i + 1}.9`); await ip(boxer.id, `172.${40 + i}.${i + 1}.9`); }
  await p.memberSeedbox.create({ data: { userId: boxer.id, config: {} } });
  await an.passkeySharing(4);
  const walk = await events(walker.id, 'PASSKEY_SHARING');
  check('cinq réseaux qui se succèdent (mobile, VPN, déplacement) : indice réduit', walk.length === 1 && walk[0].points <= 10 && /successifs/.test(JSON.stringify(walk[0].details)), JSON.stringify(walk.map((e) => e.points)));
  check('membre avec seedbox déclarée : plusieurs réseaux attendus, rien', (await events(boxer.id, 'PASSKEY_SHARING')).length === 0);

  // ---------- alerte solide
  const staff = await u('adm', { role: 'ADMIN', status: 'ACTIVE' });
  const solo = await u('solo');
  await core.record(solo.id, [{ kind: 'SWARM_IMBALANCE', points: 80, torrentScoped: false, details: {} }]);
  await core.rescore(solo.id);
  const c1 = await p.cheatCase.findUnique({ where: { userId: solo.id } });
  check('un seul type d\'indice (ratio) au niveau « suspect » : dossier ouvert, équipe pas réveillée', !!c1 && c1.level === 'SUSPECT' && c1.alertedLevel === 0 && !sent.some((n) => n.groupKey === `cheat:${c1.id}`), c1 ? `${c1.level} alerté=${c1.alertedLevel}` : 'pas de dossier');
  await core.record(solo.id, [{ kind: 'LEFT_TAMPER', points: 40, torrentScoped: false, details: { hard: true } }]);
  await core.rescore(solo.id);
  const c2 = await p.cheatCase.findUnique({ where: { userId: solo.id } });
  check('avec une preuve directe (valeur forgée) et deux familles : l\'équipe est prévenue', c2.alertedLevel >= 2 && sent.some((n) => n.groupKey === `cheat:${c2.id}` && n.userId === staff.id), `niveau ${c2.level}`);

  // ---------- apprentissage
  const before = await settings.get('anticheatWeights');
  for (let i = 0; i < 6; i++) { const x = await u('l' + i); await p.cheatCase.create({ data: { userId: x.id, status: i === 0 ? 'ACTIONED' : 'CLEARED', score: 70, level: 'SUSPECT', confidence: 50, families: [], breakdown: { ZZ_TEST: { points: 50, events: 1, lastAt: new Date().toISOString() } } } }); }
  const learned = await core.learnWeights();
  check('un type d\'indice qui n\'a produit que des innocentés pèse moins', learned.weights.ZZ_TEST < 0.8 && learned.weights.ZZ_TEST >= 0.5, JSON.stringify(learned.weights.ZZ_TEST));
  if (before) await settings.set('anticheatWeights', before); else await settings.set('anticheatWeights', { weights: {} });

  // ---------- nettoyage
  await p.cheatCaseNote.deleteMany({ where: { case: { userId: { in: users } } } });
  await p.cheatCase.deleteMany({ where: { userId: { in: users } } });
  await p.cheatEvent.deleteMany({ where: { userId: { in: users } } });
  await p.userTorrentFlow.deleteMany({ where: { userId: { in: users } } });
  await p.userIp.deleteMany({ where: { userId: { in: users } } });
  await p.memberSeedbox.deleteMany({ where: { userId: { in: users } } });
  await p.notification.deleteMany({ where: { userId: { in: users } } });
  await p.torrent.deleteMany({ where: { id: { in: torrents } } });
  await p.user.updateMany({ where: { id: { in: users } }, data: { invitedById: null } });
  await p.user.deleteMany({ where: { id: { in: users.filter((x) => x !== owner.id) } } });
  await p.user.deleteMany({ where: { id: owner.id } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
