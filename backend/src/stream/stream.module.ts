import { Module } from '@nestjs/common';
import { StreamController } from './stream.controller';
import { StreamService } from './stream.service';
import { PrismaService } from '../common/prisma.service';
import { TorrentsModule } from '../torrents/torrents.module';

@Module({
  imports: [TorrentsModule],
  controllers: [StreamController],
  providers: [StreamService, PrismaService],
})
export class StreamModule {}
