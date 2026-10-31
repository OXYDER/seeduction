// Test de bout en bout : le Mur (profil et team) — visibilité, amis, réactions, commentaires, anonymat, signalement, limites. Voir README.md.
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const BASE = E2E.BASE;
const tok = (u) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, E2E.SECRET, { expiresIn: '1h' });
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
async function call(m, p, t, body) { const r = await fetch(BASE + p, { method: m, headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, b: await r.json().catch(() => null) }; }

(async () => {
  const p = new PrismaClient();
  const tag = 'mu' + Date.now().toString(36).slice(-5);
  const mk = (n, role = 'USER') => p.user.create({ data: { username: tag + n, email: `${tag}${n}@t.local`, passwordHash: 'x', role, createdAt: new Date(Date.now() - 60 * 86400_000) } });
  const alice = await mk('alice'), ami = await mk('ami'), autre = await mk('autre'), mod = await mk('mod', 'MODERATOR'), timide = await mk('timide');
  const team = await p.team.create({ data: { name: 'Team' + tag, slug: ('team' + tag).toLowerCase(), leaderId: alice.id, members: { create: [{ userId: alice.id, role: 'LEADER' }, { userId: ami.id, role: 'MEMBER' }, { userId: timide.id, role: 'MEMBER' }] } } });
  await p.friendship.create({ data: { requesterId: alice.id, addresseeId: ami.id, status: 'ACCEPTED' } });
  const ids = [alice.id, ami.id, autre.id, mod.id, timide.id];
  try {
    const A = tok(alice), F = tok(ami), O = tok(autre), M = tok(mod), T = tok(timide);
    // --- publier sur son profil
    check('un membre publie sur son mur', (await call('POST', '/wall/posts', A, { content: 'Salut tout le monde', visibility: 'MEMBERS' })).s === 201);
    check('…une publication réservée aux amis', (await call('POST', '/wall/posts', A, { content: 'Entre amis', visibility: 'FRIENDS' })).s === 201);
    const priv = await call('POST', '/wall/posts', A, { content: 'Pour moi seul', visibility: 'ME' });
    check('…une publication privée', priv.s === 201);
    check('rien ni image ni lien : refusé', (await call('POST', '/wall/posts', A, { content: '  ' })).s === 400);
    check('un lien javascript: est refusé', (await call('POST', '/wall/posts', A, { content: 'x', linkUrl: 'javascript:alert(1)' })).s === 400);
    check('une image d’un autre site est refusée', (await call('POST', '/wall/posts', A, { content: 'x', imageUrl: 'https://autre.site/a.jpg' })).s === 400);
    check('un lien http(s) passe', (await call('POST', '/wall/posts', A, { content: 'Regarde', linkUrl: 'https://example.com/page' })).s === 201);
    check('visibilité invalide refusée', (await call('POST', '/wall/posts', A, { content: 'x', visibility: 'TEAM' })).s === 400);
    // --- qui voit quoi
    const mine = await call('GET', `/wall/user/${alice.id}`, A), asFriend = await call('GET', `/wall/user/${alice.id}`, F), asOther = await call('GET', `/wall/user/${alice.id}`, O);
    const texts = (r) => (r.b?.items ?? []).filter((i) => i.kind === 'POST').map((i) => i.content);
    check('elle voit ses 4 publications', texts(mine).length === 4, JSON.stringify(texts(mine)));
    check('son ami voit aussi celle des amis, pas la privée', texts(asFriend).includes('Entre amis') && !texts(asFriend).includes('Pour moi seul'));
    check('un autre membre ne voit que celles du site', texts(asOther).includes('Salut tout le monde') && !texts(asOther).includes('Entre amis') && !texts(asOther).includes('Pour moi seul'));
    check('le staff voit tout', texts(await call('GET', `/wall/user/${alice.id}`, M)).length === 4);
    check('seule la propriétaire peut publier', mine.b?.canPost === true && asOther.b?.canPost === false);
    // --- fil
    const feedFriend = await call('GET', '/wall/feed', F), feedOther = await call('GET', '/wall/feed', O);
    check('le fil d’un ami montre les publications d’Alice', texts(feedFriend).includes('Entre amis'));
    check('le fil d’un étranger ne montre rien d’Alice', texts(feedOther).length === 0);
    // --- réactions et commentaires
    const postId = mine.b.items.find((i) => i.content === 'Salut tout le monde').id;
    check('un membre réagit', (await call('PUT', `/wall/posts/${postId}/react`, O, { type: '🔥' })).b?.counts?.['🔥'] === 1);
    check('une réaction hors liste est refusée', (await call('PUT', `/wall/posts/${postId}/react`, O, { type: 'zzz' })).s === 400);
    check('changer de réaction remplace l’ancienne', (await call('PUT', `/wall/posts/${postId}/react`, O, { type: '❤️' })).b?.counts?.['🔥'] === undefined);
    check('un membre commente', (await call('POST', `/wall/posts/${postId}/comments`, O, { content: 'Bravo !' })).s === 201);
    const noteCount = await p.notification.count({ where: { userId: alice.id, groupKey: `wall-${postId}` } });
    check('l’auteure est prévenue', noteCount === 1, String(noteCount));
    check('les compteurs suivent', (await call('GET', `/wall/user/${alice.id}`, O)).b.items.find((i) => i.id === postId)?.commentCount === 1);
    const privId = mine.b.items.find((i) => i.content === 'Pour moi seul').id;
    check('on ne commente pas ce qu’on ne voit pas', (await call('POST', `/wall/posts/${privId}/comments`, O, { content: 'coucou' })).s === 404);
    check('on ne réagit pas non plus', (await call('PUT', `/wall/posts/${privId}/react`, O, { type: '🔥' })).s === 404);
    const cm = await call('GET', `/wall/posts/${postId}/comments`, A);
    check('la propriétaire lit et peut supprimer un commentaire', cm.b?.[0]?.canDelete === true && (await call('DELETE', `/wall/comments/${cm.b[0].id}`, A)).s === 200);
    // --- suppression
    check('un autre membre ne supprime pas', (await call('DELETE', `/wall/posts/${postId}`, O)).s === 403);
    check('le staff peut supprimer', (await call('DELETE', `/wall/posts/${privId}`, M)).s === 200);
    // --- événements du profil
    await p.userBadge.create({ data: { userId: alice.id, code: 'first_upload' } }).catch(() => undefined);
    const ev = await call('GET', `/wall/user/${alice.id}`, O);
    check('le mur mêle l’historique (arrivée en team ou badges)', Array.isArray(ev.b?.items), `${ev.b?.items?.length} éléments`);
    // --- mur de team
    check('un extérieur ne publie pas sur la team', (await call('POST', '/wall/posts', O, { teamId: team.id, content: 'intrus' })).s === 403);
    check('un membre publie pour la team (par défaut : team seule)', (await call('POST', '/wall/posts', F, { teamId: team.id, content: 'Entre nous' })).b?.visibility === 'TEAM');
    check('…et une publication visible de tout le site', (await call('POST', '/wall/posts', A, { teamId: team.id, content: 'Venez !', visibility: 'MEMBERS' })).s === 201);
    const tIn = await call('GET', `/wall/team/${team.id}`, F), tOut = await call('GET', `/wall/team/${team.id}`, O);
    check('les membres de la team voient les deux', texts(tIn).length === 2 && tIn.b.canPost === true);
    check('un extérieur ne voit que la publique', texts(tOut).length === 1 && texts(tOut)[0] === 'Venez !' && tOut.b.canPost === false);
    check('le fil des membres de la team contient ses publications', texts(await call('GET', '/wall/feed', T)).includes('Entre nous'));
    // --- anonymat dans la team
    await call('PATCH', '/users/me/anonymity', T, { team: true });
    await call('POST', '/wall/posts', T, { teamId: team.id, content: 'Moi anonyme' });
    const seen = await call('GET', `/wall/team/${team.id}`, F);
    const anonPost = seen.b.items.find((i) => i.content === 'Moi anonyme');
    check('un membre anonyme de la team apparaît « Anonyme » pour les autres', anonPost?.author?.username === 'Anonyme' && anonPost.author.id === null, JSON.stringify(anonPost?.author));
    const seenLeader = await call('GET', `/wall/team/${team.id}`, A);
    check('la cheffe voit son vrai nom', seenLeader.b.items.find((i) => i.content === 'Moi anonyme')?.author?.username === timide.username);
    check('l’intéressé se voit', (await call('GET', `/wall/team/${team.id}`, T)).b.items.find((i) => i.content === 'Moi anonyme')?.author?.username === timide.username);
    // --- anonyme sur le site : son mur n'existe plus
    await call('PATCH', '/users/me/anonymity', T, { site: true });
    check('un membre anonyme sur le site : son mur est introuvable', (await call('GET', `/wall/user/${timide.id}`, O)).s === 404);
    // --- signalement
    check('on peut signaler une publication', (await call('POST', '/reports', O, { targetType: 'wallPost', targetId: postId, reason: 'Contenu douteux' })).s === 201);
    // --- limite
    await p.wallPost.createMany({ data: Array.from({ length: 30 }, () => ({ authorId: autre.id, content: 'spam' })) });
    check('limite de 30 publications par jour', (await call('POST', '/wall/posts', O, { content: 'de trop' })).s === 400);
  } finally {
    await p.report.deleteMany({ where: { reporterId: { in: ids } } }).catch(() => undefined);
    await p.wallPost.deleteMany({ where: { authorId: { in: ids } } });
    await p.team.deleteMany({ where: { id: team.id } });
    await p.notification.deleteMany({ where: { userId: { in: ids } } }).catch(() => undefined);
    await p.user.deleteMany({ where: { id: { in: ids } } }).catch(() => undefined);
    await p.$disconnect();
  }
  console.log(fails ? `\n${fails} échec(s)` : '\nTout est OK');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
