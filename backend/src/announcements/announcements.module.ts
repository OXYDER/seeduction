import { Module } from '@nestjs/common';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { CoversModule } from '../covers/covers.module';
import { NewsImageService } from './news-image.service';

@Module({
  imports: [NotificationsModule, CoversModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService, NewsImageService],
})
export class AnnouncementsModule {}
