import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TorrentsModule } from './torrents/torrents.module';
import { TrackerModule } from './tracker/tracker.module';
import { StatsModule } from './stats/stats.module';
import { ForumModule } from './forum/forum.module';
import { MessagesModule } from './messages/messages.module';
import { RequestsModule } from './requests/requests.module';
import { AdminModule } from './admin/admin.module';
import { CategoriesModule } from './categories/categories.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { TemplatesModule } from './templates/templates.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CollectionsModule } from './collections/collections.module';
import { FavoritesModule } from './favorites/favorites.module';
import { CommentsModule } from './comments/comments.module';
import { SettingsModule } from './settings/settings.service';
import { AuditModule } from './audit/audit.service';
import { EconomyModule } from './economy/economy.module';
import { SocialModule } from './social/social.module';
import { MailModule } from './mail/mail.service';
import { SearchModule } from './search/search.module';
import { AdultModule } from './adult/adult.service';
import { ReportsModule } from './reports/reports.module';
import { BadgesModule } from './badges/badges.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { PublicApiModule } from './public-api/public-api.module';
import { ChatModule } from './chat/chat.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { CoversModule } from './covers/covers.module';
import { MetadataModule } from './metadata/metadata.module';
import { EntitiesModule } from './entities/entities.module';
import { FriendsModule } from './friends/friends.module';
import { DmModule } from './dm/dm.module';

@Module({
  imports: [
    ScheduleModule.forRoot(), // active les @Cron (snapshots ratio, purge peers)
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]), // rate-limit anti-abus API générale
    AuthModule,
    UsersModule,
    TorrentsModule,
    TrackerModule,
    StatsModule,
    ForumModule,
    MessagesModule,
    RequestsModule,
    AdminModule,
    CategoriesModule,
    AnnouncementsModule,
    TemplatesModule,
    NotificationsModule,
    CollectionsModule,
    FavoritesModule,
    CommentsModule,
    SettingsModule,
    AuditModule,
    EconomyModule,
    SocialModule,
    MailModule,
    SearchModule,
    AdultModule,
    ReportsModule,
    BadgesModule,
    ApiKeysModule,
    PublicApiModule,
    ChatModule,
    MonitoringModule,
    CoversModule,
    MetadataModule,
    EntitiesModule,
    FriendsModule,
    DmModule,
  ],
})
export class AppModule {}
