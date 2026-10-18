// Test de bout en bout : sécurité (sessions liées à l'état du compte, rapport d'activité suspecte). Voir README.md.
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
const tok = (u, role, iat) => jwt.sign({ sub: u.id, username: u.username, role: role ?? u.role, ...(iat ? { iat } : {}) }, E2E.SECRET, { expiresIn: '1h' });

(async () => {
  const p = new PrismaClient();
  const tag = 'se' + Date.now().toString(36).slice(-4);
  const hash = await bcrypt.hash('Mot-de-passe-test-1', 4);
  const old = new Date(Date.now() - 30 * 86400_000);
  const mk = (n, extra = {}) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: old, ...extra } });
  const member = await mk('m'), banned = await mk('b'), demoted = await mk('d', { role: 'ADMIN' }), changed = await mk('c'), staff = await mk('s', { role: 'ADMIN' });
  const admin = await E2E.getAdmin(p, bcrypt);
  const TA = tok(admin);

  // ---- sessions liées à l'état réel du compte
  await p.user.update({ where: { id: banned.id }, data: { status: 'BANNED' } });
  check('membre banni : session refusée', (await call('GET', '/users/me', tok(banned))).s === 401);
  await p.user.update({ where: { id: demoted.id }, data: { role: 'USER' } });
  check('rôle relu dans la base : faux jeton ADMIN refusé', (await call('GET', '/games/duels/admin', tok(demoted, 'ADMIN'))).s === 403);
  await p.user.update({ where: { id: changed.id }, data: { sessionsValidAfter: new Date() } });
  check('jeton émis avant le changement de mot de passe : refusé', (await call('GET', '/users/me', tok(changed, undefined, Math.floor(Date.now() / 1000) - 120))).s === 401);
  check('compte inconnu : refusé', (await call('GET', '/users/me', jwt.sign({ sub: 'inconnu', username: 'x', role: 'USER' }, E2E.SECRET, { expiresIn: '1h' }))).s === 401);

  // ---- un échec de connexion réel est journalisé
  const r = await call('POST', '/auth/login', null, { usernameOrEmail: member.username, password: 'mauvais-mot-de-passe' });
  const logged = await p.activityLog.count({ where: { action: 'LOGIN_FAILED', createdAt: { gt: new Date(Date.now() - 60_000) } } });
  check('échec de connexion journalisé', r.s === 401 && logged >= 1);

  // ---- rapport d'activité suspecte
  const ipBrute = '203.0.113.' + (10 + Math.floor(Math.random() * 40)), ipSpray = '198.51.100.' + (10 + Math.floor(Math.random() * 40)), ipNew = '192.0.2.' + (10 + Math.floor(Math.random() * 40));
  const rows = [];
  for (let i = 0; i < 20; i++) rows.push({ action: 'LOGIN_FAILED', ip: ipBrute, meta: { username: tag + 'victime' } });
  for (let i = 0; i < 12; i++) rows.push({ action: 'LOGIN_FAILED', ip: ipSpray, meta: { username: tag + 'u' + (i % 6) } });
  rows.push({ action: 'LOGIN', userId: staff.id, ip: '203.0.113.200', createdAt: new Date(Date.now() - 3 * 86400_000) }); // adresse habituelle de l'administrateur
  rows.push({ action: 'LOGIN', userId: staff.id, ip: ipNew }); // adresse jamais vue
  await p.activityLog.createMany({ data: rows });
  const rep = await call('GET', '/admin/monitoring/security?hours=24', TA);
  const f = rep.b?.findings ?? [];
  check('rapport accessible à l\'administrateur', rep.s === 200 && rep.b.totals.failed >= 32);
  check('force brute détectée', f.some((x) => x.kind === 'ip-burst' && x.subject === ipBrute && x.count === 20));
  check('arrosage de comptes détecté (gravité haute)', f.some((x) => x.kind === 'ip-spray' && x.subject === ipSpray && x.severity === 'high' && x.count === 6));
  check('membre de l\'équipe depuis une nouvelle adresse détecté', f.some((x) => x.kind === 'staff-new-ip' && x.subject === staff.username && x.detail.includes(ipNew)));
  check('un membre ordinaire ne peut pas lire le rapport', (await call('GET', '/admin/monitoring/security', tok(member))).s === 403);

  // ---- nettoyage
  await p.activityLog.deleteMany({ where: { OR: [{ ip: { in: [ipBrute, ipSpray, ipNew, '203.0.113.200'] } }, { userId: { in: [member.id, banned.id, demoted.id, changed.id, staff.id] } }, { action: 'LOGIN_FAILED', meta: { path: ['username'], string_starts_with: tag } }] } });
  await p.user.deleteMany({ where: { id: { in: [member.id, banned.id, demoted.id, changed.id, staff.id] } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
