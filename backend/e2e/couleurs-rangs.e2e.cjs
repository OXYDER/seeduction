// Test de bout en bout : couleurs de pseudo par rang (liste des rangs colorés, priorité du rôle sur la classe, comptes supprimés exclus). Voir README.md.
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const BASE = E2E.BASE;
async function call(method, p, token) { const r = await fetch(BASE + p, { method, headers: token ? { Authorization: 'Bearer ' + token } : {} }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { s: r.status, b: j }; }
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
(async () => {
  const p = new PrismaClient();
  const tag = 'rk' + Date.now().toString(36).slice(-5);
  const mk = (n, data = {}) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: 'x', createdAt: new Date(Date.now() - 60 * 86400_000), ...data } });
  const mod = await mk('m', { role: 'MODERATOR' }), up = await mk('u', { role: 'UPLOADER', memberClass: 'VETERAN' }), vet = await mk('v', { memberClass: 'VETERAN' }), plain = await mk('p'), gone = await mk('g', { memberClass: 'ELITE', deletedAt: new Date(), status: 'DISABLED' });
  const token = jwt.sign({ sub: plain.id, username: plain.username, role: 'USER' }, E2E.SECRET, { expiresIn: '1h' });
  check('sans connexion : refusé', (await call('GET', '/users/rank-colors')).s === 401);
  const r = await call('GET', '/users/rank-colors', token);
  const rankOf = (id) => Object.entries(r.b ?? {}).find(([, ids]) => ids.includes(id))?.[0];
  check('modérateur : couleur de modérateur', rankOf(mod.id) === 'MODERATOR');
  check('Uploadeur passe avant la classe Vétéran', rankOf(up.id) === 'UPLOADER');
  check('membre Vétéran : couleur Vétéran', rankOf(vet.id) === 'VETERAN');
  check('membre ordinaire : aucune couleur', rankOf(plain.id) === undefined);
  check('compte supprimé : absent de la liste', rankOf(gone.id) === undefined);
  const ids = [mod.id, up.id, vet.id, plain.id, gone.id];
  await p.user.deleteMany({ where: { id: { in: ids } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
