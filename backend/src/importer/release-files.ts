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

/** Dossier de qBittorrent -> dossier FTP équivalent, appris au fil des releases (par source). */
const memory = new Map<string, string>();

/** Retrouve sur le FTP le dossier (ou fichier) d'une release, même si son chemin FTP n'a rien à voir avec celui de qBittorrent. */
async function locate(c: Client, cfg: ImportConfig, memKey: string, t: QbitTorrent) {
  const cp = String(t.content_path).replace(/\\/g, '/');
  const name = path.posix.basename(cp);
  const parentQ = path.posix.dirname(cp);
  const has = async (dir: string) => { try { return (await c.list(dir)).find((e) => e.name === name) ?? null; } catch { return null; } };
  const known = memory.get(memKey + '|' + parentQ);
  for (const dir of [known, parentQ].filter((x): x is string => !!x)) {
    const e = await has(dir);
    if (e) { memory.set(memKey + '|' + parentQ, dir); return { dir: dir === '/' ? '' : dir, entry: e }; }
  }
  const queue: [string, number][] = [['/', 0]];
  const deadline = Date.now() + 20_000;
  let lists = 0;
  while (queue.length && lists < 80 && Date.now() < deadline) { // recherche bornée : un gros arbre de dossiers ne doit pas tout bloquer
    lists++;
    const [dir, depth] = queue.shift()!;
    let list: Awaited<ReturnType<Client['list']>> = [];
    try { list = await c.list(dir); } catch { continue; }
    const hit = list.find((e) => e.name === name);
    if (hit) { memory.set(memKey + '|' + parentQ, dir); return { dir: dir === '/' ? '' : dir, entry: hit }; }
    if (depth < Math.max(6, cfg.ftp?.searchDepth ?? 6)) { // les sources enregistrées avec l'ancienne profondeur (3) cherchent aussi en profondeur
      // les dossiers qui portent le même nom qu'un dossier du chemin qBittorrent (« completed », « torrents »...) sont explorés d'abord
      const same = new Set(parentQ.split('/').filter(Boolean).map((x) => x.toLowerCase()));
      const dirs = list.filter((e) => e.isDirectory).sort((a, b) => Number(same.has(b.name.toLowerCase())) - Number(same.has(a.name.toLowerCase())));
      const first = dirs.filter((e) => same.has(e.name.toLowerCase())), rest = dirs.filter((e) => !same.has(e.name.toLowerCase()));
      queue.unshift(...first.map((e) => [path.posix.join(dir, e.name), depth + 1] as [string, number]));
      queue.push(...rest.map((e) => [path.posix.join(dir, e.name), depth + 1] as [string, number]));
    }
  }
  return null;
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
    const found = await locate(c, cfg, memKey, t);
    if (!found) throw new Error(`release introuvable sur le serveur FTP : ${t.name} (dossier accessible à ce compte ? essaie d'augmenter la profondeur de recherche)`);
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
