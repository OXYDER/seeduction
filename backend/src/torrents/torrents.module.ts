import { Module } from '@nestjs/common';
import { TorrentsController } from './torrents.controller';
import { TorrentsService } from './torrents.service';
import { RecommendationsService } from './recommendations.service';
import { MetadataModule } from '../metadata/metadata.module';
import { TeamsModule } from '../teams/teams.module';
import { AdminModule } from '../admin/admin.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TorrentFixesService } from './torrent-fixes.service';
import { TorrentFixesController } from './torrent-fixes.controller';

@Module({
  imports: [MetadataModule, TeamsModule, AdminModule, NotificationsModule],
  controllers: [TorrentsController, TorrentFixesController],
  providers: [TorrentsService, RecommendationsService, TorrentFixesService],
  exports: [TorrentsService],
})
export class TorrentsModule {}
