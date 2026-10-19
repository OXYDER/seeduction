import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TelegramModule } from '../telegram/telegram.module';
import { TorrentsModule } from '../torrents/torrents.module';
import { SavedSearchesController } from './saved-searches.controller';
import { SavedSearchesService } from './saved-searches.service';

@Module({ imports: [NotificationsModule, TelegramModule, TorrentsModule], controllers: [SavedSearchesController], providers: [SavedSearchesService] })
export class SavedSearchesModule {}
