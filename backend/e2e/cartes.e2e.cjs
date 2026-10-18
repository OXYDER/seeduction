// Test de bout en bout : cartes. Voir README.md.
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const D = E2E.DIST;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const bcrypt = require(B + 'bcrypt');
const cards = require(D + 'common/utils/cards');
const BASE = E2E.BASE;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(method, p, token, body) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(BASE + p, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch {} return { s: r.status, b: j, raw: text };
    } catch (e) { if (i === 2) throw e; await sleep(300); }
  }
}
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
const tok = (u) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, E2E.SECRET, { expiresIn: '1h' });

(async () => {
  const p = new PrismaClient();
  const tag = 'cd' + Date.now().toString(36).slice(-4);
  const hash = await bcrypt.hash('Mot-de-passe-test-1', 4);
  const old = new Date(Date.now() - 30 * 86400_000);
  const mk = (n, extra = {}) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: old, bonusPoints: 100, ...extra } });
  const admin = await E2E.getAdmin(p, bcrypt);
  const A = tok(admin);
  const [u1, u2, u3] = [await mk('a'), await mk('b'), await mk('c')];
  const young = await mk('y', { createdAt: new Date() });
  const out = await mk('o', { gamesOptOut: true });
  const pts = async (x) => (await p.user.findUnique({ where: { id: x.id }, select: { bonusPoints: true } })).bonusPoints;

  const adm = await call('GET', '/games/cards/admin', A);
  const cfg0 = adm.b.config;
  check('réglages par défaut', adm.s === 200 && cfg0.cardsPerPack === 3 && cfg0.pityPacks === 30 && cfg0.albumReward === 1000);

  let ov = await call('GET', '/games/cards', tok(u1));
  check('aperçu : catalogue, portefeuille vide, règles publiques', ov.s === 200 && ov.b.catalog.cards.length === cards.CATALOG.length && ov.b.wallet.packs === 0 && ov.b.wallet.dailyAvailable === true && ov.b.rules.odds.normal.common === 700, JSON.stringify(ov.b.wallet));
  let r = await call('POST', '/games/cards/daily', tok(young));
  check('compte trop récent refusé', r.s === 400 && /au moins/.test(r.b?.message ?? ''));
  r = await call('POST', '/games/cards/daily', tok(out));
  check('membre retiré des jeux refusé', r.s === 400 && /retiré/.test(r.b?.message ?? ''));

  // ---- paquet du jour
  r = await call('POST', '/games/cards/open', tok(u1));
  check('ouvrir sans paquet est refusé', r.s === 400 && /aucun paquet/.test(r.b?.message ?? ''), r.b?.message);
  r = await call('POST', '/games/cards/daily', tok(u1));
  check('paquet du jour réclamé', r.s === 201 && r.b.packs === 1 && r.b.claimed === 1, JSON.stringify(r.b));
  r = await call('POST', '/games/cards/daily', tok(u1));
  check('un seul paquet par jour', r.s === 400 && /déjà réclamé/.test(r.b?.message ?? ''));
  const dbl = await Promise.all([call('POST', '/games/cards/daily', tok(u2)), call('POST', '/games/cards/daily', tok(u2))]);
  check('deux réclamations simultanées : un seul paquet', dbl.filter((x) => x.s === 201).length === 1 && (await p.cardWallet.findUnique({ where: { userId: u2.id } })).packs === 1, dbl.map((x) => x.s).join(','));

  // ---- ouvrir
  const opens = await Promise.all([call('POST', '/games/cards/open', tok(u1)), call('POST', '/games/cards/open', tok(u1))]);
  check('deux ouvertures simultanées avec un seul paquet : une seule passe', opens.filter((x) => x.s === 201).length === 1, opens.map((x) => x.s).join(','));
  const o1 = opens.find((x) => x.s === 201).b;
  check('3 cartes, la dernière au moins rare', o1.cards.length === 3 && cards.cardById(o1.cards[2].id).rarity !== 'common', o1.cards.map((c) => c.id).join(','));
  check('toutes les cartes sont du catalogue', o1.cards.every((c) => !!cards.cardById(c.id)));
  check('portefeuille mis à jour', o1.packs === 0 && (await p.cardWallet.findUnique({ where: { userId: u1.id } })).opened === 1);
  const rows = await p.userCard.findMany({ where: { userId: u1.id } });
  check('cartes enregistrées avec leur nombre d\'exemplaires', rows.reduce((s, x) => s + x.count, 0) === 3 && o1.cards.every((c) => rows.some((x) => x.cardId === c.id)));
  check('premières cartes : toutes nouvelles sauf doublon dans le même paquet', o1.cards.filter((c) => c.new).length === new Set(o1.cards.map((c) => c.id)).size);
  check('historique enregistré', (await p.cardOpening.count({ where: { userId: u1.id } })) === 1);

  // ---- éclats des doublons : on en ouvre beaucoup
  await p.cardWallet.update({ where: { userId: u1.id }, data: { packs: 40 } });
  let expectedShards = o1.shards, dupes = 0, packs = 0;
  for (let i = 0; i < 40; i++) { const x = await call('POST', '/games/cards/open', tok(u1)); if (x.s !== 201) { check('ouverture', false, x.raw.slice(0, 100)); break; } packs++; expectedShards += x.b.shards; dupes += x.b.cards.filter((c) => !c.new).length; }
  const w1 = await p.cardWallet.findUnique({ where: { userId: u1.id } });
  check('40 paquets ouverts', packs === 40 && w1.packs === 0 && w1.opened === 41);
  check('éclats = somme des doublons', w1.shards === expectedShards && dupes > 0, `éclats=${w1.shards} attendu=${expectedShards} doublons=${dupes}`);
  const all1 = await p.userCard.findMany({ where: { userId: u1.id } });
  check('exemplaires comptés (123 cartes tirées au total)', all1.reduce((s, x) => s + x.count, 0) === 123, String(all1.reduce((s, x) => s + x.count, 0)));
  check('une légendaire au plus tard au 30e paquet', all1.some((x) => cards.cardById(x.cardId).rarity === 'legendary'));

  // ---- garantie légendaire
  await p.cardWallet.update({ where: { userId: u2.id }, data: { packs: 2, pity: 29 } });
  r = await call('POST', '/games/cards/open', tok(u2));
  check('garantie : la dernière carte est légendaire et le compteur repart à zéro', r.s === 201 && cards.cardById(r.b.cards[2].id).rarity === 'legendary' && r.b.pity === 0, JSON.stringify(r.b.pity));

  // ---- fabrication
  r = await call('POST', '/games/cards/craft', tok(u3), { cardId: 'cinema-clap' });
  check('fabrication sans éclats refusée', r.s === 400 && /éclats/.test(r.b?.message ?? ''), r.b?.message);
  r = await call('POST', '/games/cards/craft', tok(u3), { cardId: 'nimporte-quoi' });
  check('carte inconnue refusée', r.s === 400);
  await p.cardWallet.upsert({ where: { userId: u3.id }, create: { userId: u3.id, shards: 30 }, update: { shards: 30 } });
  const cr = await Promise.all([call('POST', '/games/cards/craft', tok(u3), { cardId: 'cinema-clap' }), call('POST', '/games/cards/craft', tok(u3), { cardId: 'cinema-clap' })]);
  check('fabrication : une seule des deux requêtes simultanées passe', cr.filter((x) => x.s === 201).length === 1, cr.map((x) => x.s).join(','));
  check('éclats débités du coût exact (25)', (await p.cardWallet.findUnique({ where: { userId: u3.id } })).shards === 5);
  r = await call('POST', '/games/cards/craft', tok(u3), { cardId: 'cinema-clap' });
  check('carte déjà possédée refusée', r.s === 400 && /déjà/.test(r.b?.message ?? ''));

  // ---- série complétée : tout l'album sauf une carte, puis fabrication de la dernière
  const u4 = await mk('d');
  const target = 'seeduction-roi';
  await p.userCard.createMany({ data: cards.CATALOG.filter((c) => c.id !== target).map((c) => ({ userId: u4.id, cardId: c.id, count: 1 })) });
  await p.cardWallet.create({ data: { userId: u4.id, shards: 500, packs: 1 } });
  const b4 = await pts(u4);
  r = await call('POST', '/games/cards/craft', tok(u4), { cardId: target });
  const sum = cfg0.setRewards.hockey + cfg0.setRewards.cinema + cfg0.setRewards.musique + cfg0.setRewards.seeduction + cfg0.albumReward;
  check('dernière carte fabriquée : toutes les séries et l\'album récompensés', r.s === 201 && r.b.sets.length === 5 && (await pts(u4)) - b4 === sum, `sets=${r.b?.sets?.length} delta=${(await pts(u4)) - b4} attendu=${sum}`);
  check('récompenses enregistrées une seule fois par série', (await p.cardSetReward.count({ where: { userId: u4.id } })) === 5);
  const b4b = await pts(u4);
  r = await call('POST', '/games/cards/open', tok(u4));
  check('ouvrir un paquet ensuite ne repaie rien', r.s === 201 && r.b.sets.length === 0 && (await pts(u4)) === b4b && r.b.cards.every((c) => !c.new), JSON.stringify(r.b?.sets));
  const notes = await p.notification.count({ where: { userId: u4.id, category: 'games', title: { contains: 'Série complétée' } } });
  check('notifications de série complétée', notes >= 1, 'n=' + notes);

  // ---- aperçu et classement
  ov = await call('GET', '/games/cards', tok(u4));
  check('aperçu : album complet', ov.b.distinct === cards.CATALOG.length && ov.b.catalog.album.claimed === true && ov.b.catalog.sets.every((s) => s.claimed));
  check('collectionneurs classés', ov.b.collectors.length >= 1 && ov.b.collectors[0].cards >= ov.b.collectors[ov.b.collectors.length - 1].cards);
  check('probabilités publiques, mais pas de réglage interne', ov.b.rules.pityPacks === 30 && ov.b.rules.odds.last.common === 0);
  const hub = await call('GET', '/games/summary', tok(u1));
  check('résumé de la page Jeux', hub.s === 200 && hub.b.cards.owned === all1.length && hub.b.cards.total === cards.CATALOG.length, JSON.stringify(hub.b.cards));

  // ---- administration
  const adm2 = await call('GET', '/games/cards/admin', A);
  check('administration : statistiques', adm2.s === 200 && adm2.b.stats.packsOpened >= 42 && adm2.b.stats.pointsPaid >= sum && adm2.b.stats.byRarity.legendary >= 1, JSON.stringify(adm2.b.stats).slice(0, 200));
  check('administration refusée aux membres', (await call('GET', '/games/cards/admin', tok(u1))).s === 403);
  const sv = await call('PUT', '/games/cards/admin', A, { ...cfg0, cardsPerPack: 4 });
  check('réglage du nombre de cartes par paquet', sv.s === 200 && sv.b.config.cardsPerPack === 4);
  await p.cardWallet.update({ where: { userId: u2.id }, data: { packs: 1 } });
  r = await call('POST', '/games/cards/open', tok(u2));
  check('le nouveau réglage s\'applique (4 cartes)', r.s === 201 && r.b.cards.length === 4);
  await call('PUT', '/games/cards/admin', A, cfg0);

  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTOUT PASSE');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
