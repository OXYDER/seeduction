import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminInvitesService } from './admin-invites.service';
import { SiteConfigService } from './site-config.service';
import { AccountDeletionService } from './account-deletion.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BadgesModule } from '../badges/badges.module';
import { ReportsModule } from '../reports/reports.module';
import { SocialModule } from '../social/social.module';
import { MetadataModule } from '../metadata/metadata.module';

@Module({
  imports: [NotificationsModule, BadgesModule, ReportsModule, SocialModule, AuthModule, MetadataModule],
  controllers: [AdminController],
  providers: [AdminService, AdminInvitesService, SiteConfigService, AccountDeletionService],
  exports: [AccountDeletionService, AdminService],
})
export class AdminModule {}
