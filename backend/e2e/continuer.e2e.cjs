// Test de bout en bout : « Continuer à regarder » (reprise, épisode suivant, séries, contenu adulte exclu, retrait, isolement entre membres). Voir README.md.
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
  const tag = 'cw' + Date.now().toString(36).slice(-5);
  const hash = await bcrypt.hash('Mot-de-passe-test-1', 4);
  const old = new Date(Date.now() - 30 * 86400_000);
  await E2E.getAdmin(p, bcrypt);
  const mk = (n) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: old } });
  const me = await mk('a'), other = await mk('b'), up = await mk('u');
  const [TM, TO] = [tok(me), tok(other)];
  const cat = (await p.category.findFirst({ where: { adult: false, parentId: null } })) ?? (await p.category.create({ data: { name: 'Test ' + tag, slug: 'test-' + tag } }));
  const adult = await p.category.create({ data: { name: 'Adulte ' + tag, slug: 'adulte-' + tag, adult: true } });
  let n = 0;
  const mkT = (name, extra = {}) => p.torrent.create({ data: { infoHash: (tag + (n++)).padEnd(40, 'd'), name, filePath: '/x', size: 1_000_000_000n, fileList: [], categoryId: cat.id, uploaderId: up.id, status: 'APPROVED', resolution: '1080p', language: 'VFQ', seeders: 3, ...extra } });
  const pos = (torrentId, positionSeconds, durationSeconds, minutesAgo, userId = me.id) => p.playbackPosition.create({ data: { torrentId, userId, positionSeconds, durationSeconds, updatedAt: new Date(Date.now() - minutesAgo * 60_000) } });

  // série A : épisode 1 terminé, l'épisode 2 existe en deux qualités (la 1080p doit être préférée) ; l'épisode 4 existe mais n'est pas le suivant
  const aTitle = 'Serie' + tag;
  const a1 = await mkT(`${aTitle}.S01E01.VFQ.1080p-GRP`, { metaSource: 'tmdb', metaExternalId: 'A' + tag, season: '01', episode: '01' });
  const a2hd = await mkT(`${aTitle}.S01E02.VFQ.1080p-GRP`, { metaSource: 'tmdb', metaExternalId: 'A' + tag, season: '01', episode: '02' });
  await mkT(`${aTitle}.S01E02.VFQ.720p-GRP`, { metaSource: 'tmdb', metaExternalId: 'A' + tag, season: '01', episode: '02', resolution: '720p', seeders: 50 });
  await mkT(`${aTitle}.S01E04.VFQ.1080p-GRP`, { metaSource: 'tmdb', metaExternalId: 'A' + tag, season: '01', episode: '04' });
  await pos(a1.id, 2580, 2600, 5);
  // série B : épisode 3 à moitié vu, et l'épisode 2 vu avant : une seule ligne pour la série
  const bTitle = 'Autre' + tag;
  const b2 = await mkT(`${bTitle}.S02E02.VFQ.1080p-GRP`, { metaSource: 'tmdb', metaExternalId: 'B' + tag, season: '02', episode: '02' });
  const b3 = await mkT(`${bTitle}.S02E03.VFQ.1080p-GRP`, { metaSource: 'tmdb', metaExternalId: 'B' + tag, season: '02', episode: '03' });
  await pos(b2.id, 2590, 2600, 600); await pos(b3.id, 1300, 2600, 20);
  // film à reprendre ; film à peine commencé ; film terminé ; torrent adulte en cours ; fin de saison (saison suivante)
  const film = await mkT('Film.Reprendre.' + tag + '.2024.1080p-GRP'); await pos(film.id, 900, 6000, 1);
  const barely = await mkT('Film.Peine.' + tag + '.2024.1080p-GRP'); await pos(barely.id, 60, 6000, 2);
  const done = await mkT('Film.Fini.' + tag + '.2024.1080p-GRP'); await pos(done.id, 5990, 6000, 3);
  const adultT = await p.torrent.create({ data: { infoHash: (tag + 'xx').padEnd(40, 'd'), name: 'Adulte.' + tag, filePath: '/x', size: 1n, fileList: [], categoryId: adult.id, uploaderId: up.id, status: 'APPROVED' } });
  await pos(adultT.id, 900, 6000, 1);
  const cTitle = 'Fin' + tag;
  const c9 = await mkT(`${cTitle}.S01E09.VFQ.1080p-GRP`, { metaSource: 'tmdb', metaExternalId: 'C' + tag, season: '1', episode: '9' });
  const c2s1 = await mkT(`${cTitle}.S02E01.VFQ.1080p-GRP`, { metaSource: 'tmdb', metaExternalId: 'C' + tag, season: '2', episode: '1' });
  await pos(c9.id, 2590, 2600, 7);
  await pos(film.id, 10, 6000, 1, other.id);

  const r = await call('GET', '/stream/continue', TM);
  check('route accessible au membre', r.s === 200 && Array.isArray(r.b?.resume) && Array.isArray(r.b?.next), r.raw.slice(0, 120));
  const resume = r.b.resume, next = r.b.next;
  check('à reprendre : le film et l\'épisode 3 de la série B, du plus récent au plus ancien', resume.map((x) => x.torrentId).join() === [film.id, b3.id].join(), JSON.stringify(resume.map((x) => x.name)));
  check('une seule ligne par série (l\'épisode 2 déjà fini n\'est pas listé)', !resume.some((x) => x.torrentId === b2.id));
  check('la progression est calculée', resume[0].percent === 15 && resume[1].percent === 50 && resume[1].season === 2 && resume[1].episode === 3 && resume[1].title === bTitle, JSON.stringify(resume.map((x) => [x.percent, x.title])));
  check('à peine commencé, terminé et adulte : absents', !resume.some((x) => [barely.id, done.id, adultT.id].includes(x.torrentId)));
  const nextA = next.find((x) => x.torrentId === a2hd.id), nextC = next.find((x) => x.torrentId === c2s1.id);
  check('épisode suivant : S01E02 de la série A, en 1080p comme l\'épisode vu', !!nextA && nextA.season === 1 && nextA.episode === 2 && nextA.title === aTitle, JSON.stringify(next.map((x) => x.name)));
  check('fin de saison : propose le premier épisode de la saison suivante', !!nextC && nextC.season === 2 && nextC.episode === 1);
  check('pas de suggestion pour une série en cours de visionnement', !next.some((x) => x.torrentId === b3.id));
  const o = await call('GET', '/stream/continue', TO);
  check('un autre membre ne voit que ses propres positions', o.b.resume.length === 0 && o.b.next.length === 0, o.raw.slice(0, 100));
  check('sans connexion : refusé', (await call('GET', '/stream/continue')).s === 401);

  check('retirer un titre de la liste', (await call('DELETE', `/stream/continue/${film.id}`, TM)).s === 200 && !(await call('GET', '/stream/continue', TM)).b.resume.some((x) => x.torrentId === film.id));
  check('retirer ne touche pas la position d\'un autre membre', (await p.playbackPosition.count({ where: { torrentId: film.id, userId: other.id } })) === 1);
  // regarder l'épisode suivant le fait quitter la liste « suivant » et entrer dans « reprendre »
  await pos(a2hd.id, 900, 2600, 0);
  const r2 = await call('GET', '/stream/continue', TM);
  check('épisode suivant commencé : il passe dans « à reprendre »', r2.b.resume.some((x) => x.torrentId === a2hd.id) && !r2.b.next.some((x) => x.torrentId === a2hd.id));

  // ---- nettoyage
  await p.torrent.deleteMany({ where: { uploaderId: up.id } });
  await p.category.delete({ where: { id: adult.id } });
  await p.user.deleteMany({ where: { id: { in: [me.id, other.id, up.id] } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
