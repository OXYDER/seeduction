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
  list(@Query('categoryId') categoryId?: string, @Query('search') search?: string,
       @Query('uploaderId') uploaderId?: string,
       @Query('page') page = '1', @Query('pageSize') pageSize = '25') {
    return this.torrentsService.list({
      categoryId, search, uploaderId, page: parseInt(page, 10), pageSize: parseInt(pageSize, 10),
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
    @Body() body: { name: string; description?: string; categoryId: string; tags?: string; anonymous?: string },
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
