import {
  Controller, Get, Post, Body, Param, Query, UseGuards, Request,
  UseInterceptors, UploadedFile, Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { TorrentsService } from './torrents.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('torrents')
export class TorrentsController {
  constructor(private torrentsService: TorrentsService) {}

  @Get()
  list(@Query() query: Record<string, string>) {
    return this.torrentsService.list({
      categoryId: query.categoryId,
      search: query.search,
      uploaderId: query.uploaderId,
      page: parseInt(query.page ?? '1', 10),
      pageSize: parseInt(query.pageSize ?? '25', 10),
      sort: query.sort,
      minSize: query.minSize ? Number(query.minSize) : undefined,
      maxSize: query.maxSize ? Number(query.maxSize) : undefined,
      minSeeders: query.minSeeders ? Number(query.minSeeders) : undefined,
      year: query.year ? Number(query.year) : undefined,
      language: query.language,
      resolution: query.resolution,
      codec: query.codec,
      hdr: query.hdr === 'true' ? true : undefined,
      audio: query.audio,
      source: query.source,
      containerFormat: query.containerFormat,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.torrentsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('upload')
  @UseInterceptors(FileInterceptor('torrentFile'))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: Record<string, string>,
    @Request() req: any,
  ) {
    return this.torrentsService.upload({
      userId: req.user.userId,
      fileBuffer: file.buffer,
      name: body.name,
      description: body.description,
      categoryId: body.categoryId,
      tags: body.tags ? body.tags.split(',').map((t) => t.trim()) : [],
      anonymous: body.anonymous === 'true',
      coverImage: body.coverImage || undefined,
      year: body.year ? Number(body.year) : undefined,
      language: body.language || undefined,
      resolution: body.resolution || undefined,
      codec: body.codec || undefined,
      hdr: body.hdr === 'true',
      audio: body.audio || undefined,
      source: body.source || undefined,
      containerFormat: body.containerFormat || undefined,
      fps: body.fps ? Number(body.fps) : undefined,
      durationMinutes: body.durationMinutes ? Number(body.durationMinutes) : undefined,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/download')
  async download(@Param('id') id: string, @Request() req: any, @Res() res: Response) {
    const buf = await this.torrentsService.getDownloadFile(id, req.user.userId);
    res.set({
      'Content-Type': 'application/x-bittorrent',
      'Content-Disposition': `attachment; filename="${id}.torrent"`,
    });
    res.send(buf);
  }
}
