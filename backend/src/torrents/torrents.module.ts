import { Module } from '@nestjs/common';
import { TorrentsController } from './torrents.controller';
import { TorrentsService } from './torrents.service';
import { PrismaService } from '../common/prisma.service';
import { MetadataModule } from '../metadata/metadata.module';

@Module({
  imports: [MetadataModule],
  controllers: [TorrentsController],
  providers: [TorrentsService, PrismaService],
})
export class TorrentsModule {}
