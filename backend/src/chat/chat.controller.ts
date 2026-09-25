import { Controller, Delete, Get, Param, Post, Query, Res, Request, UseGuards, UseInterceptors, UploadedFile, NotFoundException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as fs from 'fs/promises';
import { ChatService } from './chat.service';
import { ChatFilesService } from './chat-files.service';
import { CoversService } from '../covers/covers.service';
import { ChatGateway } from './chat.gateway';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('chat')
export class ChatController {
  constructor(
    private chatService: ChatService,
    private chatGateway: ChatGateway,
    private chatFiles: ChatFilesService,
    private covers: CoversService,
  ) {}

  @Get('messages')
  list(@Query('limit') limit?: string) {
    return this.chatService.list(limit ? Number(limit) : undefined);
  }

  @UseGuards(JwtAuthGuard)
  @Post('files/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    return this.chatFiles.saveUpload(file);
  }

  @UseGuards(JwtAuthGuard)
  @Post('images/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    return { url: await this.covers.saveUpload(file) };
  }

  /** Pas d'auth : lien de téléchargement direct, comme les pochettes. */
  @Get('files/:filename')
  async serveFile(@Param('filename') filename: string, @Res() res: Response) {
    const { filePath, originalName } = this.chatFiles.resolveFilePath(filename);
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(filePath);
    } catch {
      throw new NotFoundException('Fichier introuvable');
    }
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(originalName)}"`,
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    res.send(buffer);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('messages/:id')
  async remove(@Param('id') id: string, @Request() req: any) {
    await this.chatService.delete(id, req.user);
    this.chatGateway.broadcastDelete(id);
    return { ok: true };
  }
}
