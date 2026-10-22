#!/usr/bin/env node
// Compile et publie les lecteurs Seeduction (Windows et Android) sur le site, sans rien faire à la main :
//   1. choisit le numéro de version (celui du code s'il est plus récent que celui du site, sinon la version du site + 1) et l'écrit dans le projet ;
//   2. compile l'installateur Windows (electron-builder) et l'APK Android (Gradle) ;
//   3. les envoie au site par morceaux avec la clé de publication (Admin > Lecteurs > « Publication automatique ») ;
//   4. vérifie que le site propose bien la nouvelle version (même empreinte SHA-256) ;
//   5. enregistre le nouveau numéro de version dans git (commit + push).
//
// Première utilisation : Admin > Lecteurs > « Créer la clé de publication », puis coller le bloc affiché dans tools/publier-lecteurs.config.json
// (ce fichier n'est pas versionné). Ensuite : double-clic sur tools/publier-lecteurs.bat, ou « node tools/publier-lecteurs.mjs ».
//
// Options : --windows | --android (par défaut les deux) · --bump auto|patch|minor|major|none (défaut auto) · --notes "texte" (nouveautés montrées aux membres)
//           --no-build (réutilise les fichiers déjà compilés) · --no-commit · --dry-run (affiche ce qui serait fait) · --site URL · --key CLÉ

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHUNK = 8 * 1024 * 1024;
const PKG = path.join(ROOT, 'desktop-player', 'package.json');
const GRADLE = path.join(ROOT, 'android-player', 'app', 'build.gradle.kts');

// ── Options ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d = undefined) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const doWindows = flag('windows') || !flag('android');
const doAndroid = flag('android') || !flag('windows');
const bump = opt('bump', 'auto');
const dryRun = flag('dry-run');
const noBuild = flag('no-build');
const noCommit = flag('no-commit');
const notes = opt('notes');

function loadConfig() {
  let cfg = {};
  const file = path.join(ROOT, 'tools', 'publier-lecteurs.config.json');
  if (existsSync(file)) { try { cfg = JSON.parse(readFileSync(file, 'utf8')); } catch { fail(`${file} n'est pas un JSON valide.`); } }
  const site = (opt('site') ?? process.env.SEEDUCTION_SITE ?? cfg.site ?? '').replace(/\/+$/, '');
  const key = opt('key') ?? process.env.SEEDUCTION_PUBLISH_KEY ?? cfg.key ?? '';
  if (!site || !key) fail('Configuration manquante. Dans Admin > Lecteurs, crée la clé de publication, puis colle le bloc affiché dans tools/publier-lecteurs.config.json\n  { "site": "https://…", "key": "…" }');
  return { site, key };
}

function fail(msg) { console.error(`\n✖ ${msg}`); process.exit(1); }
const step = (msg) => console.log(`\n▶ ${msg}`);

// ── Versions ───────────────────────────────────────────────────────────────
const cmp = (a, b) => { const pa = a.split('.').map(Number), pb = b.split('.').map(Number); for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; } return 0; };
const bumped = (v, kind) => { const p = v.split('.').map(Number); while (p.length < 3) p.push(0); if (kind === 'major') return `${p[0] + 1}.0.0`; if (kind === 'minor') return `${p[0]}.${p[1] + 1}.0`; p[2] += 1; return p.slice(0, 3).join('.'); };

const codeVersion = {
  windows: () => JSON.parse(readFileSync(PKG, 'utf8')).version,
  android: () => /versionName\s*=\s*"([^"]+)"/.exec(readFileSync(GRADLE, 'utf8'))?.[1],
};

function writeVersion(platform, version) {
  if (platform === 'windows') {
    const s = readFileSync(PKG, 'utf8');
    writeFileSync(PKG, s.replace(/("version"\s*:\s*")[^"]+(")/, `$1${version}$2`));
  } else {
    let s = readFileSync(GRADLE, 'utf8');
    s = s.replace(/(versionName\s*=\s*")[^"]+(")/, `$1${version}$2`);
    s = s.replace(/(versionCode\s*=\s*)(\d+)/, (_m, a, n) => `${a}${Number(n) + 1}`); // Android refuse d'installer par-dessus sans un versionCode plus grand
    writeFileSync(GRADLE, s);
  }
}

function targetVersion(platform, published) {
  const local = codeVersion[platform]();
  if (!local) fail(`Version introuvable dans le projet (${platform}).`);
  if (bump === 'none') return local;
  if (bump === 'auto') return !published || cmp(local, published) > 0 ? local : bumped(published, 'patch');
  return bumped(published && cmp(published, local) > 0 ? published : local, bump);
}

// ── Compilation ────────────────────────────────────────────────────────────
function run(cmd, argv, cwd, env = {}) {
  const r = spawnSync(cmd, argv, { cwd, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, ...env } });
  if (r.status !== 0) fail(`La commande « ${cmd} ${argv.join(' ')} » a échoué.`);
}

function build(platform, version) {
  if (platform === 'windows') {
    const dir = path.join(ROOT, 'desktop-player');
    if (!noBuild) run('npm', ['run', 'dist'], dir);
    const file = path.join(dir, 'dist', `Seeduction Player Setup ${version}.exe`);
    if (!existsSync(file)) fail(`Installateur Windows introuvable : ${file}`);
    return file;
  }
  const dir = path.join(ROOT, 'android-player');
  if (!noBuild) {
    const javaHome = process.env.JAVA_HOME || ['C:\\Program Files\\Android\\Android Studio\\jbr', '/Applications/Android Studio.app/Contents/jbr/Contents/Home'].find(existsSync);
    run(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', ['--no-daemon', 'assembleRelease', '-q'], dir, javaHome ? { JAVA_HOME: javaHome } : {});
  }
  const file = path.join(dir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  if (!existsSync(file)) fail(`APK introuvable : ${file}`);
  return file;
}

// ── Envoi ──────────────────────────────────────────────────────────────────
async function api(cfg, method, p, { body, raw } = {}) {
  const headers = { 'X-Publish-Key': cfg.key };
  if (body) headers['Content-Type'] = 'application/json';
  if (raw) headers['Content-Type'] = 'application/octet-stream';
  const res = await fetch(`${cfg.site}/api${p}`, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined), signal: AbortSignal.timeout(180_000) });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* pas du JSON */ }
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${json?.message ?? text.slice(0, 120)}`);
  return json;
}

function readChunk(fd, offset, length) { const buf = Buffer.alloc(length); const n = readSync(fd, buf, 0, length, offset); return buf.subarray(0, n); }

async function publish(cfg, platform, file, version) {
  const size = statSync(file).size;
  const sha = createHash('sha256');
  const fd = openSync(file, 'r');
  try { for (let off = 0; off < size; off += CHUNK) sha.update(readChunk(fd, off, Math.min(CHUNK, size - off))); } finally { closeSync(fd); }
  const digest = sha.digest('hex');

  const { upload } = await api(cfg, 'POST', `/admin/players/${platform}/start`);
  const total = Math.ceil(size / CHUNK);
  const fd2 = openSync(file, 'r');
  try {
    for (let i = 0; i < total; i++) {
      const data = readChunk(fd2, i * CHUNK, Math.min(CHUNK, size - i * CHUNK));
      for (let attempt = 1; ; attempt++) {
        try { await api(cfg, 'POST', `/admin/players/chunk?upload=${upload}&index=${i}`, { raw: data }); break; }
        catch (e) { if (attempt >= 3) throw e; await new Promise((r) => setTimeout(r, 1500 * attempt)); }
      }
      process.stdout.write(`\r  envoi ${Math.round(((i + 1) / total) * 100)} %   `);
    }
  } finally { closeSync(fd2); }
  process.stdout.write('\n');
  const release = await api(cfg, 'POST', '/admin/players/finish', { body: { upload, version, notes } });
  if (release.sha256 !== digest) fail(`Empreinte différente après l'envoi (${platform}) : le site a reçu un fichier abîmé, relance le script.`);
  return release;
}

async function published(cfg) {
  const res = await fetch(`${cfg.site}/api/downloads/players`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) fail(`Le site ne répond pas correctement (${res.status}).`);
  return res.json();
}

// ── Programme ──────────────────────────────────────────────────────────────
const cfg = loadConfig();
step(`Site : ${cfg.site}`);
// La clé est vérifiée tout de suite : inutile de compiler pendant dix minutes pour s'apercevoir qu'elle est refusée.
try { await api(cfg, 'GET', '/admin/players'); } catch (e) { fail(`La clé de publication est refusée ou le site est injoignable (${e.message}).
  Crée-en une nouvelle dans Admin > Lecteurs et mets à jour tools/publier-lecteurs.config.json.`); }
let current;
try { current = await published(cfg); } catch (e) { fail(`Impossible de joindre le site : ${e.message}`); }

const platforms = [...(doWindows ? ['windows'] : []), ...(doAndroid ? ['android'] : [])];
const plan = platforms.map((p) => ({ platform: p, published: current[p]?.version ?? null, local: codeVersion[p](), target: targetVersion(p, current[p]?.version ?? null) }));
for (const x of plan) console.log(`  ${x.platform === 'windows' ? 'Windows' : 'Android'} : site ${x.published ?? '—'} · projet ${x.local} → publier ${x.target}`);
if (dryRun) { console.log('\n(--dry-run : rien n\'a été modifié.)'); process.exit(0); }

const changed = [];
for (const x of plan) {
  step(`${x.platform === 'windows' ? 'Lecteur Windows' : 'Application Android'} ${x.target}`);
  if (x.target !== x.local) { writeVersion(x.platform, x.target); changed.push(x.platform); console.log(`  version du projet : ${x.local} → ${x.target}`); }
  const file = build(x.platform, x.target);
  const release = await publish(cfg, x.platform, file, x.target);
  const check = (await published(cfg))[x.platform];
  if (check?.version !== x.target || check.sha256 !== release.sha256) fail(`Le site n'affiche pas la version publiée (${x.platform}).`);
  console.log(`  ✓ publié : version ${check.version}, ${(check.size / 1048576).toFixed(1)} Mo, empreinte ${check.sha256.slice(0, 12)}…`);
}

if (changed.length && !noCommit) {
  step('Enregistrement des numéros de version dans git');
  const files = [...(changed.includes('windows') ? [PKG] : []), ...(changed.includes('android') ? [GRADLE] : [])].map((f) => path.relative(ROOT, f));
  const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
  const versions = plan.filter((x) => changed.includes(x.platform)).map((x) => `${x.platform === 'windows' ? 'Windows' : 'Android'} ${x.target}`).join(', ');
  git('add', ...files);
  const c = git('commit', '-m', `Lecteurs publiés sur le site : ${versions}\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`);
  if (c.status !== 0) console.log('  (rien à enregistrer ou commit impossible : fais-le à la main si besoin)');
  else { const p = git('push', 'origin', 'HEAD'); console.log(p.status === 0 ? '  ✓ poussé sur GitHub' : '  commit fait, mais le push a échoué (fais « git push » à la main)'); }
}
console.log('\n✔ Terminé : les lecteurs déjà installés proposeront la mise à jour à leur prochain démarrage.');
