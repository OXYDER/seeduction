import { Module } from '@nestjs/common';
import { MessengerModule } from '../messenger/messenger.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PresenceModule } from '../presence/presence.module';
import { WikiModule } from '../wiki/wiki.module';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { SupportBotService } from './support-bot.service';
import { SupportAiService } from './support-ai.service';

@Module({
  imports: [MessengerModule, NotificationsModule, PresenceModule, WikiModule],
  controllers: [SupportController],
  providers: [SupportService, SupportBotService, SupportAiService],
  exports: [SupportBotService], // le robot « Seeduction » publie aussi les torrents de l'import automatique
})
export class SupportModule {}
