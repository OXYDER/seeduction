// Test de bout en bout : compte complet d'un membre (administrateurs) et réinitialisation obligatoire du mot de passe. Voir README.md.
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
const PW = 'Mot-de-passe-test-1';

(async () => {
  const p = new PrismaClient();
  const tag = 'in' + Date.now().toString(36).slice(-4);
  const hash = await bcrypt.hash(PW, 4);
  const old = new Date(Date.now() - 30 * 86400_000);
  const mk = (n, extra = {}) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: old, ...extra } });
  const adm = await mk('a', { role: 'ADMIN' }), adm2 = await mk('b', { role: 'ADMIN' }), target = await mk('t'), friend = await mk('f'), other = await mk('o');
  const TA = tok(adm);

  // ---- données du membre ciblé
  const cat = await p.category.create({ data: { name: tag + 'cat', slug: tag + 'cat' } });
  const torrent = await p.torrent.create({ data: { infoHash: tag.padEnd(40, 'a'), name: tag + '.Film.2024.1080p-GRP', filePath: '/x', size: 2_000_000_000n, fileList: [], categoryId: cat.id, uploaderId: target.id, status: 'APPROVED' } });
  await p.snatch.create({ data: { torrentId: torrent.id, userId: target.id, hnr: true, seedSeconds: 600 } });
  await p.friendship.create({ data: { requesterId: target.id, addresseeId: friend.id, status: 'ACCEPTED' } });
  const fcat = await p.forumCategory.create({ data: { name: tag + 'f', slug: tag + 'f' } }).catch(async () => p.forumCategory.findFirst());
  const topic = await p.forumTopic.create({ data: { title: tag + ' sujet', categoryId: fcat.id, authorId: target.id } });
  await p.forumPost.create({ data: { topicId: topic.id, authorId: target.id, content: 'Premier message du sujet' } });
  await p.forumPost.create({ data: { topicId: topic.id, authorId: target.id, content: 'Une réponse' } });
  await p.privateMessage.create({ data: { senderId: target.id, recipientId: other.id, subject: 'Bonjour', content: 'Message privé secret ' + tag } });
  const conv = await p.conversation.create({ data: { type: 'DIRECT', directKey: tag + 'key', members: { create: [{ userId: target.id }, { userId: friend.id }] } } });
  await p.message.create({ data: { conversationId: conv.id, senderId: friend.id, content: 'Salut en privé ' + tag } });
  const grp = await p.conversation.create({ data: { type: 'GROUP', name: tag + 'groupe', members: { create: [{ userId: target.id }, { userId: friend.id }] } } });
  await p.message.create({ data: { conversationId: grp.id, senderId: target.id, content: 'Message de groupe ' + tag } });

  // ---- accès et vue d'ensemble
  check('un membre ordinaire ne voit rien (403)', (await call('GET', `/admin/users/${target.id}/inspect`, tok(other))).s === 403);
  const ov = await call('GET', `/admin/users/${target.id}/inspect`, TA);
  check('vue d\'ensemble : compteurs', ov.s === 200 && ov.b.counts.uploads === 1 && ov.b.counts.downloads === 1 && ov.b.counts.hnr === 1 && ov.b.counts.friends === 1 && ov.b.counts.forum === 2 && ov.b.counts.pm === 1 && ov.b.counts.dm === 1 && ov.b.counts.chat === 1, JSON.stringify(ov.b?.counts));
  for (const [sec, n] of [['downloads', 1], ['uploads', 1], ['seeds', 0], ['hnr', 1], ['friends', 1], ['forum', 2]]) {
    const r = await call('GET', `/admin/users/${target.id}/inspect/${sec}`, TA);
    check(`section « ${sec} » : ${n} élément(s)`, r.s === 200 && r.b.total === n && r.b.items.length === n, `${r.s} ${r.raw.slice(0, 80)}`);
  }
  const forum = (await call('GET', `/admin/users/${target.id}/inspect/forum`, TA)).b.items;
  check('forum : le premier message est un « Sujet », l\'autre une « Réponse »', forum.some((i) => i.tags.includes('Sujet')) && forum.some((i) => i.tags.includes('Réponse')));
  check('section inconnue refusée', (await call('GET', `/admin/users/${target.id}/inspect/secret`, TA)).s === 400);

  // ---- conversations : déverrouillage obligatoire, tracé
  for (const sec of ['pm', 'dm', 'chat']) check(`« ${sec} » verrouillé sans mot de passe`, (await call('GET', `/admin/users/${target.id}/inspect/${sec}`, TA)).s === 403);
  check('mauvais mot de passe : refusé', [401, 403].includes((await call('POST', `/admin/users/${target.id}/inspect-unlock`, TA, { password: 'faux' })).s));
  check('bon mot de passe : déverrouillé', (await call('POST', `/admin/users/${target.id}/inspect-unlock`, TA, { password: PW })).s === 201);
  const pm = (await call('GET', `/admin/users/${target.id}/inspect/pm`, TA)).b;
  check('courrier : contenu visible', pm.items.length === 1 && pm.items[0].text.includes('Message privé secret') && pm.items[0].primary.includes(tag + 't'));
  const dm = (await call('GET', `/admin/users/${target.id}/inspect/dm`, TA)).b;
  check('messages privés : on voit les deux côtés de la conversation', dm.items.length === 1 && dm.items[0].text.includes('Salut en privé') && dm.items[0].secondary.includes(tag + 'f'));
  const chat = (await call('GET', `/admin/users/${target.id}/inspect/chat`, TA)).b;
  check('chat : messages de groupe du membre', chat.items.length === 1 && chat.items[0].text.includes('Message de groupe'));
  const audits = await p.activityLog.count({ where: { userId: adm.id, action: { in: ['STAFF_UNLOCK_PRIVATE', 'STAFF_VIEW_PRIVATE'] } } });
  check('chaque consultation est inscrite au journal d\'audit', audits >= 4, String(audits));
  check('un administrateur ne peut pas lire les conversations d\'un autre administrateur', (await call('POST', `/admin/users/${adm2.id}/inspect-unlock`, TA, { password: PW })).s === 403);

  // ---- réinitialisation obligatoire
  const sessionBefore = await call('GET', '/users/me', tok(target));
  check('avant : le membre est connecté normalement', sessionBefore.s === 200);
  check('un membre ne peut pas exiger de réinitialisation', (await call('POST', `/admin/users/${friend.id}/force-reset`, tok(other), {})).s === 403);
  const fr = await call('POST', `/admin/users/${target.id}/force-reset`, TA, {});
  check('réinitialisation exigée', fr.s === 201 && fr.b.mustResetPassword === true, fr.raw.slice(0, 100));
  check('ses sessions ouvertes sont coupées', (await call('GET', '/users/me', tok(target))).s === 401);
  const login = await call('POST', '/auth/login', null, { usernameOrEmail: tag + 't', password: PW });
  check('connexion refusée avec le bon mot de passe (message clair)', login.s === 403 && /réinitialisé/.test(login.raw), login.raw.slice(0, 90));
  const wrong = await call('POST', '/auth/login', null, { usernameOrEmail: tag + 't', password: 'faux-mot-de-passe' });
  check('mauvais mot de passe : refus ordinaire (rien n\'est révélé)', wrong.s === 401);
  const link = fr.b.link || (await p.passwordReset.findFirst({ where: { userId: target.id }, orderBy: { createdAt: 'desc' } }) && null);
  check('un lien est disponible (courriel non configuré ici : le lien est remis à l\'administrateur)', !!fr.b.link || fr.b.emailed === true);
  if (fr.b.link) {
    const token = fr.b.link.split('token=')[1];
    const NEW = 'Nouveau-mot-de-passe-9';
    const rs = await call('POST', '/auth/reset-password', null, { token, newPassword: NEW });
    check('le membre choisit un nouveau mot de passe avec le lien', rs.s === 201 && rs.b.reset === true, rs.raw.slice(0, 80));
    const again = await call('POST', '/auth/login', null, { usernameOrEmail: tag + 't', password: NEW });
    check('le compte est de nouveau utilisable', again.s === 201 && !!again.b.accessToken, again.raw.slice(0, 80));
    check('l\'exigence est levée', (await p.user.findUnique({ where: { id: target.id }, select: { mustResetPassword: true } })).mustResetPassword === false);
  }
  // annulation
  await call('POST', `/admin/users/${friend.id}/force-reset`, TA, {});
  check('annulation : exigence levée sans changer le mot de passe', (await call('POST', `/admin/users/${friend.id}/force-reset`, TA, { cancel: true })).b.mustResetPassword === false);
  await new Promise((r) => setTimeout(r, 16_000)); // le cache d'identité (15 s)
  check('annulation : le membre peut se reconnecter', (await call('POST', '/auth/login', null, { usernameOrEmail: tag + 'f', password: PW })).s === 201);

  // ---- nettoyage
  const ids = [adm.id, adm2.id, target.id, friend.id, other.id];
  await p.message.deleteMany({ where: { conversationId: { in: [conv.id, grp.id] } } });
  await p.conversation.deleteMany({ where: { id: { in: [conv.id, grp.id] } } });
  await p.privateMessage.deleteMany({ where: { OR: [{ senderId: { in: ids } }, { recipientId: { in: ids } }] } });
  await p.forumPost.deleteMany({ where: { topicId: topic.id } }); await p.forumTopic.deleteMany({ where: { id: topic.id } });
  await p.forumCategory.deleteMany({ where: { id: fcat.id, name: tag + 'f' } });
  await p.friendship.deleteMany({ where: { OR: [{ requesterId: { in: ids } }, { addresseeId: { in: ids } }] } });
  await p.snatch.deleteMany({ where: { torrentId: torrent.id } }); await p.torrent.deleteMany({ where: { id: torrent.id } }); await p.category.deleteMany({ where: { id: cat.id } });
  await p.passwordReset.deleteMany({ where: { userId: { in: ids } } });
  await p.activityLog.deleteMany({ where: { userId: { in: ids } } });
  await p.notification.deleteMany({ where: { userId: { in: ids } } });
  await p.user.deleteMany({ where: { id: { in: ids } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
