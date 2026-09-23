import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaService } from '../common/prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { BadgesModule } from '../badges/badges.module';
import { ReportsModule } from '../reports/reports.module';
import { SocialModule } from '../social/social.module';

@Module({
  imports: [NotificationsModule, BadgesModule, ReportsModule, SocialModule],
  controllers: [AdminController],
  providers: [AdminService, PrismaService],
})
export class AdminModule {}
