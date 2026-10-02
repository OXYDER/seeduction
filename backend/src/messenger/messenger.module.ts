import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MessengerController } from './messenger.controller';
import { MessengerFilesController } from './messenger-files.controller';
import { MessengerService } from './messenger.service';
import { MessengerGifsService } from './messenger-gifs.service';
import { MessengerGateway } from './messenger.gateway';
import { MessengerMigrationService } from './messenger-migration.service';
import { PrismaService } from '../common/prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PresenceModule } from '../presence/presence.module';
import { CoversModule } from '../covers/covers.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [
    NotificationsModule,
    PresenceModule,
    CoversModule,
    ChatModule, // fournit ChatFilesService (pièces jointes) tant que l'ancien chat existe
    JwtModule.register({ secret: process.env.JWT_SECRET ?? 'change-me-in-.env', signOptions: { expiresIn: '7d' } }),
  ],
  controllers: [MessengerController, MessengerFilesController],
  providers: [MessengerService, MessengerGifsService, MessengerGateway, MessengerMigrationService, PrismaService],
  exports: [MessengerService],
})
export class MessengerModule {}
