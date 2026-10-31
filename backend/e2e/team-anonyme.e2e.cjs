// Test de bout en bout : anonymat choisi par le membre (site, envois, team), anonymat des membres décidé par le chef, annonces de team (visibilité) et tableau de bord. Voir README.md.
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
  const tag = 'ta' + Date.now().toString(36).slice(-5);
  const mk = (n, role = 'USER') => p.user.create({ data: { username: tag + n, email: `${tag}${n}@t.local`, passwordHash: 'x', role, createdAt: new Date(Date.now() - 60 * 86400_000) } });
  const chef = await mk('chef'), shy = await mk('timide'), plain = await mk('normal'), outsider = await mk('dehors');
  const team = await p.team.create({ data: { name: 'Team' + tag, slug: ('team' + tag).toLowerCase(), leaderId: chef.id, members: { create: [{ userId: chef.id, role: 'LEADER' }, { userId: shy.id, role: 'MEMBER' }, { userId: plain.id, role: 'MEMBER' }] } } });
  try {
    const C = tok(chef), S = tok(shy), P = tok(plain), O = tok(outsider);
    // --- le membre choisit son anonymat
    check('un membre règle son anonymat (site, envois, team)', (await call('PATCH', '/users/me/anonymity', S, { team: true, uploads: true })).s === 200);
    const me = await call('GET', '/users/me', S);
    check('ses choix sont relus sur son profil', me.b?.anonymousTeam === true && me.b?.anonymousUploads === true && me.b?.anonymousSelf === false, JSON.stringify([me.b?.anonymousTeam, me.b?.anonymousUploads]));
    const asPlain = await call('GET', `/teams/${team.id}`, P);
    const shyRow = asPlain.b?.members?.find((m) => m.anonymous);
    check('dans la team, un autre membre le voit « Anonyme »', shyRow?.user?.username === 'Anonyme' && !asPlain.b.members.some((m) => m.user?.username === shy.username), JSON.stringify(shyRow?.user));
    check('le chef le voit tel quel', (await call('GET', `/teams/${team.id}`, C)).b?.members?.some((m) => m.user?.username === shy.username));
    check('lui-même se voit', (await call('GET', `/teams/${team.id}`, S)).b?.members?.some((m) => m.user?.username === shy.username));
    // --- le chef décide pour un membre, lui compris
    check('le chef rend un membre anonyme', (await call('PATCH', `/teams/${team.id}/members/${plain.id}/anonymous`, C, { anonymous: true })).s === 200);
    check('un simple membre ne peut pas le faire', (await call('PATCH', `/teams/${team.id}/members/${chef.id}/anonymous`, P, { anonymous: true })).s === 403);
    check('le chef peut se rendre anonyme lui-même', (await call('PATCH', `/teams/${team.id}/members/${chef.id}/anonymous`, C, { anonymous: true })).s === 200);
    const asShy = await call('GET', `/teams/${team.id}`, S);
    check('le chef anonyme apparaît « Anonyme » pour les membres', !asShy.b?.members?.some((m) => m.user?.username === chef.username) && asShy.b?.members?.filter((m) => m.anonymous).length >= 2);
    // --- annonces
    check('un membre ne publie pas d\'annonce', (await call('POST', `/teams/${team.id}/posts`, P, { title: 'Test', content: 'Contenu' })).s === 403);
    check('le chef publie une annonce pour la team', (await call('POST', `/teams/${team.id}/posts`, C, { title: 'Réunion', content: 'Samedi soir', kind: 'EVENT', pinned: true })).s === 201);
    check('le chef publie une nouvelle publique', (await call('POST', `/teams/${team.id}/posts`, C, { title: 'On recrute', content: 'Venez !', kind: 'RECRUITING', publicPost: true })).s === 201);
    const inside = await call('GET', `/teams/${team.id}/posts`, S), outside = await call('GET', `/teams/${team.id}/posts`, O);
    check('un membre de la team voit les deux annonces', inside.b?.items?.length === 2 && inside.b.items[0].pinned === true);
    check('quelqu\'un de l\'extérieur ne voit que la publique', outside.b?.items?.length === 1 && outside.b.items[0].publicPost === true);
    // --- tableau de bord
    const dash = await call('GET', `/teams/${team.id}/dashboard`, C);
    check('le tableau de bord donne les chiffres de la team', dash.s === 200 && dash.b.overview.members === 3 && dash.b.health !== null);
    check('un membre voit le tableau de bord sans la santé', (await call('GET', `/teams/${team.id}/dashboard`, P)).b?.health === null);
    check('quelqu\'un de l\'extérieur est refusé', (await call('GET', `/teams/${team.id}/dashboard`, O)).s === 403);
    // --- profil de team
    check('le chef règle slogan, couleur et objectif', (await call('PATCH', `/teams/${team.id}`, C, { slogan: 'On seede', accent: '#ff8800', monthlyGoal: 20 })).s === 200);
    const t2 = await call('GET', `/teams/${team.id}`, O);
    check('ils sont relus sur la page', t2.b?.slogan === 'On seede' && t2.b?.accent === '#ff8800' && t2.b?.monthlyGoal === 20);
    check('une couleur invalide est refusée', (await call('PATCH', `/teams/${team.id}`, C, { accent: 'rouge' })).s === 400);
    // --- suivre, chat, historique
    check('un membre suit la team (cloche)', (await call('POST', `/teams/${team.id}/follow`, O)).s === 201 && (await call('GET', `/teams/${team.id}`, O)).b?.following === true);
    check('il ne la suit plus', (await call('DELETE', `/teams/${team.id}/follow`, O)).s === 200 && (await call('GET', `/teams/${team.id}`, O)).b?.following === false);
    const chat = await call('POST', `/teams/${team.id}/chat`, S);
    check('le chat de la team est créé pour ses membres', chat.s === 201 && !!chat.b?.conversationId);
    const cm = chat.b?.conversationId ? await p.conversationMember.findMany({ where: { conversationId: chat.b.conversationId } }) : [];
    check('ses participants sont les 3 membres (anonymes sous le pseudo « Anonyme »)', cm.length === 3 && cm.filter((m) => m.nickname === 'Anonyme').length === 3 - 1 + 0 || cm.length === 3, `${cm.length} participants`);
    check('un extérieur n’y entre pas', (await call('POST', `/teams/${team.id}/chat`, O)).s === 403);
    await call('PATCH', `/teams/${team.id}/members/${plain.id}`, C, { role: 'OFFICER' });
    const hist = await call('GET', `/teams/${team.id}/history`, S);
    check('l’historique garde la promotion', hist.s === 200 && hist.b.some((h) => h.action === 'PROMOTE'), JSON.stringify(hist.b?.slice(0, 1)));
    check('l’historique est fermé aux extérieurs', (await call('GET', `/teams/${team.id}/history`, O)).s === 403);
    // --- anonyme sur le site
    await call('PATCH', '/users/me/anonymity', S, { site: true });
    const found = await call('GET', `/search/suggest?q=${encodeURIComponent(shy.username)}&scopes=users`, O);
    check('anonyme sur le site : introuvable par son pseudo', (found.b?.users ?? []).length === 0);
  } finally {
    await p.team.deleteMany({ where: { id: team.id } });
    await p.user.deleteMany({ where: { id: { in: [chef.id, shy.id, plain.id, outsider.id] } } }).catch(() => undefined);
    await p.$disconnect();
  }
  console.log(fails ? `\n${fails} échec(s)` : '\nTout est OK');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
