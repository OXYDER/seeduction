import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { jwtSecret } from '../common/utils/secret';
import { StreamModule } from '../stream/stream.module';
import { TorrentsModule } from '../torrents/torrents.module';
import { CoversModule } from '../covers/covers.module';
import { EpisodeInfoService } from './episode-info.service';
import { VodController } from './vod.controller';
import { VodLiveService } from './vod-live.service';
import { VodService } from './vod.service';

@Module({
  imports: [JwtModule.register({ secret: jwtSecret(), signOptions: { expiresIn: '7d' } }), StreamModule, TorrentsModule, CoversModule],
  controllers: [VodController],
  providers: [VodService, VodLiveService, EpisodeInfoService],
})
export class VodModule {}
