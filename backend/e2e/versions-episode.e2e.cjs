// Test de bout en bout : le panneau « Versions » d'un torrent de série ne montre que les releases du MÊME épisode (même sans numéro de saison dans le nom), jamais les autres épisodes. Voir README.md.
const crypto = require('crypto');
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const bcrypt = require(B + 'bcrypt');
const BASE = E2E.BASE;
const tok = (u) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, E2E.SECRET, { expiresIn: '1h' });
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
async function get(p, token) { const r = await fetch(BASE + p, { headers: { Authorization: 'Bearer ' + token } }); return { s: r.status, b: await r.json().catch(() => null) }; }

(async () => {
  const p = new PrismaClient();
  const admin = await E2E.getAdmin(p, bcrypt);
  const tag = 've' + Date.now().toString(36).slice(-5);
  const cat = (await p.category.findFirst({ where: { adult: false, parentId: null } })) ?? (await p.category.create({ data: { name: 'Test ' + tag, slug: 'test-' + tag } }));
  const ids = [];
  try {
    const mk = async (name, season, episode) => {
      const t = await p.torrent.create({ data: { infoHash: crypto.randomBytes(20).toString('hex'), name: `${name}.${tag}`, filePath: '/x', size: 500_000_000n, fileList: [], categoryId: cat.id, uploaderId: admin.id, status: 'APPROVED', metaSource: 'tmdb', metaExternalId: 've' + tag, season, episode } });
      ids.push(t.id); return t;
    };
    const e4a = await mk('Serie.E04.1080p.WEB-A', null, 'E04'); // sans saison dans le nom
    const e4b = await mk('Serie.S01E04.1080p.WEB-B', 'S01', 'E04');
    const e4c = await mk('Serie.S01E04.720p.WEB-C', '1', '4');
    const e3 = await mk('Serie.S01E03.1080p.WEB', 'S01', 'E03');
    const e6 = await mk('Serie.S01E06.1080p.WEB', 'S01', 'E06');
    const s6e4 = await mk('Serie.S06E04.1080p.WEB', 'S06', 'E04');
    const pack = await mk('Serie.S01.COMPLETE.1080p', 'S01', null);
    const T = tok(admin);
    const names = (r) => r.b.map((x) => x.id).sort();

    const v1 = await get(`/torrents/${e4a.id}/versions`, T);
    check('E04 sans saison : seulement les releases de l\'épisode 4 de la saison 1, ni E03 ni E06 ni S06E04 ni la saison complète', v1.s === 200 && JSON.stringify(names(v1)) === JSON.stringify([e4a.id, e4b.id, e4c.id].sort()), v1.b?.map((x) => x.name).join(' | '));
    const v2 = await get(`/torrents/${e4b.id}/versions`, T);
    check('S01E04 : les versions de S01E04 seulement (pas S06E04, pas les autres épisodes)', JSON.stringify(names(v2)) === JSON.stringify([e4a.id, e4b.id, e4c.id].sort()), v2.b?.map((x) => x.name).join(' | '));
    const v3 = await get(`/torrents/${e3.id}/versions`, T);
    check('S01E03 seul : aucune autre version (le panneau reste caché)', v3.b.length === 1);
    const v4 = await get(`/torrents/${pack.id}/versions`, T);
    check('saison complète : seulement elle-même', v4.b.length === 1, v4.b?.map((x) => x.name).join(' | '));
    check('la release affichée est marquée « current »', v2.b.find((x) => x.id === e4b.id)?.current === true);
    void e6; void s6e4;
  } finally {
    await p.torrent.deleteMany({ where: { id: { in: ids } } });
    await p.$disconnect();
  }
  console.log(fails ? `\n${fails} échec(s)` : '\nTout est OK');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
