// Test de bout en bout : inscriptions ouvertes sans code d'invitation (Admin > Invitations) et leurs limites. Voir README.md.
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const bcrypt = require(B + 'bcrypt');
const BASE = E2E.BASE;
const tok = (u) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, E2E.SECRET, { expiresIn: '1h' });
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
async function call(method, p, token, body) {
  const r = await fetch(BASE + p, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { s: r.status, b: j };
}

(async () => {
  const p = new PrismaClient();
  const tag = 'io' + Date.now().toString(36).slice(-5);
  const admin = await E2E.getAdmin(p, bcrypt);
  const member = await p.user.create({ data: { username: tag + 'm', email: tag + 'm@t.local', passwordHash: 'x', role: 'USER', createdAt: new Date(Date.now() - 30 * 86400_000) } });
  const TA = tok(admin), TM = tok(member);
  const prev = await p.siteSetting.findUnique({ where: { key: 'openRegistration' } });
  const reg = (n, extra = {}) => call('POST', '/auth/register', null, { inviteCode: '', username: tag + n, email: `${tag}${n}@t.local`, password: 'Mot-de-passe-test-9!x', ...extra });
  const created = [];
  try {
    await call('PUT', '/auth/open-registration', TA, { enabled: false });
    const closed = await reg('a');
    check('fermé par défaut : sans code, l\'inscription est refusée', closed.s === 400 && /invitation/i.test(JSON.stringify(closed.b)), JSON.stringify(closed.b));
    check('la page d\'inscription sait que c\'est fermé', (await call('GET', '/auth/features')).b?.openRegistration === false);
    check('un membre ordinaire ne peut pas régler cette option', (await call('GET', '/auth/open-registration', TM)).s === 403 && (await call('PUT', '/auth/open-registration', TM, { enabled: true })).s === 403);
    check('sans session non plus', (await call('GET', '/auth/open-registration', null)).s === 401);

    const on = await call('PUT', '/auth/open-registration', TA, { enabled: true, perIpPerDay: 2, maxPerDay: 3 });
    check('l\'administrateur ouvre les inscriptions, avec des limites', on.s === 200 && on.b.enabled === true && on.b.perIpPerDay === 2 && on.b.maxPerDay === 3 && typeof on.b.emailConfirmation === 'boolean', JSON.stringify(on.b));
    check('la page d\'inscription sait que c\'est ouvert', (await call('GET', '/auth/features')).b?.openRegistration === true);
    check('l\'ouverture est inscrite au journal', !!(await p.activityLog.findFirst({ where: { action: 'OPEN_REGISTRATION_SET', userId: admin.id, createdAt: { gt: new Date(Date.now() - 60_000) } } })));

    const a = await reg('a');
    created.push(tag + 'a');
    check('ouvert : on s\'inscrit sans code', a.s === 201 && (a.b?.passkey || a.b?.pendingVerification), JSON.stringify(a.b));
    const row = await p.user.findFirst({ where: { username: tag + 'a' } });
    check('le compte n\'a pas d\'invitant et reçoit le cadeau de bienvenue', !!row && row.invitedById === null && row.uploaded > 0n);
    check('l\'inscription libre est journalisée (limites)', (await p.activityLog.count({ where: { action: 'SIGNUP_OPEN', userId: row?.id } })) === 1);

    const bad = await reg('b', { inviteCode: 'CODE-QUI-NEXISTE-PAS' });
    check('un code saisi mais faux reste refusé, même quand c\'est ouvert', bad.s === 400 && /invitation/i.test(JSON.stringify(bad.b)), JSON.stringify(bad.b));
    const dupe = await reg('a');
    check('un pseudo déjà pris est refusé', dupe.s === 400);

    const b = await reg('c');
    created.push(tag + 'c');
    check('deuxième inscription depuis la même connexion : acceptée', b.s === 201);
    const c = await reg('d');
    check('troisième depuis la même connexion : limite par IP', c.s === 400 && /connexion/i.test(JSON.stringify(c.b)), JSON.stringify(c.b));

    // Limite totale : on lève la limite par IP, le plafond total (3) s'applique.
    await call('PUT', '/auth/open-registration', TA, { perIpPerDay: 0, maxPerDay: 2 });
    const full = await reg('e');
    check('plafond du jour atteint : refusé avec un message clair', full.s === 400 && /complètes|jour/i.test(JSON.stringify(full.b)), JSON.stringify(full.b));
    await call('PUT', '/auth/open-registration', TA, { maxPerDay: 0 });
    const free = await reg('f');
    created.push(tag + 'f');
    check('sans limite (0) : accepté', free.s === 201, JSON.stringify(free.b));
    const info = await call('GET', '/auth/open-registration', TA);
    check('le tableau d\'administration compte les inscriptions libres du jour', info.b?.today >= 3, JSON.stringify(info.b));

    await call('PUT', '/auth/open-registration', TA, { enabled: false });
    const closedAgain = await reg('g');
    check('refermé : de nouveau sur invitation seulement', closedAgain.s === 400);
  } finally {
    const users = await p.user.findMany({ where: { username: { startsWith: tag } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await p.notification.deleteMany({ where: { userId: { in: ids } } });
    await p.activityLog.deleteMany({ where: { OR: [{ userId: { in: ids } }, { action: 'OPEN_REGISTRATION_SET', userId: admin.id, createdAt: { gt: new Date(Date.now() - 600_000) } }] } });
    await p.emailChallenge?.deleteMany?.({ where: { userId: { in: ids } } }).catch?.(() => undefined);
    await p.user.deleteMany({ where: { id: { in: ids } } }).catch(() => undefined);
    if (prev) await p.siteSetting.update({ where: { key: 'openRegistration' }, data: { value: prev.value } }); else await p.siteSetting.deleteMany({ where: { key: 'openRegistration' } });
    await p.$disconnect();
  }
  console.log(fails ? `\n${fails} échec(s)` : '\nTout est OK');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
