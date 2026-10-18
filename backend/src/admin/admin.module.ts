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
import { OwnerTorrentsController } from './owner-torrents.controller';
import { StaffMembersController } from './staff-members.controller';
import { StaffMembersService } from './staff-members.service';
import { MemberInspectController } from './member-inspect.controller';
import { MemberInspectService } from './member-inspect.service';
import { PresenceModule } from '../presence/presence.module';
import { UploadCreditModule } from '../upload-credit/upload-credit.module';

@Module({
  imports: [NotificationsModule, BadgesModule, ReportsModule, SocialModule, AuthModule, MetadataModule, PresenceModule, UploadCreditModule],
  controllers: [AdminController, OwnerTorrentsController, StaffMembersController, MemberInspectController],
  providers: [AdminService, AdminInvitesService, SiteConfigService, AccountDeletionService, StaffMembersService, MemberInspectService],
  exports: [AccountDeletionService, AdminService],
})
export class AdminModule {}
