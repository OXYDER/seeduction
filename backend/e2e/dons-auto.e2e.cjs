// Test de bout en bout : dons automatiques (Ko-fi et Buy Me a Coffee). Voir README.md.
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const bcrypt = require(B + 'bcrypt');
const { createHmac } = require('crypto');
const BASE = E2E.BASE;
async function call(method, p, token, body) {
  const r = await fetch(BASE + p, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch {} return { s: r.status, b: j, raw: text };
}
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
const tok = (u) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, E2E.SECRET, { expiresIn: '1h' });

(async () => {
  const p = new PrismaClient();
  const tag = 'dn' + Date.now().toString(36).slice(-4);
  const admin = await E2E.getAdmin(p, bcrypt);
  const hash = await bcrypt.hash('Mot-de-passe-test-1', 4);
  const old = new Date(Date.now() - 30 * 86400_000);
  const mk = (n) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: old, bonusPoints: 100 } });
  const a = await mk('a'), b = await mk('b'), c = await mk('c'), d = await mk('d'), e = await mk('e');
  const TA = tok(admin), TM = tok(a);
  const TOKEN = 'kofi-' + tag, SECRET = 'bmc-' + tag;
  const stateOf = (u) => p.user.findUnique({ where: { id: u.id }, select: { donorSince: true, donorTotal: true, bonusPoints: true } });
  const kofi = (data, token = TOKEN) => fetch(BASE + '/donations/webhook/kofi', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ data: JSON.stringify({ verification_token: token, type: 'Donation', currency: 'CAD', from_name: 'Donateur', email: 'x@test.com', ...data }) }).toString() });
  const bmc = (obj, secret = SECRET, sign = true) => { const raw = JSON.stringify(obj); return fetch(BASE + '/donations/webhook/bmc', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(sign ? { 'X-Signature-Sha256': createHmac('sha256', secret).update(raw).digest('hex') } : {}) }, body: raw }); };

  // ---- réglages
  check('un membre ne peut pas régler les dons automatiques', (await call('PUT', '/donations/admin/webhooks', TM, { kofiToken: 'x' })).s === 403);
  const cfg = await call('PUT', '/donations/admin/webhooks', TA, { kofiToken: TOKEN, bmcSecret: SECRET, auto: true });
  check('réglages enregistrés, secrets jamais renvoyés', cfg.s === 200 && cfg.b.kofi.set && cfg.b.bmc.set && !cfg.raw.includes(TOKEN) && !cfg.raw.includes(SECRET) && /\/api\/donations\/webhook\/kofi$/.test(cfg.b.kofi.url), cfg.raw.slice(0, 160));

  // ---- Ko-fi
  let r = await kofi({ kofi_transaction_id: tag + 'k1', amount: '5.00', message: '@' + a.username }, 'mauvais-jeton');
  check('Ko-fi : jeton invalide refusé', r.status === 401);
  const before = await stateOf(a);
  r = await kofi({ kofi_transaction_id: tag + 'k1', amount: '5.00', message: 'Merci ! @' + a.username });
  check('Ko-fi : don reçu (200)', r.status === 200);
  const after = await stateOf(a);
  check('Ko-fi : le membre reconnu devient donateur et reçoit ses points', !!after.donorSince && after.donorTotal === 5 && after.bonusPoints > before.bonusPoints, JSON.stringify(after));
  await kofi({ kofi_transaction_id: tag + 'k1', amount: '5.00', message: '@' + a.username });
  check('Ko-fi : le même paiement n\'est jamais crédité deux fois', (await stateOf(a)).donorTotal === 5 && (await p.donationEvent.count({ where: { externalId: tag + 'k1' } })) === 1);
  await kofi({ kofi_transaction_id: tag + 'k2', amount: '10', message: 'bonne continuation à toute l\'équipe' });
  const k2 = await p.donationEvent.findFirst({ where: { externalId: tag + 'k2' } });
  check('Ko-fi : sans pseudo, le don attend l\'équipe', k2?.status === 'PENDING' && !k2.userId);
  await kofi({ kofi_transaction_id: tag + 'k3', amount: '5', message: 'merci beaucoup, ' + b.username + ' ici' });
  const k3 = await p.donationEvent.findFirst({ where: { externalId: tag + 'k3' } });
  check('Ko-fi : pseudo noyé dans une phrase = seulement proposé, pas crédité', k3?.status === 'PENDING' && k3.suggestion === b.username && (await stateOf(b)).donorSince === null, JSON.stringify(k3));
  await kofi({ kofi_transaction_id: tag + 'k4', amount: '5', currency: 'USD', message: '@' + c.username });
  const k4 = await p.donationEvent.findFirst({ where: { externalId: tag + 'k4' } });
  check('Ko-fi : autre devise que celle du site = à confirmer par l\'équipe', k4?.status === 'PENDING' && /Devise USD/.test(k4.note) && (await stateOf(c)).donorSince === null);
  await kofi({ kofi_transaction_id: tag + 'k5', type: 'Shop Order', amount: '20', message: '@' + c.username });
  check('Ko-fi : une commande de boutique est ignorée', (await p.donationEvent.findFirst({ where: { externalId: tag + 'k5' } })).status === 'IGNORED');

  // ---- l'équipe attribue
  const list = await call('GET', '/donations/admin/events', TA);
  check('l\'administration voit les dons reçus', list.s === 200 && list.b.items.some((i) => i.externalId === tag + 'k2'));
  check('un membre ne voit pas la liste', (await call('GET', '/donations/admin/events', TM)).s === 403);
  let as = await call('POST', `/donations/admin/events/${k3.id}/assign`, TA, { username: 'pseudo-inexistant-xyz' });
  check('attribution à un pseudo inconnu : refusée, le don reste en attente', as.s >= 400 && (await p.donationEvent.findUnique({ where: { id: k3.id } })).status === 'PENDING', `${as.s}`);
  as = await call('POST', `/donations/admin/events/${k3.id}/assign`, TA, { username: b.username });
  check('attribution au bon pseudo : crédité', as.s === 201 && (await stateOf(b)).donorTotal === 5 && (await p.donationEvent.findUnique({ where: { id: k3.id } })).status === 'CREDITED', as.raw.slice(0, 80));
  as = await call('POST', `/donations/admin/events/${k3.id}/assign`, TA, { username: b.username });
  check('un don déjà traité ne se crédite pas deux fois', as.s === 400 && (await stateOf(b)).donorTotal === 5);
  const ig = await call('POST', `/donations/admin/events/${k2.id}/ignore`, TA, {});
  check('ignorer un don en attente', ig.s === 201 && (await p.donationEvent.findUnique({ where: { id: k2.id } })).status === 'IGNORED');

  // ---- Buy Me a Coffee
  const ev = { type: 'donation.created', data: { id: tag + 'b1', amount: 10, currency: 'CAD', supporter_name: 'Ann', supporter_email: 'ann@t.com', supporter_message: 'pseudo: ' + d.username } };
  r = await bmc(ev, 'mauvais-secret');
  check('Buy Me a Coffee : signature invalide refusée', r.status === 401);
  r = await bmc(ev, SECRET, false);
  check('Buy Me a Coffee : sans signature refusé', r.status === 401);
  r = await bmc(ev);
  check('Buy Me a Coffee : don signé accepté et crédité', r.status === 200 && (await stateOf(d)).donorTotal === 10);
  await bmc(ev);
  check('Buy Me a Coffee : pas de double crédit', (await stateOf(d)).donorTotal === 10);
  await bmc({ type: 'donation.refunded', data: { id: tag + 'b1', amount: 10, currency: 'CAD', refunded: true } });
  check('Buy Me a Coffee : un remboursement est signalé (avantages non retirés)', (await p.donationEvent.findFirst({ where: { externalId: tag + 'b1' } })).status === 'REFUNDED' && (await stateOf(d)).donorTotal === 10);

  // ---- crédit automatique désactivé : tout attend l'équipe
  await call('PUT', '/donations/admin/webhooks', TA, { auto: false });
  await kofi({ kofi_transaction_id: tag + 'k6', amount: '5', message: '@' + e.username });
  check('crédit automatique désactivé : le don attend l\'équipe', (await p.donationEvent.findFirst({ where: { externalId: tag + 'k6' } })).status === 'PENDING' && (await stateOf(e)).donorSince === null);

  // ---- nettoyage
  await call('PUT', '/donations/admin/webhooks', TA, { auto: true, kofiToken: null, bmcSecret: null });
  check('secrets effacés : plus aucun message n\'est accepté', (await kofi({ kofi_transaction_id: tag + 'k7', amount: '5', message: '@' + a.username })).status === 401);
  const ids = [a.id, b.id, c.id, d.id, e.id];
  await p.donationEvent.deleteMany({ where: { externalId: { startsWith: tag } } });
  await p.donation.deleteMany({ where: { userId: { in: ids } } });
  await p.notification.deleteMany({ where: { OR: [{ userId: { in: ids } }, { groupKey: 'donation-auto', createdAt: { gt: new Date(Date.now() - 600_000) } }] } });
  await p.activityLog.deleteMany({ where: { userId: { in: ids } } });
  await p.user.deleteMany({ where: { id: { in: ids } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
