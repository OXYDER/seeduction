// Test de bout en bout : notifications push (clé publique, abonnement, validation, appareils, limites). L'envoi réel vers les services des navigateurs n'est pas testé ici. Voir README.md.
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
const P256 = 'B' + 'A'.repeat(64) + '-_' + 'x'.repeat(21);
const AUTH = 'a'.repeat(22);
const sub = (n, host = 'fcm.googleapis.com') => ({ endpoint: `https://${host}/fcm/send/${n}`, keys: { p256dh: P256, auth: AUTH } });

(async () => {
  const p = new PrismaClient();
  const tag = 'ps' + Date.now().toString(36).slice(-5);
  const hash = await bcrypt.hash('Mot-de-passe-test-1', 4);
  await E2E.getAdmin(p, bcrypt);
  const mk = (n) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: new Date(Date.now() - 60 * 86400_000) } });
  const a = await mk('a'), b = await mk('b');
  const [TA, TB] = [tok(a), tok(b)];

  const k1 = await call('GET', '/push/key', TA), k2 = await call('GET', '/push/key', TB);
  check('clé publique du serveur (VAPID), la même pour tous et stable', k1.s === 200 && /^[A-Za-z0-9_-]{80,100}$/.test(k1.b.publicKey) && k1.b.publicKey === k2.b.publicKey, k1.raw.slice(0, 60));
  check('sans connexion : refusé', (await call('GET', '/push/key')).s === 401 && (await call('POST', '/push/subscribe', null, sub('x'))).s === 401);
  const stored = await p.siteSetting.findUnique({ where: { key: 'pushVapid' } });
  check('la clé privée est rangée chiffrée (jamais en clair)', !!stored && stored.value.publicKey === k1.b.publicKey && typeof stored.value.privateSealed === 'string' && !JSON.stringify(stored.value).includes('"privateKey"'));
  check('aucun appareil au départ', (await call('GET', '/push/status', TA)).b.devices.length === 0);

  for (const [label, body] of [
    ['adresse en http', { ...sub('1'), endpoint: 'http://fcm.googleapis.com/fcm/send/1' }],
    ['adresse d\'un autre site', sub('2', 'evil.example.com')],
    ['adresse du réseau interne', { ...sub('3'), endpoint: 'https://127.0.0.1/fcm/send/3' }],
    ['adresse piégée (domaine qui ressemble)', sub('4', 'fcm.googleapis.com.evil.com')],
    ['clés manquantes', { endpoint: sub('5').endpoint }],
    ['clé trop courte', { endpoint: sub('6').endpoint, keys: { p256dh: 'abc', auth: AUTH } }],
    ['rien du tout', {}],
  ]) check('abonnement refusé : ' + label, (await call('POST', '/push/subscribe', TA, body)).s === 400);

  const ok = await call('POST', '/push/subscribe', TA, { ...sub('device-1'), userAgent: 'Mozilla/5.0 (test)\nX' });
  check('abonnement valide accepté (Google)', ok.s === 201 && ok.b.devices.length === 1 && ok.b.devices[0].userAgent === 'Mozilla/5.0 (test) X', ok.raw.slice(0, 140));
  check('Firefox et Apple acceptés', (await call('POST', '/push/subscribe', TA, sub('d2', 'updates.push.services.mozilla.com'))).s === 201 && (await call('POST', '/push/subscribe', TA, sub('d3', 'web.push.apple.com'))).s === 201);
  check('le même appareil deux fois : une seule ligne', (await call('POST', '/push/subscribe', TA, sub('device-1'))).b.devices.length === 3);
  const taken = await call('POST', '/push/subscribe', TB, sub('device-1'));
  check('un appareil qui change de compte passe au nouveau propriétaire', taken.s === 201 && taken.b.devices.length === 1 && (await call('GET', '/push/status', TA)).b.devices.length === 2);
  await call('POST', '/push/subscribe', TA, sub('d4')); await call('POST', '/push/subscribe', TA, sub('d5')); await call('POST', '/push/subscribe', TA, sub('d6'));
  const over = await call('POST', '/push/subscribe', TA, sub('d7'));
  check('au plus 5 appareils par profil', over.s === 400 && /5 appareils/.test(over.raw) && (await call('GET', '/push/status', TA)).b.devices.length === 5, over.raw.slice(0, 100));
  const devs = (await call('GET', '/push/status', TA)).b.devices;
  check('un autre membre ne peut pas retirer cet appareil', (await call('DELETE', `/push/devices/${devs[0].id}`, TB)).s === 404);
  check('retirer un appareil', (await call('DELETE', `/push/devices/${devs[0].id}`, TA)).b.devices.length === 4);
  check('se désabonner avec l\'adresse de l\'appareil', (await call('POST', '/push/unsubscribe', TA, { endpoint: devs[1].endpoint })).b.devices.length === 3);
  check('on ne peut pas désabonner l\'appareil d\'un autre', (await call('POST', '/push/unsubscribe', TA, { endpoint: sub('device-1').endpoint })).b.devices.length === 3 && (await call('GET', '/push/status', TB)).b.devices.length === 1);

  // essai : sans appareil, rien n'est envoyé (aucun appel réseau) ; limite d'essais
  await p.pushSubscription.deleteMany({ where: { userId: a.id } });
  const t = [];
  for (let i = 0; i < 6; i++) t.push(await call('POST', '/push/test', TA));
  check('essai sans appareil : 0 envoyé ; au-delà de 5 essais par minute : refusé', t.slice(0, 5).every((x) => x.s === 201 && x.b.sent === 0) && t[5].s === 400, t.map((x) => x.s).join());

  // ---- nettoyage
  await p.pushSubscription.deleteMany({ where: { userId: { in: [a.id, b.id] } } });
  await p.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
