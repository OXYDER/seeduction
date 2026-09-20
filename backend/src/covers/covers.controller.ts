import { Controller, Get, Post, Param, UseGuards, UseInterceptors, UploadedFile, Res, NotFoundException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import { CoversService } from './covers.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

@Controller('covers')
export class CoversController {
  constructor(private coversService: CoversService) {}

  /** Pas d'auth : ce sont des affiches/pochettes publiques, servies via de simples balises <img>. */
  @Get(':filename')
  async serve(@Param('filename') filename: string, @Res() res: Response) {
    const filePath = this.coversService.resolveFilePath(filename);
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(filePath);
    } catch {
      throw new NotFoundException('Image introuvable');
    }
    const ext = path.extname(filename).slice(1).toLowerCase();
    res.set({
      'Content-Type': CONTENT_TYPE_BY_EXT[ext] ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    res.send(buffer);
  }

  /** Remplacement manuel d'une pochette (au lieu de celle trouvée automatiquement). */
  @UseGuards(JwtAuthGuard)
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File) {
    const url = await this.coversService.saveUpload(file);
    return { url };
  }
}
