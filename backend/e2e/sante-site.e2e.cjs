// Test de bout en bout : historique du site et incidents de santé (Admin > Monitoring). Voir README.md.
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
const hourAgo = (h) => { const t = Math.floor(Date.now() / 3600_000) * 3600_000 - h * 3600_000; return new Date(t); };

(async () => {
  const p = new PrismaClient();
  const tag = 'sh' + Date.now().toString(36).slice(-5);
  const hash = await bcrypt.hash('Mot-de-passe-test-1', 4);
  await E2E.getAdmin(p, bcrypt);
  const mk = (n, role) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: new Date(Date.now() - 60 * 86400_000), role } });
  const adm = await mk('a', 'ADMIN'), mod = await mk('m', 'MODERATOR');
  const [TA, TM] = [tok(adm), tok(mod)];

  check('réservé aux administrateurs', (await call('GET', '/admin/monitoring/history', TM)).s === 403 && (await call('GET', '/admin/monitoring/history')).s === 401 && (await call('PUT', '/admin/monitoring/health/telegram', TM, { enabled: false })).s === 403);

  // heures fictives dans un passé lointain mais dans les 30 jours (pas de collision avec les heures réelles de la session)
  const saved = await p.siteSample.findMany({ where: { hour: { gte: hourAgo(24 * 29) , lte: hourAgo(40) } } });
  await p.siteSample.deleteMany({ where: { hour: { gte: hourAgo(24 * 29), lte: hourAgo(40) } } });
  await p.siteSample.createMany({ data: [
    { hour: hourAgo(100), requests: 1000, errors: 10, announces: 400, onlinePeak: 12, rssMB: 300, lagMs: 30 },
    { hour: hourAgo(99), requests: 2000, errors: 30, announces: 600, onlinePeak: 45, rssMB: 340, lagMs: 250 },
    { hour: hourAgo(24 * 20), requests: 5000, errors: 5, announces: 100, onlinePeak: 20, rssMB: 280, lagMs: 10 },
  ] });
  const h24 = await call('GET', '/admin/monitoring/history?range=24h', TA);
  check('24 h : la période demandée ne contient pas les heures plus anciennes', h24.s === 200 && h24.b.range === '24h' && h24.b.points.every((x) => new Date(x.at).getTime() > Date.now() - 25 * 3600_000));
  const h7 = await call('GET', '/admin/monitoring/history?range=7d', TA);
  const p7 = h7.b.points.filter((x) => [hourAgo(100).toISOString(), hourAgo(99).toISOString()].includes(x.at));
  check('7 jours : une valeur par heure, avec les valeurs enregistrées', p7.length === 2 && p7[1].requests === 2000 && p7[1].onlinePeak === 45 && p7[1].lagMs === 250, JSON.stringify(p7));
  check('7 jours : l\'heure plus ancienne (20 j) n\'y est pas', !h7.b.points.some((x) => x.at === hourAgo(24 * 20).toISOString()));
  const h30 = await call('GET', '/admin/monitoring/history?range=30d', TA);
  check('30 jours : regroupé par jour (une valeur par jour), l\'heure de 20 jours y est', h30.b.points.length < 31 && h30.b.points.length >= 2 && h30.b.points.some((x) => x.requests >= 5000), h30.b.points.length + ' pts');
  const day = h30.b.points.find((x) => x.requests === 3000 || x.requests >= 3000 && x.errors >= 40);
  check('30 jours : deux heures d\'un même jour = sommes et pics', !!day && day.onlinePeak >= 45 && day.lagMs >= 250, JSON.stringify(day));
  check('chiffres clés de la période', h30.b.summary.requests >= 8000 && h30.b.summary.peakOnline >= 45 && h30.b.summary.maxLagMs >= 250 && typeof h30.b.summary.errorRate === 'number');
  check('période inconnue : 24 h par défaut', (await call('GET', '/admin/monitoring/history?range=zzz', TA)).b.range === '24h');
  // l'heure en cours est écrite à la consultation et ne régresse jamais
  const now = hourAgo(0);
  const r1 = await p.siteSample.findUnique({ where: { hour: now } });
  await p.siteSample.update({ where: { hour: now }, data: { requests: 999999 } });
  await call('GET', '/admin/monitoring/history?range=24h', TA);
  const r2 = await p.siteSample.findUnique({ where: { hour: now } });
  check('l\'heure en cours est inscrite, et une valeur plus basse n\'écrase jamais une plus haute', !!r1 && r2.requests === 999999);
  await p.siteSample.update({ where: { hour: now }, data: { requests: r1.requests } });

  // ---- incidents
  await p.healthIncident.deleteMany({ where: { checkId: { startsWith: 'e2e-' + tag } } });
  const t0 = new Date(Date.now() - 3 * 3600_000);
  await p.healthIncident.createMany({ data: [
    { checkId: 'e2e-' + tag + '-a', label: 'Base de données (test)', level: 'error', detail: 'Injoignable', startedAt: t0, resolvedAt: new Date(t0.getTime() + 25 * 60_000) },
    { checkId: 'e2e-' + tag + '-b', label: 'Mémoire (test)', level: 'warn', detail: '900 Mo', startedAt: new Date(Date.now() - 10 * 60_000) },
  ] });
  const inc = (await call('GET', '/admin/monitoring/history', TA)).b.incidents.filter((i) => i.checkId.startsWith('e2e-' + tag));
  const a = inc.find((i) => i.checkId.endsWith('-a')), b = inc.find((i) => i.checkId.endsWith('-b'));
  check('incident rétabli : durée lisible (25 min), fermé', a.duration === '25 min' && a.open === false && a.level === 'error');
  check('incident en cours : ouvert, durée depuis le début', b.open === true && b.resolvedAt === null && /^(9|10|11) min$/.test(b.duration), b.duration);
  check('le plus récent d\'abord', inc[0].checkId.endsWith('-b'));

  // ---- Telegram
  const h = await call('GET', '/admin/monitoring/health', TA);
  check('santé : alertes Telegram activées par défaut, compte pas encore relié', h.s === 200 && h.b.telegram === true && h.b.telegramLinked === false, JSON.stringify([h.b.telegram, h.b.telegramLinked]));
  await call('PUT', '/admin/monitoring/health/telegram', TA, { enabled: false });
  check('alertes Telegram coupées', (await call('GET', '/admin/monitoring/health', TA)).b.telegram === false);
  check('couper Telegram ne touche pas aux autres alertes', (await call('GET', '/admin/monitoring/health', TA)).b.alerts === h.b.alerts);
  await call('PUT', '/admin/monitoring/health/telegram', TA, { enabled: true });
  check('alertes Telegram réactivées', (await call('GET', '/admin/monitoring/health', TA)).b.telegram === true);

  // ---- nettoyage
  await p.healthIncident.deleteMany({ where: { checkId: { startsWith: 'e2e-' + tag } } });
  await p.siteSample.deleteMany({ where: { hour: { in: [hourAgo(100), hourAgo(99), hourAgo(24 * 20)] } } });
  for (const s of saved) await p.siteSample.create({ data: s }).catch(() => undefined);
  await p.user.deleteMany({ where: { id: { in: [adm.id, mod.id] } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
