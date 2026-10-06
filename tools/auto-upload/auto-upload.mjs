#!/usr/bin/env node
/**
 * Seeduction — import automatique de torrents (aucune dépendance : Node 18 ou plus).
 *
 * Surveille des sources que TU configures (flux RSS / Torznab, ou un dossier de fichiers .torrent), envoie les nouveautés sur
 * ton site par l'API (clé avec la portée « torrents:upload »), puis se souvient de ce qui est fait pour ne jamais renvoyer deux fois.
 * Les torrents arrivent en attente de validation, comme tout envoi : le staff garde la main.
 *
 *   node auto-upload.mjs --config config.json                  une passe, puis fin
 *   node auto-upload.mjs --config config.json --watch          repasse toutes les `intervalMinutes`
 *   node auto-upload.mjs --config config.json --dry-run        montre ce qui serait envoyé, sans rien envoyer
 *   node auto-upload.mjs --config config.json --list-categories   liste les catégories de ton site (pour la configuration)
 *   node auto-upload.mjs --config config.json --inspect       montre ce que chaque source fournit (titre, taille, NFO...), sans rien envoyer
 *   node auto-upload.mjs --config config.json --retry-skipped  retente les éléments mis de côté (NFO manquant...)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
if (flag('help') || flag('h')) { console.log((await fs.readFile(new URL(import.meta.url))).toString().split('*/')[0].replace(/^\/\*\*|^ \* ?/gm, '')); process.exit(0); }

const configPath = path.resolve(opt('config', 'config.json'));
const DRY = flag('dry-run');
const log = (...a) => console.log(`[${new Date().toISOString().replace('T', ' ').slice(0, 19)}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let cfg;
try { cfg = JSON.parse(await fs.readFile(configPath, 'utf8')); }
catch (e) { console.error(`Configuration illisible (${configPath}) : ${e.message}\nCopie config.example.json en config.json et adapte-le.`); process.exit(1); }

/** `${NOM}` dans la configuration est remplacé par la variable d'environnement NOM : les clés des sources restent hors du fichier. */
const expand = (v) => typeof v === 'string'
  ? v.replace(/\$\{([A-Z0-9_]+)\}/gi, (_, name) => { if (process.env[name] === undefined) { console.error(`Variable d'environnement ${name} non définie (utilisée dans la configuration).`); process.exit(1); } return process.env[name]; })
  : Array.isArray(v) ? v.map(expand) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, expand(x)])) : v;
cfg = expand(cfg);

const SITE = String(cfg.site ?? '').replace(/\/$/, '');
const API_KEY = process.env[cfg.apiKeyEnv ?? 'SEEDUCTION_API_KEY'] || cfg.apiKey;
if (!/^https?:\/\//.test(SITE)) { console.error('"site" doit être l\'adresse de ton site, par exemple https://seeduction.org'); process.exit(1); }
if (!API_KEY) { console.error(`Clé API manquante : définis la variable d'environnement ${cfg.apiKeyEnv ?? 'SEEDUCTION_API_KEY'} (clé créée dans Profil > Développeur, avec la portée « torrents:upload » et « torrents:read »).`); process.exit(1); }

const baseDir = path.dirname(configPath);
const STATE_FILE = path.resolve(baseDir, cfg.stateFile ?? 'state.json');
const MAX_PER_RUN = Number(cfg.maxPerRun ?? 10);
const DELAY_MS = Math.max(0, Number(cfg.delaySeconds ?? 20)) * 1000;
const UA = 'seeduction-auto-upload/1.0';

// ------------------------------------------------------------------ état (ce qui a déjà été traité)

let state = { items: {} };
try { state = JSON.parse(await fs.readFile(STATE_FILE, 'utf8')); } catch { /* première exécution */ }
async function saveState() {
  const tmp = STATE_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.rename(tmp, STATE_FILE);
}
const mark = (key, status, extra = {}) => { state.items[key] = { status, at: new Date().toISOString(), ...extra }; };

// ------------------------------------------------------------------ appels au site

async function site(pathname, init = {}) {
  const res = await fetch(SITE + '/api' + pathname, { ...init, headers: { 'x-api-key': API_KEY, 'user-agent': UA, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(60_000) });
  let body = null; try { body = await res.json(); } catch { /* pas de JSON */ }
  return { status: res.status, body };
}

let categories = [];
async function loadCategories() {
  const r = await site('/public/categories');
  if (r.status === 401 || r.status === 403) throw new Fatal(`Clé API refusée (${r.status}) : ${r.body?.message ?? ''}`);
  if (r.status !== 200) throw new Fatal(`Impossible de lire les catégories du site (${r.status})`);
  categories = r.body;
}
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
function categoryId(name) {
  const n = norm(name);
  const hit = categories.find((c) => norm(c.name) === n) ?? categories.find((c) => norm(c.path) === n);
  return hit?.id ?? null;
}
class Fatal extends Error {}

// ------------------------------------------------------------------ qBittorrent (API web)

/** Client minimal de l'API web de qBittorrent (v4.5 ou plus récent : il faut l'export des .torrent). */
class Qbit {
  constructor(src) { this.base = String(src.url ?? '').replace(/\/$/, ''); this.user = src.username; this.pass = src.password; this.cookie = ''; }
  async login() {
    if (!this.user) return; // accès sans identifiant (réseau local autorisé dans qBittorrent)
    const res = await fetch(this.base + '/api/v2/auth/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', referer: this.base, origin: this.base }, body: new URLSearchParams({ username: this.user, password: this.pass ?? '' }), signal: AbortSignal.timeout(20_000) });
    if (!/^ok/i.test((await res.text()).trim())) throw new Error("qBittorrent a refusé la connexion : vérifie QBIT_USER et QBIT_PASS (et que l'interface web est activée)");
    this.cookie = (res.headers.get('set-cookie') ?? '').match(/SID=[^;]+/)?.[0] ?? '';
  }
  async req(p, init = {}, retry = true) {
    let res;
    try { res = await fetch(this.base + '/api/v2' + p, { ...init, headers: { referer: this.base, origin: this.base, ...(this.cookie ? { cookie: this.cookie } : {}), ...(init.headers ?? {}) }, signal: AbortSignal.timeout(60_000) }); }
    catch { throw new Error(`qBittorrent injoignable (${this.base}) : adresse, port et interface web activée ?`); }
    if ((res.status === 403 || res.status === 401) && retry) { await this.login(); return this.req(p, init, false); }
    return res;
  }
  async completed(src) {
    const q = new URLSearchParams({ filter: 'completed' });
    if (src.qbitCategory) q.set('category', src.qbitCategory);
    if (src.qbitTag) q.set('tag', src.qbitTag);
    const res = await this.req('/torrents/info?' + q);
    if (!res.ok) throw new Error(`qBittorrent a répondu ${res.status} à la liste des torrents`);
    return res.json();
  }
  async exportTorrent(hash) {
    const res = await this.req('/torrents/export?hash=' + hash);
    if (!res.ok) throw new Error(`export du .torrent impossible (qBittorrent ${res.status}) : il faut qBittorrent 4.5 ou plus récent`);
    return Buffer.from(await res.arrayBuffer());
  }
  async addTags(hash, tags) { await this.req('/torrents/addTags', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ hashes: hash, tags }) }); }
  async add(buf, o) {
    const form = new FormData();
    form.set('torrents', new Blob([buf], { type: 'application/x-bittorrent' }), 'seeduction.torrent');
    form.set('savepath', o.savepath); form.set('autoTMM', 'false'); form.set('skip_checking', o.skipChecking ? 'true' : 'false');
    if (o.category) form.set('category', o.category);
    if (o.tags) form.set('tags', o.tags);
    const res = await this.req('/torrents/add', { method: 'POST', body: form });
    const txt = (await res.text()).trim();
    if (!res.ok || /^fails/i.test(txt)) throw new Error(`qBittorrent a refusé l'ajout (${res.status} ${txt})`);
  }
}
const qbits = new Map();
const qbitFor = async (src) => { let q = qbits.get(src.name); if (!q) { q = new Qbit(src); await q.login(); qbits.set(src.name, q); } return q; };

/** Chemin vu par qBittorrent -> chemin vu par ce script (dossiers partagés / montés différemment). */
function mapPath(src, p) {
  for (const m of src.pathMap ?? []) {
    const from = String(m.from).replace(/\\/g, '/').replace(/\/$/, ''), q = String(p).replace(/\\/g, '/');
    if (q === from || q.startsWith(from + '/')) return path.normalize(String(m.to) + q.slice(from.length));
  }
  return path.normalize(p);
}
const VIDEO = /\.(mkv|mp4|avi|ts|m2ts|mov|wmv|mpg|mpeg|iso)$/i;
async function listFiles(dir, depth = 2) {
  const out = [];
  let entries; try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && depth > 0) out.push(...await listFiles(full, depth - 1));
    else if (e.isFile()) out.push(full);
  }
  return out;
}
const readText = async (f) => { const b = await fs.readFile(f); const u = b.toString('utf8'); return u.includes('�') ? b.toString('latin1') : u; }; // les NFO anciens sont en CP437/latin1

/** NFO d'une release terminée : un .nfo dans ses fichiers, sinon `nfoDir`, sinon le MediaInfo du plus gros fichier vidéo (si `mediainfo` est installé). */
async function nfoFor(src, t) {
  const local = mapPath(src, t.content_path);
  let st; try { st = await fs.stat(local); } catch { throw new Error(`dossier introuvable pour ce script : ${local} (voir « pathMap » dans la configuration)`); }
  const files = st.isDirectory() ? await listFiles(local) : [local];
  const nfo = st.isDirectory() ? files.find((f) => /\.nfo$/i.test(f)) : local.replace(/\.[^.]+$/, '.nfo');
  for (const f of [nfo, src.nfoDir && path.join(path.resolve(baseDir, src.nfoDir), `${t.name}.nfo`)].filter(Boolean)) { try { return await readText(f); } catch { /* suivant */ } }
  if (src.mediainfo) {
    const sizes = await Promise.all(files.filter((f) => VIDEO.test(f)).map(async (f) => [f, (await fs.stat(f)).size]));
    const big = sizes.sort((a, b) => b[1] - a[1])[0]?.[0];
    if (big) {
      try {
        const { stdout } = await run(src.mediainfo === true ? 'mediainfo' : src.mediainfo, [big], { timeout: 120_000, maxBuffer: 5_000_000 });
        return stdout.replace(/^(Complete name\s*:\s*).*$/m, (_, a) => a + path.basename(big)); // ne pas publier le chemin de ton NAS
      } catch (e) { throw new Error(`mediainfo a échoué (${e.code === 'ENOENT' ? 'programme introuvable' : e.message})`); }
    }
  }
  return '';
}

async function qbitItems(src) {
  const q = await qbitFor(src);
  const list = await q.completed(src);
  return list.map((t) => ({
    key: `qbit:${t.hash}`, title: t.name, size: t.size ?? 0, pubDate: new Date((t.completion_on > 0 ? t.completion_on : t.added_on) * 1000), feedCategory: t.category ?? '',
    qbit: { src: src.name, hash: t.hash, savePath: t.save_path }, keepIfNoNfo: true, // pas d'abandon définitif : tu peux ajouter le NFO plus tard
    load: () => q.exportTorrent(t.hash),
    nfoText: () => nfoFor(src, t),
    afterUpload: () => q.addTags(t.hash, src.doneTag ?? 'seeduction-envoye'),
  }));
}

/** Torrents envoyés puis validés par le staff : on ajoute la version de Seeduction (avec ton passkey) dans qBittorrent, sur les MÊMES fichiers, pour seeder là-bas aussi. */
async function seedPass() {
  for (const v of Object.values(state.items)) {
    if (v.status !== 'uploaded' || !v.qbit || v.seeded || !v.id) continue;
    const src = (cfg.sources ?? []).find((x) => x.type === 'qbittorrent' && x.name === v.qbit.src);
    if (!src || src.seedOnSeeduction === false) continue;
    const res = await fetch(`${SITE}/api/public/torrents/${v.id}/file`, { headers: { 'x-api-key': API_KEY, 'user-agent': UA }, signal: AbortSignal.timeout(60_000) });
    if (res.status === 409) { log(`⏳ ${v.name} — en attente de validation par le staff (le seed démarrera ensuite)`); continue; }
    if (res.status === 401 || res.status === 403) throw new Fatal(`Seed refusé (${res.status}) : clé sans la portée torrents:upload, ou compte désactivé`);
    if (res.status === 404) { log(`✗ ${v.name} — introuvable sur ton site (supprimé ?) : seed abandonné`); v.seeded = 'indisponible'; await saveState(); continue; }
    if (!res.ok) { log(`✗ ${v.name} — erreur ${res.status} en récupérant le .torrent`); continue; }
    if (DRY) { log(`(essai) ajouterait le torrent de Seeduction dans qBittorrent : ${v.name}`); continue; }
    try {
      await (await qbitFor(src)).add(Buffer.from(await res.arrayBuffer()), { savepath: v.qbit.savePath, category: src.seedCategory ?? 'seeduction', tags: 'seeduction', skipChecking: src.skipChecking !== false });
      v.seeded = true; v.seededAt = new Date().toISOString(); await saveState();
      log(`🌱 ${v.name} — ajouté dans qBittorrent pour seeder sur Seeduction`);
    } catch (e) { log(`✗ ${v.name} — ${e.message}`); }
  }
}

// ------------------------------------------------------------------ lecture des sources

const decode = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')); return m ? decode(m[1]).trim() : ''; };
const attr = (xml, tagName, a) => { const m = xml.match(new RegExp(`<${tagName}\\s[^>]*?${a}="([^"]*)"`, 'i')); return m ? decode(m[1]) : ''; };
const stripHtml = (s) => decode(s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/\n{3,}/g, '\n\n').trim();

function parseFeed(xml) {
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map(([item]) => {
    const torznab = {};
    for (const m of item.matchAll(/<(?:torznab|newznab):attr\s+name="([^"]+)"\s+value="([^"]*)"/gi)) torznab[m[1].toLowerCase()] = decode(m[2]);
    const link = tag(item, 'link');
    const enclosure = attr(item, 'enclosure', 'url');
    return {
      title: tag(item, 'title'),
      guid: tag(item, 'guid') || link || enclosure,
      torrentUrl: enclosure || link,
      size: Number(attr(item, 'enclosure', 'length')) || Number(torznab.size) || 0,
      description: tag(item, 'description'),
      pubDate: tag(item, 'pubDate') ? new Date(tag(item, 'pubDate')) : null,
      feedCategory: tag(item, 'category'),
      torznab,
    };
  });
}

async function fetchSource(url, headers) {
  const res = await fetch(url, { headers: { 'user-agent': UA, ...(headers ?? {}) }, signal: AbortSignal.timeout(60_000), redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url.replace(/([?&](?:key|apikey|passkey|token|auth)=)[^&]+/gi, '$1***')}`);
  return res;
}

/** Éléments d'une source : { key, title, load(): Buffer, nfoText(): string, size, pubDate, feedCategory } */
async function itemsOf(src) {
  if (src.type === 'qbittorrent') return qbitItems(src);
  if (src.type === 'folder') {
    const dir = path.resolve(baseDir, src.path);
    const files = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith('.torrent'));
    return Promise.all(files.map(async (f) => {
      const full = path.join(dir, f);
      const st = await fs.stat(full);
      const nfoPath = full.replace(/\.torrent$/i, '.nfo');
      return {
        key: `folder:${f}:${st.size}`, title: f.replace(/\.torrent$/i, ''), size: 0, pubDate: st.mtime, feedCategory: '',
        file: full,
        load: () => fs.readFile(full),
        nfoText: async () => { try { return await fs.readFile(nfoPath, 'utf8'); } catch { return ''; } },
      };
    }));
  }
  const xml = await (await fetchSource(src.url, src.headers)).text();
  return parseFeed(xml).filter((i) => i.title && i.torrentUrl).map((i) => ({
    ...i,
    key: `${src.name}:${i.guid}`,
    load: async () => Buffer.from(await (await fetchSource(i.torrentUrl, src.headers)).arrayBuffer()),
    nfoText: async () => {
      const mode = src.nfo ?? 'description';
      if (mode === 'description') return stripHtml(i.description);
      if (mode === 'url') {
        const u = String(src.nfoUrl ?? '').replace('{guid}', encodeURIComponent(i.guid)).replace('{title}', encodeURIComponent(i.title)).replace('{infohash}', i.torznab.infohash ?? '');
        return u ? await (await fetchSource(u, src.headers)).text() : '';
      }
      return '';
    },
  }));
}

// ------------------------------------------------------------------ règles

const rx = (list) => (list ?? []).map((p) => new RegExp(p, 'i'));
function accepted(src, it) {
  const inc = rx(src.include), exc = rx(src.exclude);
  if (inc.length && !inc.some((r) => r.test(it.title))) return 'ne correspond à aucun filtre « include »';
  if (exc.some((r) => r.test(it.title))) return 'exclu par un filtre « exclude »';
  if (src.maxAgeHours && it.pubDate && Date.now() - it.pubDate.getTime() > src.maxAgeHours * 3600_000) return 'trop ancien';
  if (src.minSizeGb && it.size && it.size < src.minSizeGb * 1e9) return 'trop petit';
  if (src.maxSizeGb && it.size && it.size > src.maxSizeGb * 1e9) return 'trop gros';
  return null;
}
function pickCategory(src, it) {
  for (const r of [...(src.categoryRules ?? []), ...(cfg.categoryRules ?? [])]) if (new RegExp(r.match, 'i').test(`${it.title} ${it.feedCategory}`)) return r.category;
  return src.category ?? cfg.defaultCategory ?? null;
}

// ------------------------------------------------------------------ envoi

async function upload(src, it, catName, nfo, buf) {
  const form = new FormData();
  form.set('torrentFile', new Blob([buf], { type: 'application/x-bittorrent' }), `${it.title.slice(0, 120).replace(/[^\w.-]+/g, '_')}.torrent`);
  form.set('name', it.title);
  form.set('categoryId', categoryId(catName));
  form.set('nfo', nfo);
  const desc = (src.description ?? cfg.description ?? '').replace('{source}', src.name);
  if (desc) form.set('description', desc);
  return site('/public/torrents', { method: 'POST', body: form });
}

/** Aide à la configuration : ce que la source donne vraiment (le NFO est-il fourni ? où ?). Rien n'est envoyé. */
async function inspect() {
  for (const src of cfg.sources ?? []) {
    let items;
    try { items = await itemsOf(src); } catch (e) { console.log(`✗ « ${src.name} » : ${e.message}`); continue; }
    console.log(`
« ${src.name} » (${src.type}) : ${items.length} élément(s)`);
    for (const it of items.slice(0, 3)) {
      let nfo = '', err = '';
      try { nfo = await it.nfoText(); } catch (e) { err = e.message; }
      console.log(`  • ${it.title}`);
      console.log(`      taille : ${it.size ? (it.size / 1e9).toFixed(2) + ' Go' : 'inconnue'} · catégorie source : ${it.feedCategory || '—'} · date : ${it.pubDate?.toISOString?.() ?? '—'}`);
      if (it.qbit) console.log(`      dossier (vu par qBittorrent) : ${it.qbit.savePath}`);
      console.log(`      NFO : ${nfo.replace(/\s+/g, ' ').length >= 20 ? 'trouvé (' + nfo.length + ' caractères)' : 'ABSENT' + (err ? ' — ' + err : '') + ' → cette release serait mise de côté'}`);
    }
  }
}

const warned = new Set();
async function runOnce() {
  await loadCategories();
  try { await seedPass(); } catch (e) { if (e instanceof Fatal) throw e; log(`✗ Seed sur Seeduction : ${e.message}`); }
  if (flag('retry-skipped')) for (const [k, v] of Object.entries(state.items)) if (v.status === 'skipped') delete state.items[k];
  let sent = 0, seen = 0, skipped = 0;

  outer: for (const src of cfg.sources ?? []) {
    let items;
    try { items = await itemsOf(src); } catch (e) { log(`✗ Source « ${src.name} » illisible : ${e.message}`); continue; }
    // Les plus anciens d'abord : l'ordre d'arrivée sur ton site suit celui de la source.
    items.sort((a, b) => (a.pubDate?.getTime() ?? 0) - (b.pubDate?.getTime() ?? 0));
    log(`« ${src.name} » : ${items.length} élément(s) lu(s)`);

    for (const it of items) {
      if (state.items[it.key]) { seen++; continue; }
      const why = accepted(src, it);
      if (why) { mark(it.key, 'skipped', { name: it.title, why }); skipped++; continue; }
      const catName = pickCategory(src, it);
      if (!catName || !categoryId(catName)) {
        log(`⚠ ${it.title} — catégorie « ${catName ?? 'aucune'} » introuvable sur ton site (voir --list-categories) : mis de côté`);
        mark(it.key, 'skipped', { name: it.title, why: `catégorie introuvable : ${catName}` }); skipped++; continue;
      }
      if (sent >= MAX_PER_RUN) { log(`Limite de ${MAX_PER_RUN} envoi(s) par passe atteinte : la suite à la prochaine passe.`); break outer; }

      let buf, nfo;
      try {
        buf = await it.load();
        if (!buf.length || buf[0] !== 0x64) throw new Error("le fichier téléchargé n'est pas un .torrent (page de connexion ? accès refusé ?)");
        nfo = (await it.nfoText()).trim();
      } catch (e) { log(`✗ ${it.title} — ${e.message}`); continue; } // erreur temporaire : on réessaiera à la prochaine passe
      if (nfo.replace(/\s+/g, ' ').length < 20) {
        if (it.keepIfNoNfo) { if (!warned.has(it.key)) { warned.add(it.key); log(`⏭ ${it.title} — NFO / MediaInfo introuvable (obligatoire) : ajoute un .nfo dans le dossier de la release (ou installe mediainfo) ; il sera pris à la prochaine passe`); } skipped++; continue; }
        log(`⏭ ${it.title} — NFO / MediaInfo introuvable (obligatoire sur ton site) : mis de côté`);
        mark(it.key, 'skipped', { name: it.title, why: 'NFO manquant' }); skipped++; continue;
      }
      if (DRY) { log(`(essai) enverrait : ${it.title} → ${catName}`); sent++; continue; }

      const r = await upload(src, it, catName, nfo, buf);
      if (r.status === 201 || r.status === 200) {
        log(`✓ ${it.title} → ${catName} (${r.body?.status ?? 'envoyé'})`);
        mark(it.key, 'uploaded', { name: it.title, id: r.body?.id, ...(it.qbit ? { qbit: it.qbit } : {}) }); sent++;
        if (it.afterUpload) { try { await it.afterUpload(); } catch { /* l'étiquette est facultative */ } }
      } else if (r.status === 400 && /dupe|existe déjà/i.test(r.body?.message ?? '')) {
        log(`= ${it.title} — déjà sur ton site`); mark(it.key, 'dupe', { name: it.title });
      } else if (r.status === 400) {
        log(`✗ ${it.title} — refusé : ${r.body?.message ?? r.status}`); mark(it.key, 'rejected', { name: it.title, why: r.body?.message });
      } else if (r.status === 401 || r.status === 403) {
        throw new Fatal(`Envoi refusé (${r.status}) : ${r.body?.message ?? 'clé sans la portée torrents:upload ?'}`);
      } else if (r.status === 429) {
        log('Trop de requêtes pour le site : pause, on reprend à la prochaine passe.'); await saveState(); return;
      } else {
        log(`✗ ${it.title} — erreur ${r.status}`); // temporaire : réessayé plus tard
      }
      await saveState();
      if (DELAY_MS) await sleep(DELAY_MS);
    }
  }
  await saveState();
  log(`Passe terminée : ${sent} ${DRY ? 'à envoyer' : 'envoyé(s)'}, ${seen} déjà traité(s), ${skipped} mis de côté.`);
}

// ------------------------------------------------------------------ main

try {
  if (flag('list-categories')) {
    await loadCategories();
    for (const c of categories) console.log(c.path);
    process.exit(0);
  }
  if (flag('inspect')) { await inspect(); process.exit(0); }
  do {
    try { await runOnce(); }
    catch (e) { if (e instanceof Fatal) throw e; log(`✗ Passe échouée : ${e.message}`); }
    if (flag('watch')) await sleep(Math.max(1, Number(cfg.intervalMinutes ?? 15)) * 60_000);
  } while (flag('watch'));
} catch (e) {
  console.error(e instanceof Fatal ? `Arrêt : ${e.message}` : /fetch failed/.test(String(e?.message)) ? `Arrêt : impossible de joindre ton site (${SITE}). Vérifie l'adresse « site » dans config.json, et que le site est bien à jour (git pull && ./deploy.sh).` : e);
  process.exit(1);
}
