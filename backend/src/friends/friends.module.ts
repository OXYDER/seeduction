import { Module } from '@nestjs/common';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';
import { PrismaService } from '../common/prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { DmModule } from '../dm/dm.module';

@Module({
  imports: [NotificationsModule, DmModule],
  controllers: [FriendsController],
  providers: [FriendsService, PrismaService],
  exports: [FriendsService],
})
export class FriendsModule {}
