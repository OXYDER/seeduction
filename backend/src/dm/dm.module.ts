import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DmController } from './dm.controller';
import { DmService } from './dm.service';
import { DmGateway } from './dm.gateway';
import { PresenceService } from './presence.service';
import { PrismaService } from '../common/prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    NotificationsModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'change-me-in-.env',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [DmController],
  providers: [DmService, DmGateway, PresenceService, PrismaService],
  exports: [PresenceService, DmGateway],
})
export class DmModule {}
