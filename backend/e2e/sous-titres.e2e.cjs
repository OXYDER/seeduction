// Test de bout en bout : sous-titres partagés (envoi, validation, encodages, décalage, droits, lecteur Seeduction par passkey). Voir README.md.
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const bcrypt = require(B + 'bcrypt');
const BASE = E2E.BASE;
async function call(method, p, token, body) {
  const r = await fetch(BASE + p, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch {} return { s: r.status, b: j, raw: text, h: r.headers };
}
async function upload(torrentId, token, buf, fields = {}, name = 'sous-titres.srt') {
  const fd = new FormData(); fd.append('file', new Blob([buf]), name); for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  const r = await fetch(BASE + `/subtitles/torrent/${torrentId}`, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
  const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch {} return { s: r.status, b: j, raw: text };
}
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
const tok = (u) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, E2E.SECRET, { expiresIn: '1h' });
const SRT = (n = 8, base = 1) => Array.from({ length: n }, (_, i) => `${i + 1}\n00:00:${String(i * 2 + base).padStart(2, '0')},500 --> 00:00:${String(i * 2 + base + 1).padStart(2, '0')},000\nRéplique ${i + 1} : é à ç\n`).join('\n');

(async () => {
  const p = new PrismaClient();
  const tag = 'st' + Date.now().toString(36).slice(-5);
  const hash = await bcrypt.hash('Mot-de-passe-test-1', 4);
  const old = new Date(Date.now() - 30 * 86400_000);
  await E2E.getAdmin(p, bcrypt);
  const mk = (n, role = 'USER') => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: old, role } });
  const alice = await mk('a'), bob = await mk('b'), mod = await mk('m', 'MODERATOR'), up = await mk('u');
  const [TA, TB, TM] = [alice, bob, mod].map(tok);
  const cat = (await p.category.findFirst({ where: { adult: false, parentId: null } })) ?? (await p.category.create({ data: { name: 'Test ' + tag, slug: 'test-' + tag } }));
  const adultCat = await p.category.create({ data: { name: 'Adulte ' + tag, slug: 'adulte-' + tag, adult: true } });
  let n = 0;
  const mkT = (name, fileList, extra = {}) => p.torrent.create({ data: { infoHash: (tag + n++).padEnd(40, 'f'), name, filePath: '/x', size: 1_000_000_000n, fileList, categoryId: cat.id, uploaderId: up.id, status: 'APPROVED', ...extra } });
  const film = await mkT('Film.' + tag + '.2024.1080p-GRP', [{ path: 'Film.mkv', size: 1000 }, { path: 'Film.nfo', size: 10 }]);
  const pack = await mkT('Serie.' + tag + '.S01.1080p-GRP', [{ path: 'S01E01.mkv', size: 1000 }, { path: 'S01E02.mkv', size: 1000 }, { path: 'info.txt', size: 5 }]);
  const pending = await mkT('Attente.' + tag, [{ path: 'a.mkv', size: 1 }], { status: 'PENDING' });
  const adultT = await mkT('Adulte.' + tag, [{ path: 'a.mkv', size: 1 }], { categoryId: adultCat.id });

  // la liste des catégories adultes est gardée 30 s par le serveur : on attend qu'elle connaisse celle du test
  for (let i = 0; i < 40; i++) { if ((await call('GET', `/subtitles/torrent/${adultT.id}`, TA)).s === 403) break; await new Promise((r) => setTimeout(r, 1000)); }

  // ---- envoi et validation
  const latin1 = Buffer.from(SRT(), 'latin1');
  const up1 = await upload(film.id, TA, latin1, { language: 'fr', label: 'Version web' });
  check('envoi d\'un .srt en Windows-1252 : réencodé en UTF-8, 8 répliques', up1.s === 201 && up1.b.cues === 8 && up1.b.language === 'fr' && up1.b.languageName === 'Français' && up1.b.mine === true, up1.raw.slice(0, 160));
  const stored = await p.subtitleFile.findUnique({ where: { id: up1.b.id } });
  check('contenu stocké lisible (é à ç)', /Réplique 1 : é à ç/.test(stored.content) && /^1\n00:00:01,500 --> 00:00:02,000/.test(stored.content));
  const vtt = 'WEBVTT\n\n' + Array.from({ length: 6 }, (_, i) => `00:0${i}.500 --> 00:0${i}.900 align:start\nLigne ${i}`).join('\n\n');
  check('un .vtt est accepté et converti', (await upload(film.id, TB, Buffer.from(vtt), { language: 'en' }, 'x.vtt')).s === 201);
  check('texte quelconque refusé', (await upload(film.id, TA, Buffer.from('bonjour tout le monde'), { language: 'fr' })).s === 400);
  check('fichier binaire refusé', (await upload(film.id, TA, Buffer.from([0x4d, 0x5a, 0, 1, 2, 3]), { language: 'fr' })).s === 400);
  check('fichier trop gros refusé', (await upload(film.id, TA, Buffer.alloc(650 * 1024, 65), { language: 'fr' })).s === 400);
  check('langue obligatoire et connue', (await upload(film.id, TA, latin1, {})).s === 400 && (await upload(film.id, TA, latin1, { language: 'klingon' })).s === 400);
  check('torrent en attente invisible pour un membre', (await upload(pending.id, TA, latin1, { language: 'fr' })).s === 404 && (await call('GET', `/subtitles/torrent/${pending.id}`, TA)).s === 404);
  check('contenu adulte caché tant qu\'il n\'est pas activé', (await call('GET', `/subtitles/torrent/${adultT.id}`, TA)).s === 403);
  check('un pack de plusieurs vidéos exige de choisir le fichier', (await upload(pack.id, TA, latin1, { language: 'fr' })).s === 400);
  check('numéro de fichier inconnu refusé', (await upload(pack.id, TA, latin1, { language: 'fr', fileIndex: 9 })).s === 400);
  const ep2 = await upload(pack.id, TA, latin1, { language: 'fr', fileIndex: 1 });
  check('sous-titres d\'un épisode du pack', ep2.s === 201 && ep2.b.fileIndex === 1);

  // ---- liste, téléchargement, décalage
  const list = await call('GET', `/subtitles/torrent/${film.id}`, TB);
  check('liste : 2 sous-titres, langues proposées, seulement les vidéos du torrent', list.s === 200 && list.b.items.length === 2 && list.b.languages.length > 5 && list.b.files.length === 1 && list.b.files[0].path === 'Film.mkv', list.raw.slice(0, 160));
  check('les droits d\'édition ne sont donnés qu\'à l\'auteur', list.b.items.find((i) => i.id === up1.b.id).canEdit === false && (await call('GET', `/subtitles/torrent/${film.id}`, TA)).b.items.find((i) => i.id === up1.b.id).canEdit === true);
  const dl = await call('GET', `/subtitles/${up1.b.id}/download`, TB);
  check('téléchargement en .srt', dl.s === 200 && /subrip/.test(dl.h.get('content-type')) && /attachment; filename=".*\.fr\.srt"/.test(dl.h.get('content-disposition')) && /00:00:01,500 --> 00:00:02,000/.test(dl.raw), dl.h.get('content-disposition'));
  check('un autre membre ne règle pas la synchronisation', (await call('PUT', `/subtitles/${up1.b.id}`, TB, { offsetMs: 500 })).s === 403 && (await call('DELETE', `/subtitles/${up1.b.id}`, TB)).s === 403);
  const sync = await call('PUT', `/subtitles/${up1.b.id}`, TA, { offsetMs: 2000, label: 'Calé sur la 1080p' });
  check('l\'auteur règle le décalage (+2 s)', sync.s === 200 && sync.b.offsetMs === 2000 && sync.b.label === 'Calé sur la 1080p');
  const dl2 = await call('GET', `/subtitles/${up1.b.id}/download`, TB);
  check('le décalage est appliqué aux temps', /00:00:03,500 --> 00:00:04,000/.test(dl2.raw), dl2.raw.slice(0, 80));
  check('décalage borné à 10 minutes', (await call('PUT', `/subtitles/${up1.b.id}`, TA, { offsetMs: 99_999_999 })).b.offsetMs === 600_000);
  await call('PUT', `/subtitles/${up1.b.id}`, TA, { offsetMs: 2000 });

  // ---- lecteur Seeduction (passkey)
  const players = await call('GET', `/subtitles/player?passkey=${bob.passkey}&torrentId=${pack.id}&fileIndex=1`);
  check('lecteur : sous-titres de l\'épisode joué', players.s === 200 && players.b.length === 1 && players.b[0].iso3 === 'fra' && players.b[0].exact === true, players.raw.slice(0, 140));
  check('lecteur : rien pour l\'autre épisode', (await call('GET', `/subtitles/player?passkey=${bob.passkey}&torrentId=${pack.id}&fileIndex=0`)).b.length === 0);
  const playFilm = await call('GET', `/subtitles/player?passkey=${bob.passkey}&torrentId=${film.id}&fileIndex=0`);
  check('lecteur : ceux valables pour tout le torrent', playFilm.b.length === 2 && playFilm.b.every((s) => s.exact === false));
  const text = await call('GET', `/subtitles/${up1.b.id}/play?passkey=${bob.passkey}`);
  check('lecteur : le fichier est servi en texte, avec le décalage', text.s === 200 && /^text\/plain/.test(text.h.get('content-type')) && /00:00:03,500/.test(text.raw) && text.h.get('x-content-type-options') === 'nosniff');
  check('lecteur : passkey invalide refusée', (await call('GET', `/subtitles/player?passkey=nimporte&torrentId=${film.id}&fileIndex=0`)).s === 403 && (await call('GET', `/subtitles/${up1.b.id}/play?passkey=nimporte`)).s === 403);
  check('sans connexion : la fiche est privée', (await call('GET', `/subtitles/torrent/${film.id}`)).s === 401);

  // ---- limites et modération
  for (let i = 0; i < 7; i++) await upload(film.id, TA, Buffer.from(SRT(8, 1 + i)), { language: 'fr' });
  const over = await upload(film.id, TA, latin1, { language: 'fr' });
  check('plafond de 8 sous-titres par langue et par fichier', over.s === 400 && /plusieurs sous-titres/.test(over.raw), over.raw.slice(0, 100));
  check('l\'équipe peut supprimer ceux d\'un membre', (await call('DELETE', `/subtitles/${up1.b.id}`, TM)).s === 200 && (await p.subtitleFile.count({ where: { id: up1.b.id } })) === 0);

  // ---- nettoyage
  await p.torrent.deleteMany({ where: { uploaderId: up.id } });
  await p.category.delete({ where: { id: adultCat.id } });
  await p.user.deleteMany({ where: { id: { in: [alice.id, bob.id, mod.id, up.id] } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
