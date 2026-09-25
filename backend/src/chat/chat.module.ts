import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { ChatFilesService } from './chat-files.service';
import { PrismaService } from '../common/prisma.service';
import { PresenceModule } from '../presence/presence.module';
import { CoversModule } from '../covers/covers.module';

@Module({
  imports: [
    PresenceModule,
    CoversModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'change-me-in-.env',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, ChatFilesService, PrismaService],
  exports: [ChatGateway],
})
export class ChatModule {}
