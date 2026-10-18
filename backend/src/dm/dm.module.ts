import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DmController } from './dm.controller';
import { DmService } from './dm.service';
import { DmGateway } from './dm.gateway';
import { NotificationsModule } from '../notifications/notifications.module';
import { PresenceModule } from '../presence/presence.module';
import { jwtSecret } from '../common/utils/secret';

@Module({
  imports: [
    NotificationsModule,
    PresenceModule,
    JwtModule.register({
      secret: jwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [DmController],
  providers: [DmService, DmGateway],
  exports: [DmGateway],
})
export class DmModule {}
