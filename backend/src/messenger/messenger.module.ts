import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MessengerController } from './messenger.controller';
import { MessengerFilesController } from './messenger-files.controller';
import { MessengerService } from './messenger.service';
import { MessengerGifsService } from './messenger-gifs.service';
import { MessengerCallsService } from './messenger-calls.service';
import { ChatModerationService } from './chat-moderation.service';
import { LinkPreviewService } from './link-preview.service';
import { MessengerGateway } from './messenger.gateway';
import { MessengerMigrationService } from './messenger-migration.service';
import { MessageRequestsModule } from '../message-requests/message-requests.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PresenceModule } from '../presence/presence.module';
import { CoversModule } from '../covers/covers.module';
import { ChatModule } from '../chat/chat.module';
import { jwtSecret } from '../common/utils/secret';

@Module({
  imports: [
    NotificationsModule,
    MessageRequestsModule,
    PresenceModule,
    CoversModule,
    ChatModule, // fournit ChatFilesService (pièces jointes) tant que l'ancien chat existe
    JwtModule.register({ secret: jwtSecret(), signOptions: { expiresIn: '7d' } }),
  ],
  controllers: [MessengerController, MessengerFilesController],
  providers: [MessengerService, ChatModerationService, LinkPreviewService, MessengerGifsService, MessengerCallsService, MessengerGateway, MessengerMigrationService],
  exports: [MessengerService, ChatModerationService],
})
export class MessengerModule {}
