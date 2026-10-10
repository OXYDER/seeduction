import { Module } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { TorrentsModule } from '../torrents/torrents.module';
import { TorznabController } from './torznab.controller';
import { TorznabService } from './torznab.service';

@Module({
  imports: [ApiKeysModule, TorrentsModule],
  controllers: [TorznabController],
  providers: [TorznabService],
})
export class TorznabModule {}
