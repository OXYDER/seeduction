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

  // ---- le corps JSON des requêtes est bien lu (garde-fou : un analyseur mal installé fait échouer toutes les connexions)
  const okLogin = await call('POST', '/auth/login', null, { usernameOrEmail: member.username, password: 'Mot-de-passe-test-1' });
  check('connexion avec le bon mot de passe', okLogin.s === 201 && !!okLogin.b?.accessToken, okLogin.raw.slice(0, 80));
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

  // ---- rapports de la politique de sécurité du navigateur (CSP)
  const post = await fetch(BASE + '/security/csp-report', { method: 'POST', headers: { 'Content-Type': 'application/csp-report' }, body: JSON.stringify({ 'csp-report': { 'violated-directive': 'img-src', 'blocked-uri': 'https://e2e-test.invalid/x.png?secret=1', 'document-uri': 'https://site.test/p?a=1' } }) });
  check('rapport CSP reçu sans connexion (204)', post.status === 204, String(post.status));
  const csp = await call('GET', '/security/csp-report', TA);
  check("rapport CSP visible par l'administrateur, sans paramètres", csp.s === 200 && csp.b.items.some((i) => i.blocked === 'https://e2e-test.invalid/x.png'));
  check('rapport CSP refusé aux membres', (await call('GET', '/security/csp-report', tok(member))).s === 403);
  await call('DELETE', '/security/csp-report', TA);

  // ---- le site est privé : rien n'est lisible sans session
  const anon = ['/torrents', '/torrents/' + 'x'.repeat(8), '/users/' + member.id, '/users/leaderboard', '/stats/top-torrents', '/badges/hall-of-fame', '/chat/messages', '/announcements/latest', '/announcements/feed', '/entities', '/forum/latest', '/forum/index', '/requests', '/collections/public', '/wiki', '/wiki/faq', '/wiki/search?q=staff', '/wiki/articles/guide-staff-sante-economie'];
  const open = [];
  for (const path of anon) { const r = await fetch(BASE + path); if (r.status !== 401) open.push(path + ' → ' + r.status); }
  check('visiteur sans session : tout est refusé (401)', open.length === 0, open.join(' ; '));
  check('les pages publiques nécessaires restent ouvertes (état du site, connexion)', (await fetch(BASE + '/system/status')).status === 200 && (await fetch(BASE + '/auth/features')).status === 200);

  // ---- Wiki : les guides du staff ne sont jamais envoyés aux membres
  const treeM = await call('GET', '/wiki', tok(member)), treeA = await call('GET', '/wiki', TA);
  check('wiki : un membre ne voit pas la catégorie du staff', treeM.s === 200 && !treeM.b.some((c) => c.slug === 'guides-staff') && treeM.b.length > 3);
  check('wiki : l\'équipe la voit', treeA.s === 200 && treeA.b.some((c) => c.slug === 'guides-staff'));
  check('wiki : article du staff refusé à un membre (404), visible par l\'équipe', (await call('GET', '/wiki/articles/guide-staff-sante-economie', tok(member))).s === 404 && (await call('GET', '/wiki/articles/guide-staff-sante-economie', TA)).s === 200);
  const srch = await call('GET', '/wiki/search?q=JWT_SECRET', tok(member));
  check('wiki : la recherche d\'un membre ne remonte aucun guide du staff', srch.s === 200 && !srch.b.some((x) => x.category?.slug === 'guides-staff'));
  const faqM = await call('GET', '/wiki/faq', tok(member));
  check('wiki : la FAQ d\'un membre ne contient rien du staff', faqM.s === 200 && !faqM.b.some((x) => x.category?.slug === 'guides-staff'));

  // ---- nettoyage
  await p.activityLog.deleteMany({ where: { OR: [{ ip: { in: [ipBrute, ipSpray, ipNew, '203.0.113.200'] } }, { userId: { in: [member.id, banned.id, demoted.id, changed.id, staff.id] } }, { action: 'LOGIN_FAILED', meta: { path: ['username'], string_starts_with: tag } }] } });
  await p.user.deleteMany({ where: { id: { in: [member.id, banned.id, demoted.id, changed.id, staff.id] } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
