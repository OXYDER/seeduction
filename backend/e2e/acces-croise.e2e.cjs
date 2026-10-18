// Test de bout en bout : accès croisés (un membre ne peut ni lire ni modifier les ressources privées d'un autre). Voir README.md.
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const bcrypt = require(B + 'bcrypt');
const crypto = require('crypto');
const BASE = E2E.BASE;
async function call(method, p, token, body) {
  const r = await fetch(BASE + p, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch {} return { s: r.status, b: j, raw: text };
}
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
const tok = (u) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, E2E.SECRET, { expiresIn: '1h' });
/** Une tentative d'accès croisé doit être refusée (ni 2xx, ni contenu du secret). */
const denied = (r, secret) => ![200, 201, 204].includes(r.s) && !(secret && r.raw.includes(secret));

(async () => {
  const p = new PrismaClient();
  const tag = 'ac' + Date.now().toString(36).slice(-4);
  const hash = await bcrypt.hash('Mot-de-passe-test-1', 4);
  const old = new Date(Date.now() - 30 * 86400_000);
  const mk = (n, extra = {}) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: old, bonusPoints: 500, ...extra } });
  const victim = await mk('v'), attacker = await mk('x'), third = await mk('t');
  const TV = tok(victim), TX = tok(attacker);
  const SECRET = 'SECRET-' + tag;

  // ---- données privées de la victime
  const thread = crypto.randomUUID();
  const pm = await p.privateMessage.create({ data: { senderId: victim.id, recipientId: third.id, subject: 'Privé', content: 'Contenu ' + SECRET, threadId: thread } });
  const conv = await p.conversation.create({ data: { type: 'DIRECT', directKey: tag + 'k', members: { create: [{ userId: victim.id }, { userId: third.id }] } } });
  const msg = await p.message.create({ data: { conversationId: conv.id, senderId: victim.id, content: 'Message ' + SECRET } });
  const coll = await p.collection.create({ data: { name: 'Privée ' + SECRET, ownerId: victim.id, visibility: 'PRIVATE' } });
  const notif = await p.notification.create({ data: { userId: victim.id, type: 'SYSTEM', title: 'Notif ' + SECRET } });
  const key = await p.apiKey.create({ data: { userId: victim.id, label: 'clé ' + SECRET, keyHash: crypto.randomBytes(16).toString('hex'), keyPrefix: 'abcd' } });
  const cat = await p.category.create({ data: { name: tag + 'c', slug: tag + 'c' } });
  const torrent = await p.torrent.create({ data: { infoHash: tag.padEnd(40, 'b'), name: tag + '.Release.2024-GRP', filePath: '/x', size: 1n, fileList: [], categoryId: cat.id, uploaderId: victim.id, status: 'APPROVED' } });
  const comment = await p.torrentComment.create({ data: { torrentId: torrent.id, authorId: victim.id, content: 'Commentaire ' + SECRET } });
  const tk = await call('POST', '/support/tickets', TV, { subject: 'Ticket ' + SECRET, content: 'Détail du problème ' + SECRET, fromChat: false });
  const ticketId = tk.b?.id ?? tk.b?.ticket?.id;
  const fcat = await p.forumCategory.create({ data: { name: tag + 'f' } });
  const topic = await p.forumTopic.create({ data: { title: tag + 't', categoryId: fcat.id, authorId: victim.id } });
  const post = await p.forumPost.create({ data: { topicId: topic.id, authorId: victim.id, content: 'Post ' + SECRET } });

  // ---- messagerie
  let r = await call('GET', `/messages/thread/${thread}`, TX); check('courrier : lire le fil d\'un autre membre', denied(r, SECRET), `${r.s}`);
  r = await call('POST', `/messages/thread/${thread}/reply`, TX, { content: 'intrus' }); check('courrier : répondre dans le fil d\'un autre', denied(r), `${r.s}`);
  r = await call('DELETE', `/messages/thread/${thread}`, TX); check('courrier : supprimer le fil d\'un autre (aucun effet)', denied(r) || (await p.privateMessage.count({ where: { id: pm.id, deletedBySender: false, deletedByRecipient: false } })) === 1, `${r.s}`);
  check('courrier : le message existe toujours, non supprimé', (await p.privateMessage.count({ where: { id: pm.id, deletedBySender: false, deletedByRecipient: false } })) === 1);
  r = await call('POST', `/messages/${pm.id}/read`, TX); check('courrier : marquer lu un message d\'un autre', denied(r) || (await p.privateMessage.findUnique({ where: { id: pm.id } })).read === false, `${r.s}`);

  // ---- messager
  r = await call('GET', `/messenger/conversations/${conv.id}`, TX); check('messager : lire une conversation dont on n\'est pas membre', denied(r, SECRET), `${r.s}`);
  r = await call('GET', `/messenger/conversations/${conv.id}/messages`, TX); check('messager : lire ses messages', denied(r, SECRET), `${r.s}`);
  r = await call('GET', `/messenger/conversations/${conv.id}/search?q=${encodeURIComponent(SECRET)}`, TX); check('messager : chercher dedans', denied(r, SECRET), `${r.s}`);
  r = await call('POST', `/messenger/conversations/${conv.id}/messages`, TX, { content: 'intrus' }); check('messager : écrire dedans', denied(r), `${r.s}`);
  r = await call('POST', `/messenger/conversations/${conv.id}/members`, TX, { userIds: [attacker.id] }); check('messager : s\'y ajouter', denied(r) && (await p.conversationMember.count({ where: { conversationId: conv.id, userId: attacker.id } })) === 0, `${r.s}`);
  r = await call('POST', `/messenger/messages/${msg.id}/forward`, TX, { conversationIds: [] }); check('messager : transférer un message qu\'on ne voit pas', denied(r, SECRET), `${r.s}`);
  r = await call('GET', '/messenger/conversations', TX); check('messager : la liste de l\'attaquant ne contient pas la conversation', r.s === 200 && !r.raw.includes(conv.id));

  // ---- collections, notifications, clés, commentaires, forum, envois
  r = await call('GET', `/collections/${coll.id}`, TX); check('collection privée : lecture', denied(r, SECRET), `${r.s}`);
  r = await call('PATCH', `/collections/${coll.id}`, TX, { name: 'piratée' }); check('collection privée : modification', denied(r), `${r.s}`);
  r = await call('DELETE', `/collections/${coll.id}`, TX); check('collection privée : suppression', denied(r) && (await p.collection.count({ where: { id: coll.id } })) === 1, `${r.s}`);
  r = await call('POST', `/notifications/${notif.id}/read`, TX); check('notification d\'un autre : marquer lue', denied(r) || (await p.notification.findUnique({ where: { id: notif.id } })).read === false, `${r.s}`);
  r = await call('DELETE', `/notifications/${notif.id}`, TX); check('notification d\'un autre : supprimer', (await p.notification.count({ where: { id: notif.id } })) === 1, `${r.s}`);
  r = await call('DELETE', `/keys/${key.id}`, TX); check('clé d\'API d\'un autre : révoquer', (await p.apiKey.findUnique({ where: { id: key.id } })).revoked === false, `${r.s}`);
  r = await call('GET', '/keys', TX); check('clés d\'API : la liste de l\'attaquant ne montre pas celles de la victime', r.s === 200 && !r.raw.includes(key.id));
  r = await call('PATCH', `/comments/${comment.id}`, TX, { content: 'piraté' }); check('commentaire d\'un autre : modifier', (await p.torrentComment.findUnique({ where: { id: comment.id } })).content.includes(SECRET), `${r.s}`);
  r = await call('DELETE', `/comments/${comment.id}`, TX); check('commentaire d\'un autre : supprimer', (await p.torrentComment.count({ where: { id: comment.id } })) === 1, `${r.s}`);
  r = await call('PATCH', `/forum/posts/${post.id}`, TX, { content: 'piraté' }); check('message de forum d\'un autre : modifier', (await p.forumPost.findUnique({ where: { id: post.id } })).content.includes(SECRET), `${r.s}`);
  r = await call('DELETE', `/forum/posts/${post.id}`, TX); check('message de forum d\'un autre : supprimer', (await p.forumPost.count({ where: { id: post.id } })) === 1, `${r.s}`);
  r = await call('PATCH', `/my-torrents/${torrent.id}`, TX, { name: 'piraté' }); check('envoi d\'un autre : modifier', (await p.torrent.findUnique({ where: { id: torrent.id } })).name.includes(tag), `${r.s}`);
  r = await call('DELETE', `/my-torrents/${torrent.id}`, TX); check('envoi d\'un autre : supprimer', (await p.torrent.count({ where: { id: torrent.id } })) === 1, `${r.s}`);

  // ---- support
  if (ticketId) {
    r = await call('GET', `/support/tickets/${ticketId}`, TX); check('billet de support d\'un autre : lecture', denied(r, SECRET), `${r.s}`);
    r = await call('POST', `/support/tickets/${ticketId}/reply`, TX, { content: 'intrus intrus intrus' }); check('billet de support d\'un autre : réponse', denied(r), `${r.s}`);
    r = await call('POST', `/support/tickets/${ticketId}/status`, TX, { status: 'CLOSED' }); check('billet de support d\'un autre : fermeture', denied(r), `${r.s}`);
  } else console.log('INFO billet de support non créé (' + tk.s + ') : vérifications ignorées');

  // ---- profil public d'un autre : jamais de secrets
  r = await call('GET', `/users/${victim.id}`, TX);
  check('profil d\'un autre : ni passkey, ni courriel, ni mot de passe', r.s === 200 && !/passkey|passwordHash|"email"|twoFactor/i.test(r.raw), r.raw.slice(0, 100));
  r = await call('GET', `/users/me`, TX); check('son propre profil : passkey visible (normal)', r.s === 200 && !!r.b.passkey);
  r = await call('GET', `/admin/users/${victim.id}/inspect`, TX); check('route d\'administration refusée à un membre', r.s === 403);

  // ---- nettoyage
  const ids = [victim.id, attacker.id, third.id];
  await p.message.deleteMany({ where: { conversationId: conv.id } }); await p.conversation.deleteMany({ where: { id: conv.id } });
  await p.privateMessage.deleteMany({ where: { threadId: thread } });
  await p.collection.deleteMany({ where: { ownerId: { in: ids } } }); await p.notification.deleteMany({ where: { userId: { in: ids } } }); await p.apiKey.deleteMany({ where: { userId: { in: ids } } });
  await p.torrentComment.deleteMany({ where: { torrentId: torrent.id } }); await p.forumPost.deleteMany({ where: { topicId: topic.id } }); await p.forumTopic.deleteMany({ where: { id: topic.id } });
  await p.forumCategory.deleteMany({ where: { id: fcat.id, name: tag + 'f' } });
  await p.torrent.deleteMany({ where: { id: torrent.id } }); await p.category.deleteMany({ where: { id: cat.id } });
  await p.supportTicketMessage?.deleteMany?.({ where: { ticketId: ticketId ?? 'x' } }).catch(() => undefined);
  await p.supportTicket.deleteMany({ where: { requesterId: { in: ids } } }).catch(() => undefined);
  await p.activityLog.deleteMany({ where: { userId: { in: ids } } }); await p.memberActivity?.deleteMany?.({ where: { userId: { in: ids } } }).catch(() => undefined);
  await p.user.deleteMany({ where: { id: { in: ids } } }).catch((e) => console.log('nettoyage partiel :', e.message.slice(0, 80)));
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
