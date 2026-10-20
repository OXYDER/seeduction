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
import { StaffLogController } from './staff-log.controller';
import { StaffLogService } from './staff-log.service';
import { StaffBoardController } from './staff-board.controller';
import { StaffBoardService } from './staff-board.service';
import { StaffSecurityController } from './staff-security.controller';
import { StaffSecurityService } from './staff-security.service';
import { UploadCreditModule } from '../upload-credit/upload-credit.module';
import { TrustedUploadersService } from './trusted-uploaders.service';
import { TrustedUploadersController } from './trusted-uploaders.controller';

@Module({
  imports: [NotificationsModule, BadgesModule, ReportsModule, SocialModule, AuthModule, MetadataModule, PresenceModule, UploadCreditModule],
  controllers: [AdminController, OwnerTorrentsController, StaffMembersController, MemberInspectController, StaffSecurityController, StaffBoardController, StaffLogController, TrustedUploadersController],
  providers: [TrustedUploadersService, AdminService, AdminInvitesService, SiteConfigService, AccountDeletionService, StaffMembersService, MemberInspectService, StaffSecurityService, StaffBoardService, StaffLogService],
  exports: [AccountDeletionService, AdminService, TrustedUploadersService],
})
export class AdminModule {}
