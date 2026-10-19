// Test de bout en bout : alertes de recherche (enregistrement, aperçu, vérification, notification, regroupement, isolement entre membres). Voir README.md.
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

(async () => {
  const p = new PrismaClient();
  const tag = 'al' + Date.now().toString(36).slice(-5);
  const hash = await bcrypt.hash('Mot-de-passe-test-1', 4);
  const old = new Date(Date.now() - 30 * 86400_000);
  await E2E.getAdmin(p, bcrypt);
  const mk = (n) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: old } });
  const alice = await mk('a'), bob = await mk('b'), uploader = await mk('u');
  const [TA, TB] = [tok(alice), tok(bob)];
  const cat = (await p.category.findFirst({ where: { adult: false } })) ?? (await p.category.create({ data: { name: 'Test ' + tag, slug: 'test-' + tag } }));
  const word = 'Zorglub' + tag;
  const mkTorrent = (i, name, extra = {}) => p.torrent.create({ data: { infoHash: (tag + i).padEnd(40, 'c'), name, filePath: '/x', size: 1_500_000_000n, fileList: [], categoryId: cat.id, uploaderId: uploader.id, status: 'APPROVED', resolution: '1080p', ...extra } });
  await mkTorrent('00', word + '.Ancien.2020.1080p-GRP', { createdAt: new Date(Date.now() - 86400_000) });

  // ---- enregistrement
  check('alerte sans critère refusée', (await call('POST', '/saved-searches', TA, { query: {} })).s === 400);
  check('alerte trop vague refusée', (await call('POST', '/saved-searches', TA, { query: { search: 'a', page: '2' } })).s === 400);
  const pv = await call('POST', '/saved-searches/preview', TA, { query: { search: word } });
  check('aperçu : compte les torrents actuels', pv.s === 201 && pv.b.total === 1 && pv.b.sample.length === 1, pv.raw.slice(0, 120));
  const created = await call('POST', '/saved-searches', TA, { query: { search: word, resolution: '1080p', page: '4', hack: 'x' }, inApp: true });
  check('alerte créée (filtres inconnus ignorés, nom proposé)', created.s === 201 && created.b.query.hack === undefined && created.b.query.page === undefined && created.b.name === word && /1080p/.test(created.b.summary), created.raw.slice(0, 200));
  const id = created.b.id;
  const tg = await call('POST', '/saved-searches', TA, { query: { search: 'Autre' + tag }, telegram: true });
  check('Telegram refusé tant que le compte n\'est pas relié', tg.s === 400 && /Telegram/.test(tg.raw));

  // ---- vérification : l'ancien torrent (avant l'alerte) ne déclenche rien, un nouveau oui
  const first = await call('POST', `/saved-searches/${id}/check`, TA);
  check('rien de nouveau depuis la création : aucune alerte', first.s === 201 && first.b.found === 0, first.raw.slice(0, 100));
  await new Promise((r) => setTimeout(r, 50));
  const t1 = await mkTorrent('01', word + '.Nouveau.2024.1080p-GRP');
  await mkTorrent('02', word + '.Mauvaise.Resolution.720p-GRP', { resolution: '720p' });
  await mkTorrent('03', 'Sans.Rapport.' + tag + '.1080p-GRP');
  const second = await call('POST', `/saved-searches/${id}/check`, TA);
  check('un nouveau torrent correspondant : 1 trouvé (le 720p et le hors-sujet sont ignorés)', second.b.found === 1 && second.b.item.matchCount === 1, second.raw.slice(0, 160));
  const notif = await p.notification.findFirst({ where: { userId: alice.id, groupKey: 'ss:' + id } });
  check('notification dans la cloche, avec le lien du torrent', !!notif && notif.link === `/torrents/${t1.id}` && /Nouveau/.test(notif.body ?? ''), JSON.stringify(notif)?.slice(0, 160));
  const again = await call('POST', `/saved-searches/${id}/check`, TA);
  check('pas de doublon à la vérification suivante', again.b.found === 0);
  await mkTorrent('04', word + '.Encore.2024.1080p-GRP'); await mkTorrent('05', word + '.EtEncore.2024.1080p-GRP');
  const third = await call('POST', `/saved-searches/${id}/check`, TA);
  const grouped = await p.notification.count({ where: { userId: alice.id, groupKey: 'ss:' + id } });
  check('deux autres torrents : 2 trouvés, regroupés dans la même notification', third.b.found === 2 && third.b.item.matchCount === 3 && grouped === 1, `found=${third.b.found} notifs=${grouped}`);
  const nb = await p.notification.count({ where: { userId: bob.id } });
  check('l\'autre membre ne reçoit rien', nb === 0);

  // ---- gestion
  check('l\'autre membre ne voit pas l\'alerte', (await call('GET', '/saved-searches', TB)).b.items.length === 0);
  check('ni ne peut la vérifier, la modifier ou la supprimer', (await call('POST', `/saved-searches/${id}/check`, TB)).s === 404 && (await call('PUT', `/saved-searches/${id}`, TB, { active: false })).s === 404 && (await call('DELETE', `/saved-searches/${id}`, TB)).s === 404);
  const off = await call('PUT', `/saved-searches/${id}`, TA, { active: false, name: 'Ma veille' });
  check('alerte mise en pause et renommée', off.s === 200 && off.b.active === false && off.b.name === 'Ma veille');
  const list = await call('GET', '/saved-searches', TA);
  check('liste du membre', list.s === 200 && list.b.items.length === 1 && list.b.max === 20 && list.b.telegramLinked === false);
  for (let i = 0; i < 19; i++) await call('POST', '/saved-searches', TA, { query: { search: 'Limite' + i + tag } });
  check('plafond de 20 alertes', (await call('POST', '/saved-searches', TA, { query: { search: 'De trop' + tag } })).s === 400);
  check('alerte supprimée', (await call('DELETE', `/saved-searches/${id}`, TA)).s === 200);
  check('sans connexion : refusé', (await call('GET', '/saved-searches')).s === 401);

  // ---- nettoyage
  await p.torrent.deleteMany({ where: { uploaderId: uploader.id } });
  await p.user.deleteMany({ where: { id: { in: [alice.id, bob.id, uploader.id] } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
