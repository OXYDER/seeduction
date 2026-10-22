import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { createHash, randomUUID } from 'crypto';
import { createReadStream, createWriteStream, promises as fsp } from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import { isValidVersion } from '../common/utils/app-version';

export type Platform = 'windows' | 'android';

export interface Release { version: string; file: string; size: number; sha256: string; notes: string | null; publishedAt: string }
type Manifest = Partial<Record<Platform, Release>>;

const CHUNK_MAX = 12 * 1024 * 1024;
const TOTAL_MAX = 400 * 1024 * 1024;
const STALE_MS = 6 * 3600_000;

/** Ce qu'on accepte pour chaque système : extension, début du fichier (un .exe commence par « MZ », un .apk est une archive « PK ») et nom du téléchargement. */
const SPEC: Record<Platform, { ext: string; magic: number[]; mime: string; downloadName: (v: string) => string }> = {
  windows: { ext: '.exe', magic: [0x4d, 0x5a], mime: 'application/vnd.microsoft.portable-executable', downloadName: (v) => `Seeduction Player Setup ${v}.exe` },
  android: { ext: '.apk', magic: [0x50, 0x4b], mime: 'application/vnd.android.package-archive', downloadName: () => 'Seeduction.Player.apk' },
};

export function isPlatform(v: string): v is Platform { return v === 'windows' || v === 'android'; }

/**
 * Les installateurs des lecteurs (Windows et Android) sont hébergés par le site lui-même, dans un dossier du serveur (PLAYER_DOWNLOADS_DIR) :
 * plus besoin de les publier sur GitHub. L'administration les envoie par morceaux (le .exe dépasse les limites du serveur web), avec un numéro de version.
 * Les lecteurs interrogent la liste des versions pour proposer eux-mêmes une mise à jour.
 */
@Injectable()
export class PlayersService {
  private readonly log = new Logger(PlayersService.name);
  /** Envois en cours (en mémoire) : un envoi interrompu par un redémarrage du serveur recommence simplement. */
  private uploads = new Map<string, { platform: Platform; received: number; bytes: number; at: number }>();

  private dir() { return process.env.PLAYER_DOWNLOADS_DIR ?? './storage/downloads'; }
  private tmpDir() { return path.join(this.dir(), '.tmp'); }
  private manifestPath() { return path.join(this.dir(), 'manifest.json'); }

  private async readManifest(): Promise<Manifest> {
    try { return JSON.parse(await fsp.readFile(this.manifestPath(), 'utf8')) as Manifest; } catch { return {}; }
  }

  private async writeManifest(m: Manifest) {
    await fsp.mkdir(this.dir(), { recursive: true });
    const tmp = this.manifestPath() + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(m, null, 2));
    await fsp.rename(tmp, this.manifestPath());
  }

  // ── Côté public : liste des versions et téléchargement ────────────────────

  /** Ce que voient la page de téléchargement et les lecteurs : version, taille, empreinte et adresse de téléchargement (jamais le chemin du serveur). */
  async publicList() {
    const m = await this.readManifest();
    const out: Record<string, unknown> = {};
    for (const p of ['windows', 'android'] as Platform[]) {
      const r = m[p];
      if (r) out[p] = { version: r.version, size: r.size, sha256: r.sha256, notes: r.notes, publishedAt: r.publishedAt, url: `/api/downloads/players/${p}` };
    }
    return out;
  }

  async fileFor(platform: Platform) {
    const r = (await this.readManifest())[platform];
    if (!r) throw new NotFoundException('Aucun installateur publié pour ce système.');
    const full = path.join(this.dir(), r.file);
    try { await fsp.access(full); } catch { throw new NotFoundException('Fichier introuvable sur le serveur.'); }
    return { path: full, name: SPEC[platform].downloadName(r.version), mime: SPEC[platform].mime };
  }

  // ── Côté administration : publication par morceaux ────────────────────────

  async overview() {
    const m = await this.readManifest();
    return { windows: m.windows ?? null, android: m.android ?? null };
  }

  async startUpload(platform: Platform) {
    const id = randomUUID();
    this.uploads.set(id, { platform, received: 0, bytes: 0, at: Date.now() });
    await fsp.mkdir(this.tmpDir(), { recursive: true });
    return { upload: id, chunkMax: CHUNK_MAX };
  }

  /** Un morceau du fichier (corps brut de la requête), dans l'ordre : le morceau n°N n'est accepté qu'après le n°N-1. */
  async appendChunk(upload: string, index: number, body: NodeJS.ReadableStream) {
    const u = this.uploads.get(upload);
    if (!u) throw new NotFoundException('Envoi inconnu ou expiré : recommence l\'envoi.');
    if (!Number.isInteger(index) || index !== u.received) throw new ConflictException(`Morceau hors séquence (attendu n°${u.received}).`);
    let n = 0;
    const limit = new Transform({
      transform(chunk, _enc, cb) {
        n += chunk.length;
        if (n > CHUNK_MAX) return cb(new BadRequestException('Morceau trop gros.'));
        cb(null, chunk);
      },
    });
    const part = path.join(this.tmpDir(), `${upload}.part`);
    await pipeline(body, limit, createWriteStream(part, { flags: index === 0 ? 'w' : 'a' }));
    if (u.bytes + n > TOTAL_MAX) { await fsp.rm(part, { force: true }); this.uploads.delete(upload); throw new BadRequestException('Fichier trop gros (400 Mo au plus).'); }
    u.received++; u.bytes += n; u.at = Date.now();
    return { received: u.received, bytes: u.bytes };
  }

  /** Dernier pas : vérifie le fichier (début, taille), calcule son empreinte, le met en place et remplace l'ancien. */
  async finish(upload: string, version: unknown, notes: unknown) {
    const u = this.uploads.get(upload);
    if (!u) throw new NotFoundException('Envoi inconnu ou expiré : recommence l\'envoi.');
    if (!isValidVersion(version)) throw new BadRequestException('Numéro de version invalide : des nombres séparés par des points, par exemple 1.2.0.');
    const spec = SPEC[u.platform];
    const part = path.join(this.tmpDir(), `${upload}.part`);
    const cleanup = async () => { this.uploads.delete(upload); await fsp.rm(part, { force: true }); };
    let stat;
    try { stat = await fsp.stat(part); } catch { await cleanup(); throw new BadRequestException('Aucun fichier reçu.'); }
    if (stat.size < 1024) { await cleanup(); throw new BadRequestException('Fichier trop petit pour être un installateur.'); }
    const fh = await fsp.open(part, 'r');
    const head = Buffer.alloc(spec.magic.length);
    try { await fh.read(head, 0, head.length, 0); } finally { await fh.close(); }
    if (!spec.magic.every((b, i) => head[i] === b)) { await cleanup(); throw new BadRequestException(`Ce fichier n'est pas un installateur ${spec.ext} valide.`); }

    const hash = createHash('sha256');
    for await (const c of createReadStream(part)) hash.update(c);

    const m = await this.readManifest();
    const file = `${u.platform}-${version.trim()}${spec.ext}`;
    await fsp.mkdir(this.dir(), { recursive: true });
    await fsp.rename(part, path.join(this.dir(), file));
    const release: Release = { version: version.trim(), file, size: stat.size, sha256: hash.digest('hex'), notes: typeof notes === 'string' && notes.trim() ? notes.trim().slice(0, 1000) : null, publishedAt: new Date().toISOString() };
    const previous = m[u.platform];
    m[u.platform] = release;
    await this.writeManifest(m);
    if (previous && previous.file !== file) await fsp.rm(path.join(this.dir(), previous.file), { force: true });
    this.uploads.delete(upload);
    this.log.log(`Lecteur ${u.platform} ${release.version} publié (${(release.size / 1048576).toFixed(1)} Mo)`);
    return release;
  }

  async remove(platform: Platform) {
    const m = await this.readManifest();
    const r = m[platform];
    if (!r) throw new NotFoundException('Rien à retirer.');
    delete m[platform];
    await this.writeManifest(m);
    await fsp.rm(path.join(this.dir(), r.file), { force: true });
  }

  /** Les envois abandonnés (page fermée, panne) ne doivent pas s'accumuler. */
  @Interval(3600_000)
  async cleanStale() {
    const now = Date.now();
    for (const [id, u] of this.uploads) if (now - u.at > STALE_MS) this.uploads.delete(id);
    try {
      for (const f of await fsp.readdir(this.tmpDir())) {
        const p = path.join(this.tmpDir(), f);
        const st = await fsp.stat(p);
        if (now - st.mtimeMs > STALE_MS) await fsp.rm(p, { force: true });
      }
    } catch { /* dossier absent : rien à nettoyer */ }
  }
}
