// Lance tous les tests de bout en bout (ou ceux dont le nom contient l'argument) les uns après les autres et résume le résultat.
// Usage : node e2e/run-all.cjs [filtre]
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const filter = process.argv[2] || '';
const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.e2e.cjs') && f.includes(filter)).sort();
if (files.length === 0) { console.error('Aucun test ne correspond.'); process.exit(2); }

const results = [];
for (const f of files) {
  const t0 = Date.now();
  console.log(`\n=== ${f} ===`);
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: process.env, maxBuffer: 64 * 1024 * 1024 });
  const lines = `${r.stdout}${r.stderr}`.split('\n');
  const failed = lines.filter((l) => /^FAIL|ERREUR/.test(l));
  failed.forEach((l) => console.log(l));
  console.log(lines.filter((l) => /TOUT PASSE|ÉCHEC/.test(l)).join('\n') || lines.slice(-3).join('\n'));
  results.push({ f, ok: r.status === 0, secs: Math.round((Date.now() - t0) / 1000) });
}
console.log('\nRésumé');
for (const r of results) console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.f} (${r.secs} s)`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
