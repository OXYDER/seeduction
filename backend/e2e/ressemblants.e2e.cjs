// Test de bout en bout : « Dans la même veine » d'une fiche torrent reste dans l'univers de la fiche (une série ne propose ni film ni contenu adulte,
// même pour un membre qui regarde du contenu adulte). Voir README.md.
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const { randomBytes } = require('crypto');
const BASE = E2E.BASE;
const tok = (u) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, E2E.SECRET, { expiresIn: '1h' });
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
async function get(p, token) {
  const r = await fetch(BASE + p, { headers: { Authorization: 'Bearer ' + token } });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { s: r.status, b: j };
}

(async () => {
  const p = new PrismaClient();
  const tag = 'rc' + Date.now().toString(36).slice(-5);
  const mk = (n, extra = {}) => p.user.create({ data: { username: tag + n, email: `${tag}${n}@t.local`, passwordHash: 'x', role: 'USER', createdAt: new Date(Date.now() - 60 * 86400_000), ...extra } });
  const viewer = await mk('v', { showAdult: true }), uploader = await mk('u');
  const cat = async (slug) => (await p.category.findFirst({ where: { slug }, select: { id: true } }))?.id;
  const [series, films, xxx] = [await cat('series-tv'), await cat('films'), await cat('xxx')];
  const ids = [];
  try {
    check('les catégories Séries TV, Films et XXX existent', !!(series && films && xxx));
    const t = async (name, categoryId, genres = ['Drame']) => {
      const row = await p.torrent.create({ data: { infoHash: randomBytes(20).toString('hex'), name: `${tag}.${name}`, filePath: '/x', size: 1n, fileList: [], categoryId, uploaderId: uploader.id, status: 'APPROVED', genres, seeders: 40, language: 'fr' } });
      ids.push(row.id); return row;
    };
    const base = await t('Serie.Base', series), serie2 = await t('Serie.Voisine', series), film = await t('Film.Drame', films);
    const xa = await t('Adulte.A', xxx), xb = await t('Adulte.B', xxx), xc = await t('Adulte.C', xxx);
    // Le membre regarde beaucoup de contenu adulte (donc un profil de goûts très « adulte »).
    for (const x of [xa, xb]) await p.snatch.create({ data: { torrentId: x.id, userId: viewer.id } });
    const V = tok(viewer);

    const onBase = await get(`/torrents/mine/recommended?basedOn=${base.id}&limit=30`, V);
    const names = (onBase.b ?? []).map((r) => r.name);
    check('la requête sur la fiche réussit', onBase.s === 200 && Array.isArray(onBase.b), String(onBase.s));
    check('la série voisine est proposée', names.some((n) => n.endsWith('Serie.Voisine')), JSON.stringify(names));
    check('aucun contenu adulte sur la fiche d\'une série', !names.some((n) => n.includes('Adulte')), JSON.stringify(names));
    check('aucun film sur la fiche d\'une série', !names.some((n) => n.endsWith('Film.Drame')));

    const onAdult = await get(`/torrents/mine/recommended?basedOn=${xa.id}&limit=30`, V);
    const adultNames = (onAdult.b ?? []).map((r) => r.name);
    check('sur une fiche adulte, on reste dans l\'adulte (pour qui l\'a activé)', adultNames.some((n) => n.endsWith('Adulte.C')) && !adultNames.some((n) => n.endsWith('Serie.Voisine') || n.endsWith('Film.Drame')), JSON.stringify(adultNames));

    const home = await get('/torrents/mine/recommended?limit=30', V);
    check('sans fiche, les offres personnelles restent ouvertes à tout (goûts du membre)', home.s === 200 && Array.isArray(home.b));

    const hiddenViewer = await mk('h', { showAdult: false });
    await p.snatch.create({ data: { torrentId: base.id, userId: hiddenViewer.id } });
    const h = await get(`/torrents/mine/recommended?basedOn=${base.id}&limit=30`, tok(hiddenViewer));
    check('un membre sans contenu adulte n\'en voit jamais non plus', h.s === 200 && !(h.b ?? []).some((r) => r.name.includes('Adulte')));
    await p.snatch.deleteMany({ where: { userId: hiddenViewer.id } });
    await p.user.delete({ where: { id: hiddenViewer.id } }).catch(() => undefined);
  } finally {
    await p.snatch.deleteMany({ where: { userId: viewer.id } });
    await p.torrent.deleteMany({ where: { id: { in: ids } } });
    await p.user.deleteMany({ where: { id: { in: [viewer.id, uploader.id] } } }).catch(() => undefined);
    await p.$disconnect();
  }
  console.log(fails ? `\n${fails} échec(s)` : '\nTout est OK');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
