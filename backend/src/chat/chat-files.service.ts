import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

const STORAGE_DIR = process.env.CHAT_FILE_STORAGE_DIR ?? './storage/chat-files';
const MAX_BYTES = 20 * 1024 * 1024; // 20 Mo
// Types interdits par sécurité (exécutables, scripts) : tout le reste est accepté, comme une pièce jointe de messagerie classique.
const BLOCKED_EXT = new Set(['exe', 'msi', 'bat', 'cmd', 'sh', 'com', 'scr', 'js', 'jar', 'app', 'dmg']);

/** Pièce jointe (fichier quelconque, pas une image) du chat public — stockée sur Seeduction, jamais un lien externe. */
@Injectable()
export class ChatFilesService {
  async saveUpload(file: Express.Multer.File): Promise<{ url: string; name: string; size: number }> {
    if (!file) throw new BadRequestException('Fichier manquant');
    if (file.size > MAX_BYTES) throw new BadRequestException('Fichier trop volumineux (20 Mo maximum)');
    const original = (file.originalname || 'fichier').replace(/[/\\]/g, '_').slice(0, 150);
    const ext = path.extname(original).slice(1).toLowerCase();
    if (BLOCKED_EXT.has(ext)) throw new BadRequestException('Ce type de fichier n\'est pas autorisé');

    await fs.mkdir(STORAGE_DIR, { recursive: true });
    const stored = `${randomUUID()}__${original}`;
    await fs.writeFile(path.join(STORAGE_DIR, stored), file.buffer);
    return { url: `/api/chat/files/${encodeURIComponent(stored)}`, name: original, size: file.size };
  }

  resolveFilePath(storedFilename: string) {
    const safe = path.basename(storedFilename);
    return { filePath: path.join(STORAGE_DIR, safe), originalName: safe.includes('__') ? safe.slice(safe.indexOf('__') + 2) : safe };
  }
}
