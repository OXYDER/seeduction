// Test de bout en bout : 2FA obligatoire pour l'équipe (Admin > Sécurité). Voir README.md.
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
  const tag = 'f2' + Date.now().toString(36).slice(-4);
  const hash = await bcrypt.hash('Mot-de-passe-test-1', 4);
  const old = new Date(Date.now() - 30 * 86400_000);
  await E2E.getAdmin(p, bcrypt);
  const before = await p.siteSetting.findUnique({ where: { key: 'staff2faRequired' } });
  const mk = (n, role, tf) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: old, role, twoFactorEnabled: !!tf, twoFactorSecret: tf ? 'JBSWY3DPEHPK3PXP' : null } });
  const adminNo = await mk('a', 'ADMIN', false), adminYes = await mk('y', 'ADMIN', true), modNo = await mk('m', 'MODERATOR', false), modYes = await mk('o', 'MODERATOR', true), member = await mk('u', 'USER', false);
  const [TAN, TAY, TMN, TMY, TU] = [adminNo, adminYes, modNo, modYes, member].map(tok);

  await call('PUT', '/admin/staff-security', TAY, { required: false });
  check('réglage coupé : un modérateur sans 2FA utilise les outils', (await call('GET', '/staff/members/counts', TMN)).s === 200);
  check('un modérateur ne règle pas la sécurité', (await call('GET', '/admin/staff-security', TMY)).s === 403);
  const refused = await call('PUT', '/admin/staff-security', TAN, { required: true });
  check('sans sa propre 2FA, impossible de rendre la 2FA obligatoire', refused.s === 400 && /propre double authentification/.test(refused.raw), refused.raw.slice(0, 100));
  const on = await call('PUT', '/admin/staff-security', TAY, { required: true });
  check('avec sa 2FA, l\'obligation est activée et la liste dit qui l\'a', on.s === 200 && on.b.required === true && on.b.staff.some((s) => s.username === tag + 'm' && s.twoFactor === false) && on.b.staff.some((s) => s.username === tag + 'y' && s.twoFactor === true), on.raw.slice(0, 120));

  const blocked = await call('GET', '/staff/members/counts', TMN);
  check('modérateur sans 2FA : outils fermés (403 avec code)', blocked.s === 403 && blocked.b?.code === 'STAFF_2FA_REQUIRED', blocked.raw.slice(0, 140));
  check('administrateur sans 2FA : admin fermée aussi', (await call('GET', '/admin/staff-security', TAN)).s === 403);
  check('modérateur avec 2FA : outils ouverts', (await call('GET', '/staff/members/counts', TMY)).s === 200);
  check('son compte de membre fonctionne toujours', (await call('GET', '/users/me', TMN)).s === 200);
  const mine = await call('GET', '/auth/staff-2fa', TMN);
  check('le bandeau sait qu\'il doit activer la 2FA', mine.s === 200 && mine.b.required === true && mine.b.enabled === false, mine.raw);
  const mineYes = await call('GET', '/auth/staff-2fa', TMY);
  check('celui qui l\'a déjà : pas de bandeau', mineYes.b.required === true && mineYes.b.enabled === true);
  check('un simple membre n\'est pas concerné', (await call('GET', '/auth/staff-2fa', TU)).b.required === false);
  const dis = await call('POST', '/auth/2fa/disable', TMY, { password: 'Mot-de-passe-test-1', token: '000000' });
  check('l\'équipe ne peut plus désactiver sa 2FA', dis.s === 400 && /obligatoire/.test(dis.raw), dis.raw.slice(0, 100));

  await call('PUT', '/admin/staff-security', TAY, { required: false });
  check('obligation levée : le modérateur sans 2FA retrouve les outils', (await call('GET', '/staff/members/counts', TMN)).s === 200);
  const logs = await p.activityLog.count({ where: { action: { in: ['STAFF_2FA_REQUIRED_ON', 'STAFF_2FA_REQUIRED_OFF'] }, userId: adminYes.id } });
  check('changements inscrits au journal d\'audit', logs >= 2);

  // ---- nettoyage
  if (before) await p.siteSetting.update({ where: { key: 'staff2faRequired' }, data: { value: before.value } }); else await p.siteSetting.deleteMany({ where: { key: 'staff2faRequired' } });
  const ids = [adminNo.id, adminYes.id, modNo.id, modYes.id, member.id];
  await p.activityLog.deleteMany({ where: { userId: { in: ids } } });
  await p.user.deleteMany({ where: { id: { in: ids } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
