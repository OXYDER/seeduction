import * as path from 'path';
import { netCause, Qbit, QbitTorrent } from './qbit.client';

/**
 * Clients torrent que le membre peut connecter (envoi de plusieurs torrents). qBittorrent est le client de référence ; Transmission et
 * ruTorrent (rTorrent) sont en BÊTA : écrits d'après leur documentation et testés contre de faux serveurs, pas encore contre de vrais clients.
 */
export type ClientKind = 'qbittorrent' | 'transmission' | 'rutorrent';
export const CLIENT_KINDS: ClientKind[] = ['qbittorrent', 'transmission', 'rutorrent'];
export const CLIENT_LABEL: Record<ClientKind, string> = { qbittorrent: 'qBittorrent', transmission: 'Transmission', rutorrent: 'ruTorrent' };

export interface TorrentClient {
  login(): Promise<void>;
  /** Releases terminées (même forme que qBittorrent : chemin du contenu, dossier, catégorie / étiquette). */
  completed(filter: { category?: string; tag?: string }): Promise<QbitTorrent[]>;
  /** Le .torrent d'origine. Peut lever NeedsFileAccess : le client ne sait pas l'exporter, le site va alors le lire sur le FTP. */
  exportTorrent(hash: string): Promise<Buffer>;
  /** Ajoute le torrent sur les fichiers déjà présents. `skipChecking` n'est respecté que par qBittorrent (les autres vérifient les fichiers à l'ajout). */
  add(buf: Buffer, o: { savepath: string; category?: string; tags?: string; skipChecking?: boolean }): Promise<void>;
  ensureCategory(category: string): Promise<void>;
}

/** Le client ne peut pas donner le .torrent : on sait où il est sur le disque du membre, le site va le chercher par FTP. */
export class NeedsFileAccess extends Error {
  constructor(public hint: { name: string; content_path: string }, message: string) { super(message); }
}

const posix = path.posix;
const basic = (u?: string, p?: string): Record<string, string> => (u ? { authorization: 'Basic ' + Buffer.from(`${u}:${p ?? ''}`).toString('base64') } : {});

// ------------------------------------------------------------------ Transmission (RPC JSON)

/** « https://hote:9091 », « …/transmission » ou « …/transmission/rpc » : tous mènent à l'adresse du RPC. */
export function transmissionRpcUrl(raw: string): string {
  const u = new URL(String(raw).trim());
  const p = u.pathname.replace(/\/+$/, '');
  u.pathname = /\/rpc$/i.test(p) ? p : /\/transmission$/i.test(p) ? p + '/rpc' : (p || '') + '/transmission/rpc';
  return u.toString();
}

export class TransmissionClient implements TorrentClient {
  private sid = '';
  private url: string;
  constructor(url: string, private user?: string, private pass?: string, private strict = false) { this.url = transmissionRpcUrl(url); }

  private async rpc(method: string, args: Record<string, unknown> = {}, retry = true): Promise<any> {
    let res: Response;
    try {
      res = await fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...basic(this.user, this.pass), ...(this.sid ? { 'x-transmission-session-id': this.sid } : {}) },
        body: JSON.stringify({ method, arguments: args }),
        signal: AbortSignal.timeout(60_000),
        redirect: this.strict ? 'manual' : 'follow',
      });
    } catch (e) { throw new Error(`Transmission injoignable (${this.url}) : ${netCause(e)}`); }
    if (res.status === 409) { // protection CSRF : le serveur donne l'identifiant de session à renvoyer
      this.sid = res.headers.get('x-transmission-session-id') ?? '';
      if (retry && this.sid) return this.rpc(method, args, false);
    }
    if (res.status === 401) throw new Error('Transmission a refusé la connexion : identifiant ou mot de passe incorrect');
    if (res.status === 403 || res.status === 421) throw new Error(`Transmission a refusé la connexion (${res.status}) : l'adresse du site n'est peut-être pas autorisée (rpc-host-whitelist / rpc-whitelist)`);
    if (res.status === 404) throw new Error(`cette adresse n'est pas le RPC de Transmission (404) : ${this.url}`);
    if (res.status >= 300 && res.status < 400) throw new Error(`Transmission redirige vers une autre adresse (${res.status}) : vérifie l'adresse (https:// ? chemin ?)`);
    let json: any;
    try { json = await res.json(); } catch { throw new Error(`réponse inattendue de ${this.url} (HTTP ${res.status}) : est-ce bien le RPC de Transmission ?`); }
    if (json?.result !== 'success') throw new Error(`Transmission : ${json?.result ?? 'erreur inconnue'}`);
    return json.arguments ?? {};
  }

  async login() { await this.rpc('session-get'); }

  async completed(filter: { category?: string; tag?: string }): Promise<QbitTorrent[]> {
    const r = await this.rpc('torrent-get', { fields: ['hashString', 'name', 'totalSize', 'percentDone', 'downloadDir', 'labels', 'doneDate', 'addedDate'] });
    const out: QbitTorrent[] = [];
    for (const t of r.torrents ?? []) {
      if (!(t.percentDone >= 1)) continue;
      const labels: string[] = Array.isArray(t.labels) ? t.labels.map(String) : [];
      if (filter.category && !labels.some((l) => l.toLowerCase() === filter.category!.toLowerCase())) continue;
      if (filter.tag && !labels.some((l) => l.toLowerCase() === filter.tag!.toLowerCase())) continue;
      const dir = String(t.downloadDir ?? '').replace(/\\/g, '/').replace(/\/+$/, '');
      out.push({ hash: String(t.hashString).toLowerCase(), name: String(t.name), size: Number(t.totalSize) || 0, category: labels[0] ?? '', save_path: dir, content_path: `${dir}/${t.name}`, completion_on: Number(t.doneDate) || 0, added_on: Number(t.addedDate) || 0 });
    }
    return out;
  }

  async exportTorrent(hash: string): Promise<Buffer> {
    // Le RPC de Transmission n'envoie pas le fichier .torrent : on connaît son emplacement sur le disque du membre, le site le lira par FTP.
    const r = await this.rpc('torrent-get', { ids: [hash], fields: ['name', 'hashString', 'torrentFile'] });
    const t = r.torrents?.[0];
    if (!t) throw new Error('torrent introuvable dans Transmission');
    const file = String(t.torrentFile ?? '').replace(/\\/g, '/') || `/torrents/${t.name}.${String(t.hashString).slice(0, 16)}.torrent`; // nom habituel : <nom>.<16 premiers caractères de l'empreinte>.torrent
    throw new NeedsFileAccess({ name: posix.basename(file), content_path: file }, `Transmission n'exporte pas le .torrent : lecture par FTP de ${posix.basename(file)}`);
  }

  async add(buf: Buffer, o: { savepath: string; category?: string }) {
    const r = await this.rpc('torrent-add', { metainfo: buf.toString('base64'), 'download-dir': o.savepath, paused: false, ...(o.category ? { labels: [o.category] } : {}) });
    if (!r['torrent-added'] && !r['torrent-duplicate']) throw new Error("Transmission n'a pas ajouté le torrent");
  }

  async ensureCategory() { /* les étiquettes de Transmission n'ont pas besoin d'être créées */ }
}

// ------------------------------------------------------------------ ruTorrent (rTorrent par XML-RPC, via le greffon httprpc)

export type XmlArg = string | { base64: Buffer };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export function xmlRpcCall(method: string, args: XmlArg[]): string {
  const params = args.map((a) => `<param><value>${typeof a === 'string' ? `<string>${esc(a)}</string>` : `<base64>${a.base64.toString('base64')}</base64>`}</value></param>`).join('');
  return `<?xml version="1.0"?><methodCall><methodName>${method}</methodName><params>${params}</params></methodCall>`;
}

/** Lit une réponse XML-RPC (chaînes, nombres, booléens, tableaux, structures). Lève une erreur sur un « fault ». */
export function parseXmlRpc(xml: string): any {
  const fault = xml.match(/<fault>[\s\S]*?<name>faultString<\/name>\s*<value>(?:<string>)?([\s\S]*?)(?:<\/string>)?<\/value>/);
  if (fault) throw new Error(`rTorrent : ${unesc(fault[1]).trim() || 'erreur'}`);
  if (/<fault>/.test(xml)) throw new Error('rTorrent : erreur');
  const tokens = xml.match(/<[^>]+>|[^<]+/g) ?? [];
  let i = tokens.findIndex((t) => t === '<value>' || t === '<value/>');
  if (i < 0) throw new Error('réponse XML-RPC vide ou illisible');
  const text = () => (tokens[i] !== undefined && !tokens[i].startsWith('<') ? unesc(tokens[i++]) : '');
  const skipSpace = () => { while (tokens[i] !== undefined && !tokens[i].startsWith('<') && !tokens[i].trim()) i++; };
  const value = (): any => {
    if (tokens[i] === '<value/>') { i++; return ''; }
    i++; // <value>
    let v: any;
    const t = tokens[i];
    if (t === undefined) return '';
    if (t === '</value>') { i++; return ''; }
    if (!t.startsWith('<')) { v = unesc(t); i++; }
    else if (/^<(string|base64|dateTime\.iso8601)\/>$/.test(t)) { i++; v = ''; }
    else if (t === '<string>' || t === '<base64>' || t === '<dateTime.iso8601>') { i++; v = text(); i++; }
    else if (/^<(i4|i8|int|double)>$/.test(t)) { i++; v = Number(text()); i++; }
    else if (t === '<boolean>') { i++; v = text().trim() === '1'; i++; }
    else if (t === '<nil/>') { i++; v = null; }
    else if (t === '<array>') {
      i++; skipSpace();
      if (tokens[i] === '<data>') i++;
      v = [];
      while (tokens[i] !== undefined && tokens[i] !== '</data>') { if (tokens[i] === '<value>' || tokens[i] === '<value/>') v.push(value()); else i++; }
      i++; skipSpace(); if (tokens[i] === '</array>') i++;
    } else if (t === '<struct>') {
      i++; v = {};
      while (tokens[i] !== undefined && tokens[i] !== '</struct>') {
        if (tokens[i] === '<member>') {
          i++; skipSpace(); i++; const name = text(); i++; skipSpace(); // <name>…</name>
          v[name] = value(); skipSpace(); if (tokens[i] === '</member>') i++;
        } else i++;
      }
      i++;
    } else { i++; v = ''; }
    skipSpace(); if (tokens[i] === '</value>') i++;
    return v;
  };
  return value();
}

/** Valeur d'une commande rTorrent entre guillemets (espaces, virgules, guillemets dans un chemin ou une étiquette). */
const q = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export class RutorrentClient implements TorrentClient {
  private base: string;
  constructor(url: string, private user?: string, private pass?: string, private strict = false) {
    const u = new URL(String(url).trim());
    u.pathname = u.pathname.replace(/\/+$/, '').replace(/\/plugins\/httprpc\/action\.php$/i, '');
    this.base = u.toString().replace(/\/$/, '');
  }

  private async http(rel: string, init: RequestInit = {}): Promise<Response> {
    try {
      return await fetch(this.base + rel, { ...init, headers: { ...basic(this.user, this.pass), ...((init.headers as Record<string, string>) ?? {}) }, signal: AbortSignal.timeout(60_000), redirect: this.strict ? 'manual' : 'follow' });
    } catch (e) { throw new Error(`ruTorrent injoignable (${this.base}) : ${netCause(e)}`); }
  }

  private async call(method: string, args: XmlArg[] = []): Promise<any> {
    const res = await this.http('/plugins/httprpc/action.php', { method: 'POST', headers: { 'content-type': 'text/xml' }, body: xmlRpcCall(method, args) });
    if (res.status === 401) throw new Error('ruTorrent a refusé la connexion : identifiant ou mot de passe incorrect');
    if (res.status === 403) throw new Error('ruTorrent a refusé la connexion (403)');
    if (res.status === 404) throw new Error(`cette adresse n'est pas ruTorrent (404) : ${this.base}/plugins/httprpc/action.php (le greffon httprpc est-il activé ?)`);
    if (res.status >= 300 && res.status < 400) throw new Error(`ruTorrent redirige vers une autre adresse (${res.status}) : vérifie l'adresse (https:// ? chemin ?)`);
    if (!res.ok) throw new Error(`ruTorrent a répondu ${res.status}`);
    const body = await res.text();
    if (!/<methodResponse/.test(body)) throw new Error('réponse inattendue : est-ce bien l\'adresse de ruTorrent (greffon httprpc) ?');
    return parseXmlRpc(body);
  }

  async login() { await this.call('system.client_version'); }

  async completed(filter: { category?: string; tag?: string }): Promise<QbitTorrent[]> {
    const rows: any[][] = await this.call('d.multicall2', ['', 'main', 'd.hash=', 'd.name=', 'd.size_bytes=', 'd.complete=', 'd.base_path=', 'd.custom1=', 'd.timestamp.finished=', 'd.timestamp.started=']);
    const out: QbitTorrent[] = [];
    for (const r of rows ?? []) {
      const [hash, name, size, complete, basePath, custom1, finished, started] = r;
      if (Number(complete) !== 1) continue;
      let label = ''; try { label = decodeURIComponent(String(custom1 ?? '')); } catch { label = String(custom1 ?? ''); } // ruTorrent encode l'étiquette en URL
      if (filter.category && label.toLowerCase() !== filter.category.toLowerCase()) continue;
      if (filter.tag && label.toLowerCase() !== filter.tag.toLowerCase()) continue;
      const content = String(basePath ?? '').replace(/\\/g, '/');
      out.push({ hash: String(hash).toLowerCase(), name: String(name), size: Number(size) || 0, category: label, save_path: posix.dirname(content), content_path: content, completion_on: Number(finished) || 0, added_on: Number(started) || 0 });
    }
    return out;
  }

  async exportTorrent(hash: string): Promise<Buffer> {
    // 1) le greffon « source » de ruTorrent (s'il est activé) renvoie le .torrent
    try {
      const res = await this.http(`/plugins/source/action.php?hash=${encodeURIComponent(hash.toUpperCase())}`);
      if (res.ok) { const b = Buffer.from(await res.arrayBuffer()); if (b.length && b[0] === 0x64) return b; }
    } catch { /* on essaie la lecture par FTP */ }
    // 2) sinon le fichier de session de rTorrent (<dossier de session>/<EMPREINTE>.torrent), lu par FTP
    let session = '';
    try { session = String(await this.call('session.path')).replace(/\\/g, '/').replace(/\/+$/, ''); } catch { /* ancienne version : nom seul */ }
    const file = `${session || '/.session'}/${hash.toUpperCase()}.torrent`;
    throw new NeedsFileAccess({ name: `${hash.toUpperCase()}.torrent`, content_path: file }, `ruTorrent n'a pas donné le .torrent (greffon « source » absent ?) : lecture par FTP de ${hash.toUpperCase()}.torrent`);
  }

  async add(buf: Buffer, o: { savepath: string; category?: string }) {
    const cmds = [`d.directory.set=${q(o.savepath)}`, ...(o.category ? [`d.custom1.set=${q(encodeURIComponent(o.category))}`] : [])];
    await this.call('load.raw_start', ['', { base64: buf }, ...cmds]);
  }

  async ensureCategory() { /* les étiquettes de ruTorrent sont libres */ }
}

// ------------------------------------------------------------------

export function makeClient(kind: ClientKind | undefined, url: string, user?: string, pass?: string, strict = false): TorrentClient {
  if (kind === 'transmission') return new TransmissionClient(url, user, pass, strict);
  if (kind === 'rutorrent') return new RutorrentClient(url, user, pass, strict);
  return new Qbit(url, user, pass, strict);
}
