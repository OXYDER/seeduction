// Test de bout en bout : un hit & run régularisé en reprenant le seed est clos (plus d'avertissement, plus visible dans les sections Hit & run) ; il ne reste que l'historique des téléchargements, lisible (dates, obligation de seed, volumes). Voir README.md.
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
  const tag = 'hh' + Date.now().toString(36).slice(-5);
  const old = new Date(Date.now() - 60 * 86400_000);
  const member = await p.user.create({ data: { username: tag + 'm', email: tag + 'm@t.local', passwordHash: 'x', role: 'USER', createdAt: old } });
  const other = await p.user.create({ data: { username: tag + 'o', email: tag + 'o@t.local', passwordHash: 'x', role: 'USER', createdAt: old } });
  const cat = (await p.category.findFirst({ where: { adult: false, parentId: null } })) ?? (await p.category.create({ data: { name: 'Test ' + tag, slug: 'test-' + tag } }));
  const torrents = [];
  try {
    const t = await p.torrent.create({ data: { infoHash: crypto.randomBytes(20).toString('hex'), name: `Film.Historique.${tag}`, filePath: '/x', size: 2_000_000_000n, fileList: [], categoryId: cat.id, uploaderId: other.id, status: 'APPROVED' } });
    torrents.push(t);
    const started = new Date(Date.now() - 4 * 86400_000);
    const snatch = await p.snatch.create({ data: { userId: member.id, torrentId: t.id, startedAt: started, completedAt: new Date(Date.now() - 3 * 86400_000), seedSeconds: 72 * 3600 - 600, lastSeedAt: new Date(Date.now() - 30 * 60_000), hnr: true, satisfied: false } });
    await p.warning.create({ data: { userId: member.id, issuedBy: 'Système', reason: `Hit & run : « ${t.name} » abandonné après 60 h de seed (minimum 72 h)` } });
    await p.warning.create({ data: { userId: member.id, issuedBy: 'Un modérateur', reason: `Hit & run : « ${t.name} » (avertissement de l'équipe)` } });
    const day = new Date(started); day.setUTCHours(0, 0, 0, 0);
    await p.userTorrentFlow.create({ data: { userId: member.id, torrentId: t.id, day, up: 3_500_000_000n, down: 2_000_000_000n, got: 2_000_000_000n, announces: 5 } });
    const TA = tok(admin), TM = tok(member);

    check('avant : le cas est ouvert (page du membre, fiche de l\'équipe)', (await get('/bonus/hnr', TM)).b.items.length === 1 && (await get(`/admin/users/${member.id}/inspect/hnr`, TA)).b.items.length === 1);

    // Le membre seede : l'annonce fait passer le temps à 72 h
    const enc = [...Buffer.from(t.infoHash, 'hex')].map((b) => '%' + b.toString(16).padStart(2, '0')).join('');
    const url = `${BASE.replace(/\/api$/, '')}/tracker/${member.passkey}/announce?info_hash=${enc}&peer_id=${encodeURIComponent('-qB4650-' + tag.padEnd(12, '0').slice(0, 12))}&port=51413&uploaded=0&downloaded=0&left=0&compact=1&numwant=5`;
    const r = await fetch(url, { headers: { 'X-Forwarded-For': '203.0.113.88' } });
    check('l\'annonce de seed est acceptée', r.status === 200);
    await new Promise((res) => setTimeout(res, 500));
    const s2 = await p.snatch.findUnique({ where: { id: snatch.id } });
    check('72 h atteintes : obligation remplie, hit & run clos avec sa date, historique conservé', s2.satisfied === true && s2.hnr === true && !!s2.hnrResolvedAt);
    const w = await p.warning.findMany({ where: { userId: member.id } });
    check('l\'avertissement automatique est retiré (celui de l\'équipe reste)', w.length === 1 && w[0].issuedBy === 'Un modérateur', w.map((x) => x.issuedBy).join(','));

    check('page Hit & run du membre : plus rien', (await get('/bonus/hnr', TM)).b.items.length === 0);
    const act = (await get('/bonus/activity', TM)).b.completed.find((c) => c.torrentId === t.id);
    check('« Mon activité » : obligation atteinte, hit & run régularisé (clos), volumes et dates', act && act.satisfied && act.hnr === false && act.hnrResolved === true && act.receivedBytes === 2_000_000_000 && act.sentBytes === 3_500_000_000 && !!act.startedAt, JSON.stringify(act).slice(0, 160));
    const seeds = (await get('/bonus/my-seeds', TM)).b;
    check('« Mes seeds » : le cas n\'est plus compté', seeds.counts.hnr === 0 && seeds.counts.repairing === 0);

    const ov = (await get(`/admin/users/${member.id}/inspect`, TA)).b;
    check('fiche de l\'équipe : onglet Hit & run vide et compteur à 0', ov.counts.hnr === 0 && (await get(`/admin/users/${member.id}/inspect/hnr`, TA)).b.items.length === 0);
    const dl = (await get(`/admin/users/${member.id}/inspect/downloads`, TA)).b.items.find((i) => i.primary === t.name);
    const fact = (label) => dl?.facts?.find((f) => f.label === label)?.value ?? '';
    check('liste des téléchargements : dates d\'ajout et de fin', /\d{4}/.test(fact('Ajouté le')) && /\d{4}/.test(fact('Complété le')), `${fact('Ajouté le')} / ${fact('Complété le')}`);
    check('…obligation de seed atteinte (72 h sur 72 h demandées)', /Atteinte/.test(fact('Obligation de seed')) && /72 h/.test(fact('Obligation de seed')), fact('Obligation de seed'));
    check('…hit & run signalé comme régularisé (historique), sans tache', /régularisé/i.test(fact('Hit & run')) && dl.tags.some((x) => /régularisé \(historique\)/.test(x)));
    check('…volumes reçus et envoyés', /2[,.]00 Go/.test(fact('Données reçues (download)')) && /3[,.]50 Go/.test(fact('Données envoyées (upload)')), `${fact('Données reçues (download)')} / ${fact('Données envoyées (upload)')}`);
  } finally {
    await p.torrent.deleteMany({ where: { id: { in: torrents.map((t) => t.id) } } });
    await p.warning.deleteMany({ where: { userId: member.id } });
    await p.user.deleteMany({ where: { id: { in: [member.id, other.id] } } }).catch(() => undefined);
    await p.$disconnect();
  }
  console.log(fails ? `\n${fails} échec(s)` : '\nTout est OK');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
