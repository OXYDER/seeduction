import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { Writable } from 'stream';
import { Client } from 'basic-ftp';
import type { ImportConfig, ImportSecrets } from './importer.types';
import type { QbitTorrent } from './qbit.client';

const run = promisify(execFile);
const VIDEO = /\.(mkv|mp4|avi|ts|m2ts|mov|wmv|mpg|mpeg|iso)$/i;
const longEnough = (s: string) => s.replace(/\s+/g, ' ').trim().length >= 20;

const gib = (n: number) => (n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(2) + ' GiB' : (n / 1024 ** 2).toFixed(1) + ' MiB');

/**
 * Le rapport MediaInfo d'un fichier dont on n'a lu que le début : on remet le vrai nom et la vraie taille, et on retire les valeurs
 * calculées à partir de la taille lue (débit global, taille des pistes), qui seraient fausses.
 */
export function cleanPartialMediainfo(out: string, realName: string, realSize: number): string {
  if (!/^(Video|Audio)\b/m.test(out)) throw new Error("MediaInfo n'a rien reconnu dans le début du fichier (format non pris en charge pour une lecture partielle)");
  return out
    .replace(/^(Complete name\s*:\s*).*$/m, (_m, a) => a + realName)
    .replace(/^(File size\s*:\s*).*$/m, (_m, a) => a + gib(realSize))
    .split(/\r?\n/)
    .filter((l) => !/^(Overall bit rate|Stream size)\b/.test(l))
    .join('\n');
}

async function mediainfoOf(file: string): Promise<string> {
  try {
    const bin = process.env.MEDIAINFO_BIN || 'mediainfo'; // MEDIAINFO_BIN peut aussi être une liste JSON ["programme", "argument"] (tests)
    const cmd: string[] = bin.startsWith('[') ? JSON.parse(bin) : [bin];
    return (await run(cmd[0], [...cmd.slice(1), file], { timeout: 120_000, maxBuffer: 5_000_000 })).stdout;
  } catch (e: any) {
    throw new Error(`mediainfo a échoué (${e.code === 'ENOENT' ? 'programme introuvable sur le serveur' : e.message})`);
  }
}

/** Message lisible pour un échec FTP (délai, identifiants, chiffrement, adresse). */
function ftpFriendly(e: any, f: NonNullable<ImportConfig['ftp']>): string {
  const msg = String(e?.message ?? e);
  const code = e?.code ?? e?.cause?.code ?? '';
  if (/timeout|timed out/i.test(msg) || code === 'ETIMEDOUT') return `le FTP ${f.host}:${f.port ?? 21} ne répond pas (délai dépassé) : vérifie l'hôte et le port${f.secure !== false ? ", ou décoche « FTP sur TLS »" : ", ou coche « FTP sur TLS »"}`;
  if (code === 'ENOTFOUND') return `hôte FTP introuvable : ${f.host}`;
  if (code === 'ECONNREFUSED') return `connexion FTP refusée sur ${f.host}:${f.port ?? 21} (port fermé ? Pure-FTPd démarré chez l'hébergeur ?)`;
  if (/\b530\b|login|authentication failed|incorrect/i.test(msg)) return `identifiant ou mot de passe FTP refusé (530) : vérifie-les dans AppBox Manager, ligne Pure-FTPd`;
  if (/ssl|tls|handshake|wrong version|certificate|self[- ]signed/i.test(msg)) return `échec de la connexion FTP chiffrée (${msg.slice(0, 80)}) : essaie en décochant « FTP sur TLS »`;
  if (/\b(421|425|426|500|502|503|504|550)\b/.test(msg)) return `le serveur FTP a répondu : ${msg.slice(0, 120)}`;
  return `erreur FTP : ${msg.slice(0, 140)}`;
}

export class FtpConnectError extends Error {}

export async function ftpConnect(cfg: ImportConfig, secrets: ImportSecrets): Promise<Client> {
  const f = cfg.ftp!;
  const c = new Client(20_000); // 20 s par commande : un FTP qui ne répond pas ne doit pas bloquer des minutes
  try {
    await c.access({ host: f.host, port: f.port ?? 21, user: f.username, password: secrets.ftpPassword ?? '', secure: f.secure ?? true, secureOptions: { rejectUnauthorized: f.rejectUnauthorized !== false } });
  } catch (e) {
    try { c.close(); } catch { /* ignoré */ }
    throw new FtpConnectError(ftpFriendly(e, f));
  }
  return c;
}

type Entry = Awaited<ReturnType<Client['list']>>[number];

// ------------------------------------------------------------------ recherche d'une release sur le FTP (sans profondeur fixée)
//
// Le chemin vu par qBittorrent (« /home/user/downloads/Films/Release ») n'a souvent rien à voir avec celui du FTP (« /downloads/Films/Release »
// ou « /apps/xxx/torrents/completed/Release »). On ne compte donc pas de niveaux : on cherche dans cet ordre, en s'arrêtant au premier succès.
//  1) la correspondance déjà apprise sur une autre release du même client (préfixe qBittorrent -> préfixe FTP) : une seule lecture ;
//  2) le chemin qBittorrent raccourci par la gauche, du plus long au plus court (le FTP est souvent « enraciné » plus bas) ;
//  3) une exploration « meilleur d'abord » de l'arbre FTP, sans limite de profondeur mais bornée en lectures et en temps : les dossiers dont le
//     nom apparaît dans le chemin qBittorrent (ou classiques : downloads, completed...) passent en premier, ceux qui n'ont rien à y faire (incomplete,
//     watch, config, tmp...) en dernier ; dès qu'un dossier porte le nom d'un niveau du chemin qBittorrent, on suit directement la suite du chemin.
// Chaque dossier lu est gardé quelques minutes en mémoire : pour 100 releases au même endroit, l'arbre n'est parcouru qu'une fois.

const LIST_TTL_MS = 3 * 60_000;
const LIST_CACHE_MAX = 3000;
const SEARCH_MAX_LISTS = 250;
const SEARCH_MAX_MS = 25_000;
const listCache = new Map<string, { at: number; list: Entry[] | null }>();
const mappings = new Map<string, { q: string; f: string }[]>();

export const flatName = (x: string) => x.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const parts = (p: string) => String(p).replace(/\\/g, '/').split('/').filter(Boolean);
const joinDir = (comps: string[]) => '/' + comps.join('/');
const COMMON_DIRS = new Set(['downloads', 'download', 'completed', 'complete', 'torrents', 'torrent', 'finished', 'seeding', 'seed', 'films', 'movies', 'series', 'tv', 'shows', 'data', 'files', 'apps', 'home', 'media']);
const JUNK_DIRS = new Set(['incomplete', 'incompletes', 'downloading', 'watch', 'config', 'configs', 'tmp', 'temp', 'cache', 'logs', 'log', 'eadir', 'lostfound', 'trash', 'recycle', 'backup', 'backups', 'session', 'sessions']);

/** Correspondance minimale entre un dossier qBittorrent et son équivalent FTP : on retire les niveaux finaux identiques, ce qui reste est le préfixe qui change. */
export function learnMapping(qDir: string, fDir: string): { q: string; f: string } {
  const q = parts(qDir), f = parts(fDir);
  let tail = 0;
  while (tail < q.length && tail < f.length && flatName(q[q.length - 1 - tail]) === flatName(f[f.length - 1 - tail])) tail++;
  return { q: q.length - tail ? joinDir(q.slice(0, q.length - tail)) : '', f: f.length - tail ? joinDir(f.slice(0, f.length - tail)) : '' };
}

/** Applique une correspondance apprise à un autre dossier qBittorrent (null si elle ne le concerne pas). */
export function applyMapping(m: { q: string; f: string }, qDir: string): string | null {
  const q = parts(qDir), mq = parts(m.q);
  if (mq.length > q.length || !mq.every((c, i) => flatName(c) === flatName(q[i]))) return null;
  return joinDir([...parts(m.f), ...q.slice(mq.length)]) || '/';
}

/** Ordre d'exploration : plus le score est haut, plus tôt le dossier est lu. */
export function dirScore(name: string, wanted: Set<string>, depth: number): number {
  const k = flatName(name);
  return (wanted.has(k) ? 100 : 0) + (COMMON_DIRS.has(k) ? 20 : 0) - (JUNK_DIRS.has(k) || name.startsWith('.') || name.startsWith('@') ? 60 : 0) - depth;
}

async function listCached(c: Client, memKey: string, dir: string, fresh: boolean, stats: { listed: number }): Promise<Entry[] | null> {
  const key = memKey + '|' + dir;
  const hit = listCache.get(key);
  if (hit && !fresh && Date.now() - hit.at < LIST_TTL_MS) return hit.list;
  stats.listed++;
  let list: Entry[] | null;
  try { list = await c.list(dir || '/'); } catch { list = null; }
  if (listCache.size >= LIST_CACHE_MAX) listCache.delete(listCache.keys().next().value as string);
  listCache.set(key, { at: Date.now(), list });
  return list;
}

/** Retrouve sur le FTP le dossier (ou fichier) d'une release, même si son chemin FTP n'a rien à voir avec celui de qBittorrent. */
async function locate(c: Client, cfg: ImportConfig, memKey: string, t: QbitTorrent) {
  const cp = String(t.content_path).replace(/\\/g, '/');
  const name = path.posix.basename(cp);
  const comps = parts(path.posix.dirname(cp));
  const parentQ = comps.length ? joinDir(comps) : '/';
  // Le nom du dossier sur le FTP peut différer de celui du torrent par les espaces / points, les accents (NFC / NFD) ou la casse : comparaison « aplatie ».
  const wanted = flatName(name);
  const same = (entryName: string) => entryName === name || (wanted.length >= 8 && flatName(entryName) === wanted);
  const wantedDirs = new Set([...comps.map(flatName), flatName(t.category ?? '')].filter((k) => k.length >= 2));
  const compIndex = new Map(comps.map((x, i) => [flatName(x), i]));
  const started = Date.now();
  const stats = { listed: 0 };
  const expired = () => stats.listed >= SEARCH_MAX_LISTS || Date.now() - started > SEARCH_MAX_MS;
  const softDepth = Math.max(12, cfg.ftp?.searchDepth ?? 0); // garde-fou contre les boucles de liens, pas une limite de recherche
  const learn = (dir: string) => {
    const m = learnMapping(parentQ, dir);
    const list = mappings.get(memKey) ?? [];
    if (!list.some((x) => x.q === m.q && x.f === m.f)) mappings.set(memKey, [m, ...list].slice(0, 20));
  };

  const attempt = async (fresh: boolean) => {
    const has = async (dir: string) => { const l = await listCached(c, memKey, dir, fresh, stats); const e = l?.find((x) => same(x.name)); return e ? { dir: dir === '/' ? '' : dir, entry: e } : null; };
    const ok = (r: { dir: string; entry: Entry } | null) => { if (r) learn(r.dir || '/'); return r; };
    // 1) correspondance déjà apprise
    for (const m of mappings.get(memKey) ?? []) { const d = applyMapping(m, parentQ); if (d !== null) { const r = ok(await has(d)); if (r) return r; } }
    // 2) chemin qBittorrent raccourci par la gauche (du plus long au plus court, puis la racine)
    for (let i = 0; i <= comps.length && !expired(); i++) { const r = ok(await has(i === comps.length ? '/' : joinDir(comps.slice(i)))); if (r) return r; }
    // 3) exploration meilleur d'abord
    const queue: { dir: string; depth: number; score: number }[] = [{ dir: '/', depth: 0, score: 0 }];
    const seen = new Set<string>();
    while (queue.length && !expired()) {
      queue.sort((a, b) => b.score - a.score);
      const { dir, depth } = queue.shift()!;
      if (seen.has(dir)) continue;
      seen.add(dir);
      const list = await listCached(c, memKey, dir, fresh, stats);
      if (!list) continue;
      const hit = list.find((e) => same(e.name));
      if (hit) return ok({ dir: dir === '/' ? '' : dir, entry: hit });
      for (const e of list.filter((x) => x.isDirectory)) {
        const full = path.posix.join(dir, e.name);
        const idx = compIndex.get(flatName(e.name));
        if (idx !== undefined) { // ce dossier porte le nom d'un niveau du chemin qBittorrent : on suit directement la suite
          let cur = full, okChain = true;
          for (const next of comps.slice(idx + 1)) {
            const l = await listCached(c, memKey, cur, fresh, stats);
            const sub = l?.find((x) => x.isDirectory && flatName(x.name) === flatName(next));
            if (!sub) { okChain = false; break; }
            cur = path.posix.join(cur, sub.name);
          }
          if (okChain) { const r = ok(await has(cur)); if (r) return r; }
        }
        if (depth < softDepth) queue.push({ dir: full, depth: depth + 1, score: dirScore(e.name, wantedDirs, depth + 1) });
      }
    }
    return null;
  };

  let hit = await attempt(false);
  if (!hit && !expired()) hit = await attempt(true); // le dossier a pu apparaître depuis la mise en mémoire des listes
  return { hit, listed: stats.listed };
}

async function listFiles(c: Client, dir: string, depth = 2): Promise<{ path: string; name: string; size: number }[]> {
  const out: { path: string; name: string; size: number }[] = [];
  let list: Awaited<ReturnType<Client['list']>> = [];
  try { list = await c.list(dir); } catch { return out; }
  for (const e of list) {
    const full = path.posix.join(dir, e.name);
    if (e.isDirectory && depth > 0) out.push(...(await listFiles(c, full, depth - 1)));
    else if (e.isFile) out.push({ path: full, name: e.name, size: e.size });
  }
  return out;
}

async function readAll(c: Client, remote: string, max = 300_000): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let got = 0;
  await c.downloadTo(new Writable({ write(chunk: Buffer, _e, cb) { if (got < max) chunks.push(chunk); got += chunk.length; cb(); } }), remote);
  return Buffer.concat(chunks).subarray(0, max);
}

/** Télécharge au plus `max` octets du début d'un fichier distant, puis coupe le transfert. */
async function readHead(cfg: ImportConfig, secrets: ImportSecrets, remote: string, max: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let got = 0;
  const c = await ftpConnect(cfg, secrets);
  try {
    const sink = new Writable({
      write(chunk: Buffer, _e, cb) {
        if (got < max) { chunks.push(chunk.subarray(0, max - got)); got += chunk.length; }
        if (got >= max) { cb(); setImmediate(() => c.close()); } else cb();
      },
    });
    try { await c.downloadTo(sink, remote); } catch (e) { if (got < max) throw e; } // la coupure volontaire fait échouer le transfert : sans importance
  } finally {
    try { c.close(); } catch { /* déjà fermé */ }
  }
  return Buffer.concat(chunks).subarray(0, max);
}

/** Dossier de la release sur le FTP : son .nfo (texte lu) et sa plus grosse vidéo. Aucune vidéo n'est téléchargée. */
async function scan(cfg: ImportConfig, secrets: ImportSecrets, memKey: string, t: QbitTorrent) {
  const c = await ftpConnect(cfg, secrets);
  let nfo: string | null = null;
  let video: { path: string; name: string; size: number } | null = null;
  try {
    const { hit: found, listed } = await locate(c, cfg, memKey, t);
    if (!found) throw new Error(`release introuvable sur le serveur FTP : ${t.name} (${listed} dossier(s) parcouru(s) : ce compte FTP voit-il bien ce dossier ?)`);
    const base = path.posix.join(found.dir, found.entry.name);
    const files = found.entry.isDirectory ? await listFiles(c, base) : [{ path: base, name: found.entry.name, size: found.entry.size }];
    const nfoFile = files.find((f) => /\.nfo$/i.test(f.name));
    if (nfoFile) {
      const raw = await readAll(c, nfoFile.path);
      const u = raw.toString('utf8');
      nfo = u.includes('\uFFFD') ? raw.toString('latin1') : u; // les NFO anciens sont en CP437 / latin1
    }
    if (!nfo || !longEnough(nfo)) { nfo = null; video = files.filter((f) => VIDEO.test(f.name)).sort((a, b) => b.size - a.size)[0] ?? null; }
  } finally {
    try { c.close(); } catch { /* déjà fermé */ }
  }
  return { nfo, video };
}

/** Lit un petit fichier du FTP (le .torrent d'un client qui ne sait pas l'exporter) : il est retrouvé par son nom, où qu'il soit sur le FTP. */
export async function readFileViaFtp(cfg: ImportConfig, secrets: ImportSecrets, memKey: string, file: { name: string; content_path: string }, max = 5_000_000): Promise<Buffer> {
  if (!cfg.ftp) throw new Error('aucun FTP configuré');
  const c = await ftpConnect(cfg, secrets);
  try {
    const { hit, listed } = await locate(c, cfg, memKey, { hash: '', name: file.name, size: 0, category: '', save_path: '', content_path: file.content_path, completion_on: 0, added_on: 0 });
    if (!hit || hit.entry.isDirectory) throw new Error(`fichier ${file.name} introuvable sur le FTP (${listed} dossier(s) parcouru(s)) : le dossier de configuration du client n'est pas accessible avec ce compte FTP`);
    return await readAll(c, path.posix.join(hit.dir, hit.entry.name), max);
  } finally {
    try { c.close(); } catch { /* déjà fermé */ }
  }
}

/** Pour le test : où est le NFO ? (.nfo trouvé, vidéo dont le MediaInfo sera calculé à l'import, ou rien). Rapide : rien n'est téléchargé. */
export async function probeFor(cfg: ImportConfig, secrets: ImportSecrets, memKey: string, t: QbitTorrent): Promise<{ source: 'NFO' | 'VIDEO' | 'NONE'; nfo?: string; videoName?: string }> {
  if (!cfg.ftp) return { source: 'NONE' };
  const { nfo, video } = await scan(cfg, secrets, memKey, t);
  if (nfo) return { source: 'NFO', nfo };
  if (video && cfg.mediainfo) return { source: 'VIDEO', videoName: video.name };
  return { source: 'NONE' };
}

/** NFO d'une release qui est sur la seedbox : son .nfo, sinon le MediaInfo du début de la vidéo. Aucune vidéo n'est téléchargée en entier. */
export async function nfoFor(cfg: ImportConfig, secrets: ImportSecrets, memKey: string, t: QbitTorrent): Promise<string> {
  if (!cfg.ftp) return '';
  const { nfo, video } = await scan(cfg, secrets, memKey, t);
  if (nfo) return nfo;
  if (!video || !cfg.mediainfo) return '';
  const head = await readHead(cfg, secrets, video.path, (cfg.ftp.headMB ?? 16) * 1024 * 1024);
  const tmp = path.join(os.tmpdir(), `seeduction-${t.hash.slice(0, 8)}-${path.posix.basename(video.path).replace(/[^\w.-]+/g, '_')}`);
  await fs.writeFile(tmp, head);
  try { return cleanPartialMediainfo(await mediainfoOf(tmp), video.name, video.size); }
  finally { await fs.rm(tmp, { force: true }); }
}

export const hasNfo = longEnough;
