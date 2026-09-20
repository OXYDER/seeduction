import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

const STORAGE_DIR = process.env.COVER_STORAGE_DIR ?? './storage/covers';
const MAX_BYTES = 8 * 1024 * 1024; // 8 Mo
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Stocke les pochettes/affiches sur le disque de Seeduction lui-même — le
 * site ne doit jamais dépendre en continu d'un service externe (TMDB, Deezer,
 * Google Books) pour afficher une image déjà utilisée.
 */
@Injectable()
export class CoversService {
  /** Télécharge une image depuis une URL externe et la sauvegarde localement une fois pour toutes. */
  async saveFromUrl(url: string): Promise<string> {
    if (!/^https?:\/\//i.test(url)) throw new BadRequestException("URL d'image invalide");

    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      throw new BadRequestException("Impossible de télécharger l'image");
    }
    if (!res.ok) throw new BadRequestException(`Téléchargement de l'image échoué (${res.status})`);

    const contentType = res.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    const ext = EXT_BY_MIME[contentType];
    if (!ext) throw new BadRequestException('Type de fichier non supporté (jpeg/png/webp uniquement)');

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_BYTES) throw new BadRequestException('Image trop volumineuse (8 Mo max)');

    return this.saveBuffer(buffer, ext);
  }

  async saveUpload(file: Express.Multer.File): Promise<string> {
    const ext = EXT_BY_MIME[file.mimetype?.toLowerCase()];
    if (!ext) throw new BadRequestException('Type de fichier non supporté (jpeg/png/webp uniquement)');
    if (file.size > MAX_BYTES) throw new BadRequestException('Image trop volumineuse (8 Mo max)');
    return this.saveBuffer(file.buffer, ext);
  }

  private async saveBuffer(buffer: Buffer, ext: string): Promise<string> {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
    const filename = `${randomUUID()}.${ext}`;
    await fs.writeFile(path.join(STORAGE_DIR, filename), buffer);
    // Préfixe /api inclus : la valeur est utilisée telle quelle en <img src>
    // côté client et embarquée telle quelle dans le BBCode ([img]...[/img]).
    return `/api/covers/${filename}`;
  }

  resolveFilePath(filename: string): string {
    // Un nom de fichier généré par randomUUID() ne peut pas contenir de
    // séparateur de chemin, mais on le vérifie explicitement (paramètre
    // fourni par le client) avant de construire un chemin disque.
    if (!/^[a-f0-9-]+\.(jpg|png|webp)$/i.test(filename)) throw new BadRequestException('Nom de fichier invalide');
    return path.join(STORAGE_DIR, filename);
  }
}
