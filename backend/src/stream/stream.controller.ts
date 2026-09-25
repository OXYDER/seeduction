import { Controller, ForbiddenException, Get, Param, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { PrismaService } from '../common/prisma.service';
import { StreamService } from './stream.service';

const MIME_BY_EXT: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
};

function mimeFor(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

// La passkey (comme pour le tracker et les téléchargements) identifie le spectateur : une balise <video> ne peut pas
// envoyer l'en-tête Authorization, elle ne fait qu'une requête GET simple — d'où l'identifiant dans l'URL.
@Controller('stream')
export class StreamController {
  constructor(private prisma: PrismaService, private streamService: StreamService) {}

  @Get(':torrentId')
  async stream(
    @Param('torrentId') torrentId: string,
    @Query('passkey') passkey: string,
    @Query('file') fileIndexRaw: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const user = passkey ? await this.prisma.user.findUnique({ where: { passkey } }) : null;
    if (!user || user.status === 'BANNED') throw new ForbiddenException('Accès refusé');

    const fileIndex = Number.parseInt(fileIndexRaw ?? '0', 10) || 0;
    const file = await this.streamService.getFile(torrentId, user.id, fileIndex);
    const mime = mimeFor(file.name);
    const range = req.headers.range;

    if (!range) {
      res.writeHead(200, { 'Content-Length': file.length, 'Content-Type': mime, 'Accept-Ranges': 'bytes' });
      file.createReadStream().pipe(res);
      return;
    }

    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match?.[1] ? Number.parseInt(match[1], 10) : 0;
    const end = match?.[2] ? Number.parseInt(match[2], 10) : file.length - 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${file.length}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': mime,
    });
    file.createReadStream({ start, end }).pipe(res);
  }
}
