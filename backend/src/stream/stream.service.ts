import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { TorrentsService } from '../torrents/torrents.service';

// webtorrent 1.x (dernière ligne CommonJS, la 2.x étant en ESM pur, incompatible avec ce backend en require()).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const WebTorrent = require('webtorrent');

const STREAM_STORAGE_DIR = process.env.STREAM_STORAGE_DIR ?? './storage/stream-cache';
// Extensions lisibles nativement par un <video> de navigateur, sans transcodage côté serveur (voir STREAMING.md).
export const PLAYABLE_EXTENSIONS = new Set(['mp4', 'm4v', 'webm', 'ogv']);
const IDLE_TIMEOUT_MS = 20 * 60_000; // 20 min sans requête -> le swarm de lecture est arrêté et le cache effacé

export function isPlayableFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return PLAYABLE_EXTENSIONS.has(ext);
}

interface Session {
  torrent: any;
  lastAccess: number;
}

interface PlaySession {
  userId: string;
  torrentId: string;
  fileIndex: number;
  expiresAt: number;
}

const PLAY_SESSION_TTL_MS = 2 * 60_000; // le lecteur desktop doit récupérer le lien dans les 2 minutes

/**
 * « Visualiser en ligne » : le serveur rejoint le swarm comme un membre normal (même .torrent personnalisé, même
 * passkey, donc même comptabilité de ratio et de hit & run qu'un téléchargement classique) et relaie les octets au
 * navigateur au fur et à mesure, sans jamais faire télécharger de client à qui regarde. Un même torrent en cours de
 * lecture est partagé entre tous les spectateurs (un seul swarm còté serveur). Pas de transcodage : seuls les
 * fichiers déjà dans un format lisible par un navigateur (.mp4, .webm...) peuvent être visionnés ainsi.
 */
@Injectable()
export class StreamService {
  private readonly logger = new Logger(StreamService.name);
  private client: any;
  private sessions = new Map<string, Session>(); // clé = id du torrent en base
  private playSessions = new Map<string, PlaySession>(); // clé = jeton à usage unique remis au lecteur desktop

  constructor(private torrents: TorrentsService) {
    setInterval(() => this.cleanupIdle(), 5 * 60_000).unref();
  }

  /**
   * Jeton à usage unique pour le lecteur desktop (voir desktop-player/) : le lien `seeduction://stream/<jeton>`
   * ouvert par le membre laisse le logiciel récupérer le .torrent personnalisé sans jamais exposer sa passkey dans
   * la ligne de commande du processus (visible par d'autres logiciels sur le même PC).
   */
  createPlaySession(userId: string, torrentId: string, fileIndex: number): string {
    const token = randomUUID();
    this.playSessions.set(token, { userId, torrentId, fileIndex, expiresAt: Date.now() + PLAY_SESSION_TTL_MS });
    return token;
  }

  /** Consommé une seule fois par le lecteur desktop : renvoie le .torrent personnalisé (base64) + le fichier choisi. */
  async resolvePlaySession(token: string) {
    const session = this.playSessions.get(token);
    if (!session || session.expiresAt < Date.now()) throw new NotFoundException('Lien de lecture invalide ou expiré : relance « Ouvrir dans le lecteur » depuis Seeduction.');
    this.playSessions.delete(token);
    const buffer = await this.torrents.getDownloadFile(session.torrentId, session.userId);
    return { torrentBase64: buffer.toString('base64'), fileIndex: session.fileIndex };
  }

  private getClient() {
    if (!this.client) this.client = new WebTorrent({ path: STREAM_STORAGE_DIR });
    return this.client;
  }

  private cleanupIdle() {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastAccess > IDLE_TIMEOUT_MS) {
        session.torrent.destroy({ destroyStore: true }, () => {});
        this.sessions.delete(id);
        this.logger.log(`Lecture arrêtée par inactivité : torrent ${id}`);
      }
    }
    for (const [token, session] of this.playSessions) {
      if (session.expiresAt < now) this.playSessions.delete(token);
    }
  }

  private async ensureTorrent(torrentId: string, userId: string): Promise<any> {
    const existing = this.sessions.get(torrentId);
    if (existing) { existing.lastAccess = Date.now(); return existing.torrent; }

    // Le même .torrent personnalisé (announce Seeduction + passkey du spectateur) qu'un téléchargement classique :
    // regarder en ligne compte comme un peer normal pour le ratio et le suivi hit & run.
    const buffer = await this.torrents.getDownloadFile(torrentId, userId);
    const torrent: any = await new Promise((resolve, reject) => {
      let settled = false;
      const t = this.getClient().add(buffer, { deselect: true });
      t.on('ready', () => { settled = true; resolve(t); });
      t.on('error', (err: any) => { if (!settled) reject(err); });
    });
    this.sessions.set(torrentId, { torrent, lastAccess: Date.now() });
    return torrent;
  }

  /** Prépare le fichier demandé pour la lecture (priorité au téléchargement séquentiel de ce fichier seulement). */
  async getFile(torrentId: string, userId: string, fileIndex: number) {
    const torrent = await this.ensureTorrent(torrentId, userId);
    const file = torrent.files[fileIndex];
    if (!file) throw new NotFoundException('Fichier introuvable dans ce torrent');
    if (!isPlayableFile(file.name)) throw new NotFoundException("Ce fichier n'est pas dans un format lisible dans le navigateur");
    for (const f of torrent.files) if (f !== file) f.deselect();
    file.select();
    const session = this.sessions.get(torrentId);
    if (session) session.lastAccess = Date.now();
    return file as { name: string; length: number; createReadStream: (opts?: { start: number; end: number }) => NodeJS.ReadableStream };
  }
}
