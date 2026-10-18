// Aides communes des tests de bout en bout (voir README.md dans ce dossier).
const path = require('path');

/** Refuse de tourner contre une base qui n'est pas locale : ces tests créent des comptes et des données de test. */
function guard() {
  const url = process.env.DATABASE_URL || '';
  const local = /@(localhost|127\.0\.0\.1|\[::1\]|postgres)(:|\/)/.test(url);
  if (!url || (!local && process.env.E2E_ALLOW_REMOTE !== '1')) {
    console.error('Refus : DATABASE_URL doit pointer vers une base locale de test (E2E_ALLOW_REMOTE=1 pour forcer, à tes risques).');
    process.exit(3);
  }
}

/** Un compte administrateur (créé s'il n'en existe aucun). */
async function getAdmin(prisma, bcrypt) {
  let a = await prisma.user.findFirst({ where: { role: { in: ['ADMIN', 'OWNER'] }, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
  if (!a) {
    a = await prisma.user.create({ data: { username: 'e2eadmin', email: 'e2eadmin@t.local', passwordHash: await bcrypt.hash('Mot-de-passe-test-1', 4), role: 'OWNER', createdAt: new Date(Date.now() - 30 * 86400_000) } });
  }
  return a;
}

const backend = path.join(__dirname, '..');
module.exports = { guard, getAdmin, NODE_MODULES: path.join(backend, 'node_modules') + '/', DIST: path.join(backend, 'dist') + '/', BASE: process.env.E2E_BASE || 'http://localhost:3000/api', SECRET: process.env.JWT_SECRET || 'change-me-in-.env' };
