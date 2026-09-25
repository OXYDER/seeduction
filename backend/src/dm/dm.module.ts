import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DmController } from './dm.controller';
import { DmService } from './dm.service';
import { DmGateway } from './dm.gateway';
import { PrismaService } from '../common/prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PresenceModule } from '../presence/presence.module';

@Module({
  imports: [
    NotificationsModule,
    PresenceModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'change-me-in-.env',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [DmController],
  providers: [DmService, DmGateway, PrismaService],
  exports: [DmGateway],
})
export class DmModule {}
