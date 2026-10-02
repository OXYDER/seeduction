import { Controller, Get, Headers, NotFoundException, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { ChatFilesService } from '../chat/chat-files.service';

const AUDIO_TYPES: Record<string, string> = {
  webm: 'audio/webm', ogg: 'audio/ogg', oga: 'audio/ogg', m4a: 'audio/mp4', mp4: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav',
};

/**
 * Lecture des messages vocaux : le fichier est servi « en ligne » avec son vrai type audio et la lecture partielle
 * (Range), ce qu'une balise <audio> exige pour avancer / reculer dans l'enregistrement. Pas d'authentification (une
 * balise <audio> ne peut pas envoyer d'en-tête Authorization) : le nom du fichier est un UUID impossible à deviner,
 * comme pour les autres pièces jointes du chat.
 */
@Controller('messenger/files')
export class MessengerFilesController {
  constructor(private files: ChatFilesService) {}

  @Get(':filename')
  async serve(@Param('filename') filename: string, @Headers('range') range: string | undefined, @Res() res: Response) {
    const { filePath, originalName } = this.files.resolveFilePath(filename);
    const ext = path.extname(originalName).slice(1).toLowerCase();
    const type = AUDIO_TYPES[ext];
    let size: number;
    try { size = (await fsp.stat(filePath)).size; } catch { throw new NotFoundException('Fichier introuvable'); }

    const base: Record<string, string> = {
      'Content-Type': type ?? 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      // Seuls les enregistrements audio se lisent en ligne ; tout le reste se télécharge.
      'Content-Disposition': type ? 'inline' : `attachment; filename="${encodeURIComponent(originalName)}"`,
    };

    const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
    if (!m || (m[1] === '' && m[2] === '')) {
      res.writeHead(200, { ...base, 'Content-Length': String(size) });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
    const start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]);
    const end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
    if (start >= size || start > end) {
      res.writeHead(416, { ...base, 'Content-Range': `bytes */${size}` });
      res.end();
      return;
    }
    res.writeHead(206, { ...base, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  }
}
