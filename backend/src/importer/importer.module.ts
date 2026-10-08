import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { TorrentsModule } from '../torrents/torrents.module';
import { MetadataModule } from '../metadata/metadata.module';
import { SupportModule } from '../support/support.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ImporterController } from './importer.controller';
import { ImporterService } from './importer.service';

@Module({
  imports: [TorrentsModule, AdminModule, MetadataModule, SupportModule, NotificationsModule],
  controllers: [ImporterController],
  providers: [ImporterService],
})
export class ImporterModule {}
