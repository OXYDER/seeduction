import { Module } from '@nestjs/common';
import { TorrentsController } from './torrents.controller';
import { TorrentsService } from './torrents.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [TorrentsController],
  providers: [TorrentsService, PrismaService],
})
export class TorrentsModule {}
