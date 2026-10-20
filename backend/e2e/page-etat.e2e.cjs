// Test de bout en bout : page d'état publique (sans connexion) : services, 90 jours, incidents sans détail technique, maintenance annoncée. Voir README.md.
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const BASE = E2E.BASE;
async function get(p) { const r = await fetch(BASE + p); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { s: r.status, b: j, raw: t }; }
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };

(async () => {
  const p = new PrismaClient();
  const r = await get('/system/public-status');
  check('accessible sans connexion', r.s === 200 && !!r.b);
  check('services : site, tracker, base de données, sports, courriels', ['site', 'tracker', 'database', 'sports', 'mail'].every((id) => r.b.components.some((c) => c.id === id)));
  check('90 jours dans la grille, aujourd\'hui en dernier', r.b.days.length === 90 && r.b.days[89].date === new Date().toISOString().slice(0, 10));
  check('aucun détail technique (version, mémoire, secrets, courriel) dans les incidents', !/secret|memory|mémoire|JWT|detail|smtp\./i.test(JSON.stringify(r.b.incidents)));

  // un incident interne (sécurité) n'apparaît jamais ; un incident de base de données, oui
  const secret = await p.healthIncident.create({ data: { checkId: 'secret', label: 'Sécurité : secret des sessions', level: 'error', detail: 'JWT_SECRET faible', startedAt: new Date(Date.now() - 3600_000) } });
  const dbInc = await p.healthIncident.create({ data: { checkId: 'database', label: 'Base de données', level: 'warn', detail: 'Répond en 2000 ms', startedAt: new Date(Date.now() - 600_000), resolvedAt: new Date(Date.now() - 300_000) } });
  await new Promise((res) => setTimeout(res, 100));
  // le cache de 30 s : on attend qu'il expire ou on interroge avec un autre état — ici on vérifie la forme via un second appel après invalidation
  await new Promise((res) => setTimeout(res, 31_000));
  const r2 = await get('/system/public-status');
  check('incident de base de données résolu : listé, sans détail', r2.b.incidents.some((i) => i.title === 'Base de données' && i.ongoing === false) && !r2.raw.includes('2000 ms'));
  check('incident de sécurité : jamais publié', !r2.raw.includes('JWT') && !r2.raw.includes('Sécurité'));
  const open = await p.healthIncident.create({ data: { checkId: 'smtp', label: 'Envoi de courriels', level: 'warn', detail: 'SMTP_HOST absent' } });
  await new Promise((res) => setTimeout(res, 31_000));
  const r3 = await get('/system/public-status');
  check('service secondaire dégradé : état « dégradé », le tracker reste normal', r3.b.components.find((c) => c.id === 'mail').status === 'degraded' && r3.b.components.find((c) => c.id === 'tracker').status === 'ok' && r3.b.overall === 'degraded', r3.b.overall);
  await p.healthIncident.deleteMany({ where: { id: { in: [secret.id, dbInc.id, open.id] } } });

  const st = await get('/system/status');
  check('le bandeau de maintenance existant reste public et intact', st.s === 200 && 'maintenance' in st.b && 'version' in st.b);
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
