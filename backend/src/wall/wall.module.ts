import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { BadgesModule } from '../badges/badges.module';
import { WallController } from './wall.controller';
import { WallService } from './wall.service';
import { LinkPreviewService } from '../messenger/link-preview.service';

@Module({
  imports: [NotificationsModule, BadgesModule],
  controllers: [WallController],
  providers: [WallService, LinkPreviewService],
})
export class WallModule {}
