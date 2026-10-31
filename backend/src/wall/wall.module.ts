import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { BadgesModule } from '../badges/badges.module';
import { WallController } from './wall.controller';
import { WallService } from './wall.service';

@Module({
  imports: [NotificationsModule, BadgesModule],
  controllers: [WallController],
  providers: [WallService],
})
export class WallModule {}
