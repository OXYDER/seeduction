// Test de bout en bout : séries suivies (suivre depuis la fiche, compte à rebours TMDB, notifications la veille / le jour J / à l'arrivée du torrent). Voir README.md.
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const BASE = E2E.BASE;
async function call(method, p, token) { const r = await fetch(BASE + p, { method, headers: token ? { Authorization: 'Bearer ' + token } : {} }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { s: r.status, b: j, raw: t }; }
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
const tok = (u) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, E2E.SECRET, { expiresIn: '1h' });

(async () => {
  const p = new PrismaClient();
  const { localDay } = require(E2E.DIST + 'common/utils/series-follow.js');
  const { SeriesFollowService } = require(E2E.DIST + 'series-follow/series-follow.service.js');
  const tag = 'sf' + Date.now().toString(36).slice(-5);
  const mk = (n) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: 'x', createdAt: new Date(Date.now() - 30 * 86400_000) } });
  const up = await mk('u'), fan = await mk('f'), other = await mk('o');
  const cat = (await p.category.findFirst({ where: { adult: false, parentId: null } })) ?? (await p.category.create({ data: { name: 'Test ' + tag, slug: 'test-' + tag } }));
  const sid = 'tv' + tag;
  const torrents = [];
  const tor = async (name, data = {}) => { const t = await p.torrent.create({ data: { infoHash: require('crypto').randomBytes(20).toString('hex'), name, filePath: '/x', size: 1000n, fileList: [], categoryId: cat.id, uploaderId: up.id, status: 'APPROVED', ...data } }); torrents.push(t.id); return t; };
  const tv = { metaSource: 'tmdb', metaExternalId: sid, metadata: { kind: 'tv' } };
  const e1 = await tor('Youth' + tag + '.S01E01.MULTI.1080p', { ...tv, season: '01', episode: '01' });
  const film = await tor('Film.' + tag, { metaSource: 'tmdb', metaExternalId: 'mv' + tag, metadata: { kind: 'movie' } });
  const T = tok(fan);

  // ---- API
  check('sans connexion : refusé', (await call('GET', '/series-follow')).s === 401);
  check('un film ne se suit pas', (await call('POST', `/series-follow/torrent/${film.id}`, T)).s === 400 && (await call('GET', `/series-follow/status?torrentId=${film.id}`, T)).b.followable === false);
  const st0 = await call('GET', `/series-follow/status?torrentId=${e1.id}`, T);
  check('torrent de série : suivable, pas encore suivi', st0.b.followable === true && st0.b.following === false);
  const f = await call('POST', `/series-follow/torrent/${e1.id}`, T);
  check('série suivie', f.s === 201 && /Youth/.test(f.b.title), f.raw.slice(0, 100));
  check('suivre deux fois ne crée pas de doublon', (await call('POST', `/series-follow/torrent/${e1.id}`, T)).s === 201 && (await p.seriesFollow.count({ where: { userId: fan.id } })) === 1);
  const list = await call('GET', '/series-follow', T);
  check('liste : la série et son dernier épisode sur Seeduction', list.b.length === 1 && list.b[0].latestOnSite.label === 'S01E01');
  check('chacun a sa liste', (await call('GET', '/series-follow', tok(other))).b.length === 0);
  check('retirer la série d\'un autre : refusé', (await call('DELETE', `/series-follow/${f.b.id}`, tok(other))).s === 404);

  // ---- rafraîchissement TMDB simulé : compte à rebours et notifications
  const sent = [];
  let info = { title: 'Youth', cover: null, status: 'Returning Series', next: { airDate: localDay(Date.now() + 5 * 86400_000), season: 1, episode: 3, name: 'Le retour' }, last: { airDate: localDay(Date.now() - 20 * 86400_000), season: 1, episode: 2 } };
  const svc = new SeriesFollowService(p, { seriesAirInfo: async () => info }, { notify: async (n) => { sent.push(n); } });
  const row = () => p.seriesFollow.findFirst({ where: { userId: fan.id } });
  await svc.refreshOne(f.b.id, { firstTime: true });
  let r = await row();
  check('mise en suivi : état TMDB enregistré, point de départ = dernier épisode sorti, aucune notification', r.nextEpisode === 3 && r.baseEpisode === 2 && sent.length === 0);
  const l2 = await call('GET', '/series-follow', T);
  check('compte à rebours : dans 5 jours', l2.b[0].next.days === 5 && l2.b[0].next.label === 'S01E03' && /5 jours/.test(l2.b[0].next.countdown), JSON.stringify(l2.b[0].next));

  info = { ...info, next: { ...info.next, airDate: localDay(Date.now() + 86400_000) } };
  await svc.refreshOne(f.b.id);
  check('la veille de la sortie : « Demain »', sent.length === 1 && /Demain/.test(sent[0].title) && sent[0].userId === fan.id, sent.map((n) => n.title).join(' | '));
  await svc.refreshOne(f.b.id);
  check('pas de doublon au rafraîchissement suivant', sent.length === 1);

  info = { title: 'Youth', cover: null, status: 'Returning Series', next: { airDate: localDay(Date.now() + 7 * 86400_000), season: 1, episode: 4, name: null }, last: { airDate: localDay(), season: 1, episode: 3 } };
  await svc.refreshOne(f.b.id);
  check('le jour de la sortie : « vient de sortir », pas encore sur Seeduction', sent.length === 2 && /S01E03 vient de sortir/.test(sent[1].title) && /Pas encore/.test(sent[1].body), sent[1]?.title);
  await svc.refreshOne(f.b.id);
  check('annoncé une seule fois', sent.length === 2);

  // ---- arrivée du torrent
  const e3 = await tor('Youth' + tag + '.S01E03.MULTI.1080p', { ...tv, season: '01', episode: '03' });
  const old = await tor('Youth' + tag + '.S01E01.OLD', { ...tv, season: '01', episode: '01' });
  const mineEp = await tor('Youth' + tag + '.S01E03.UP', { ...tv, season: '01', episode: '03', uploaderId: fan.id });
  const n3 = await svc.onTorrentApproved(e3.id);
  check('l\'épisode arrive sur Seeduction : le suiveur est prévenu', n3 === 1 && /S01E03 est disponible/.test(sent[2].title) && sent[2].link === `/torrents/${e3.id}`, sent[2]?.title);
  check('un épisode plus ancien que le point de départ ne prévient personne', (await svc.onTorrentApproved(old.id)) === 0);
  check('l\'envoyeur n\'est pas prévenu de son propre envoi', (await svc.onTorrentApproved(mineEp.id)) === 0);
  check('les notifications groupent les versions du même épisode', sent[2].groupKey.endsWith(':available:1x3') && /versions/.test(sent[2].titleMany));

  // ---- fin
  check('ne plus suivre', (await call('DELETE', `/series-follow/${f.b.id}`, T)).s === 200 && (await call('GET', '/series-follow', T)).b.length === 0);
  const ids = [up.id, fan.id, other.id];
  await p.seriesFollow.deleteMany({ where: { userId: { in: ids } } });
  await p.torrent.deleteMany({ where: { id: { in: torrents } } });
  await p.notification.deleteMany({ where: { userId: { in: ids } } });
  await p.user.deleteMany({ where: { id: { in: ids } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
