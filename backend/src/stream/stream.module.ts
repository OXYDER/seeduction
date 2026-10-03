import { Module } from '@nestjs/common';
import { StreamController } from './stream.controller';
import { StreamService } from './stream.service';
import { TorrentsModule } from '../torrents/torrents.module';

@Module({
  imports: [TorrentsModule],
  controllers: [StreamController],
  providers: [StreamService],
})
export class StreamModule {}
