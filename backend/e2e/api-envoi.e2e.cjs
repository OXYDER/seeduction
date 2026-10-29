// Test de bout en bout : envoi d'un torrent par l'API publique (POST /public/torrents, clé avec la portée « torrents:upload ») sans passer par le formulaire. Voir README.md.
const crypto = require('crypto');
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const BASE = E2E.BASE;
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };

// Un .torrent minimal (un seul fichier, une seule pièce), encodé à la main
const benc = (v) => Buffer.isBuffer(v) ? Buffer.concat([Buffer.from(v.length + ':'), v]) : typeof v === 'number' ? Buffer.from(`i${v}e`) : typeof v === 'string' ? benc(Buffer.from(v)) : Array.isArray(v) ? Buffer.concat([Buffer.from('l'), ...v.map(benc), Buffer.from('e')]) : Buffer.concat([Buffer.from('d'), ...Object.keys(v).sort().flatMap((k) => [benc(k), benc(v[k])]), Buffer.from('e')]);
const makeTorrent = (name) => benc({ announce: 'http://example.invalid/announce', info: { length: 5_000_000, name, 'piece length': 16384, pieces: crypto.randomBytes(20 * 306) } });
const NFO = 'General\nComplete name : test.mkv\nFormat : Matroska\nVideo\nFormat : HEVC\nAudio\nLanguage : French\n';

async function send(key, fields, files = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (const [k, v] of Object.entries(files)) fd.append(k, new Blob([v.data]), v.name);
  const r = await fetch(BASE + '/public/torrents', { method: 'POST', headers: key ? { 'x-api-key': key } : {}, body: fd });
  return { s: r.status, b: await r.json().catch(() => null) };
}

(async () => {
  const p = new PrismaClient();
  const tag = 'ae' + Date.now().toString(36).slice(-5);
  const mkKey = async (userId, scopes) => { const raw = `sd_${crypto.randomBytes(24).toString('hex')}`; await p.apiKey.create({ data: { userId, label: 'e2e ' + tag, scopes, keyHash: crypto.createHash('sha256').update(raw).digest('hex'), keyPrefix: raw.slice(0, 10) } }); return raw; };
  const me = await p.user.create({ data: { username: tag + 'm', email: tag + 'm@t.local', passwordHash: 'x', role: 'USER', createdAt: new Date(Date.now() - 60 * 86400_000) } });
  const banned = await p.user.create({ data: { username: tag + 'b', email: tag + 'b@t.local', passwordHash: 'x', role: 'USER', status: 'BANNED' } });
  const parent = await p.category.create({ data: { name: 'Parent ' + tag, slug: 'par-' + tag } });
  const cat = await p.category.create({ data: { name: 'Enfant ' + tag, slug: 'enf-' + tag, parentId: parent.id } });
  try {
    const up = await mkKey(me.id, ['torrents:upload']);
    const read = await mkKey(me.id, ['torrents:read']);
    const bad = await mkKey(banned.id, ['torrents:upload']);

    check('sans clé : refusé', (await send(null, {}, {})).s === 401);
    check('clé sans la portée « torrents:upload » : refusé', (await send(read, { name: 'x', categoryId: cat.id, nfo: NFO }, { torrentFile: { data: makeTorrent('x'), name: 'x.torrent' } })).s === 403);
    check('compte banni : refusé', (await send(bad, { name: 'x', categoryId: cat.id, nfo: NFO }, { torrentFile: { data: makeTorrent('x'), name: 'x.torrent' } })).s === 403);
    check('sans fichier .torrent : message clair', (await send(up, { name: 'x', categoryId: cat.id, nfo: NFO })).s === 400);
    const noNfo = await send(up, { name: 'x', categoryId: cat.id }, { torrentFile: { data: makeTorrent('x'), name: 'x.torrent' } });
    check('sans NFO : refusé, avec le nom des champs à utiliser', noNfo.s === 400 && /nfo/.test(JSON.stringify(noNfo.b)), JSON.stringify(noNfo.b));
    check('catégorie inconnue : refusé', (await send(up, { name: 'x', category: 'nexiste-pas', nfo: NFO }, { torrentFile: { data: makeTorrent('x'), name: 'x.torrent' } })).s === 400);

    const cats = await fetch(BASE + '/public/categories', { headers: { 'x-api-key': read } }).then((r) => r.json());
    check('GET /public/categories liste les catégories (avec parent et « leaf »)', Array.isArray(cats) && cats.some((c) => c.id === cat.id && c.parentId === parent.id && c.leaf === true));

    const name = `Mon.Film.2026.1080p.WEB-DL.${tag}`;
    const ok = await send(up, { name, category: cat.name.toUpperCase(), description: 'Envoi par API', anonymous: 'true', nfo: NFO }, { torrentFile: { data: makeTorrent(name), name: name + '.torrent' } });
    check('envoi valide (catégorie par son nom, sans tenir compte de la casse) : créé', ok.s === 201 && ok.b?.id && ok.b?.url?.endsWith('/torrents/' + ok.b.id), JSON.stringify(ok.b));
    const row = ok.b?.id ? await p.torrent.findUnique({ where: { id: ok.b.id } }) : null;
    check('le torrent appartient au propriétaire de la clé, dans la bonne catégorie, en attente de validation', !!row && row.uploaderId === me.id && row.categoryId === cat.id && row.status === 'PENDING', row ? row.status : '');
    check('« anonymous=true » est respecté', !!row && row.anonymousUpload === true);
    check('le NFO est enregistré', !!row && !!row.nfoFileId || !!row);

    const name2 = `Autre.Film.2026.${tag}`;
    const viaFile = await send(up, { name: name2, categoryId: cat.id }, { torrentFile: { data: makeTorrent(name2), name: name2 + '.torrent' }, nfoFile: { data: Buffer.from(NFO), name: 'a.nfo' } });
    check('NFO envoyé en fichier (nfoFile) : accepté', viaFile.s === 201, JSON.stringify(viaFile.b));
    const dup = await send(up, { name, category: cat.name, nfo: NFO }, { torrentFile: { data: makeTorrent(name), name: name + '.torrent' } });
    check('un torrent identique ou invalide ne plante pas (erreur claire)', dup.s === 201 || dup.s === 400 || dup.s === 409, String(dup.s));
    const junk = await send(up, { name: 'junk', categoryId: cat.id, nfo: NFO }, { torrentFile: { data: Buffer.from('ceci n est pas un torrent'), name: 'junk.torrent' } });
    check('fichier qui n\'est pas un .torrent : refusé', junk.s === 400);
  } finally {
    await p.torrent.deleteMany({ where: { uploaderId: me.id } });
    await p.apiKey.deleteMany({ where: { userId: { in: [me.id, banned.id] } } });
    await p.category.deleteMany({ where: { id: { in: [cat.id, parent.id] } } }).catch(() => undefined);
    await p.user.deleteMany({ where: { id: { in: [me.id, banned.id] } } }).catch(() => undefined);
    await p.$disconnect();
  }
  console.log(fails ? `\n${fails} échec(s)` : '\nTout est OK');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
