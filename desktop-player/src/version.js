// Numéros de version du lecteur (1.2.3) : comparaison nombre par nombre, comme côté serveur (backend/src/common/utils/app-version.ts).

/** Négatif si a < b, 0 si égales, positif si a > b (« 1.2 » égale « 1.2.0 »). */
function compareVersions(a, b) {
  const pa = String(a).trim().split('.').map(Number);
  const pb = String(b).trim().split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

const isValidVersion = (v) => typeof v === 'string' && /^\d{1,4}(\.\d{1,4}){1,3}$/.test(v.trim());

module.exports = { compareVersions, isValidVersion };
