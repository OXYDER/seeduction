import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { jwtSecret } from '../common/utils/secret';
import { LiveGateway } from './live.gateway';
import { LiveAdminController, LiveController, LivePlayerController } from './live.controller';
import { LiveService } from './live.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [JwtModule.register({ secret: jwtSecret(), signOptions: { expiresIn: '7d' } }), NotificationsModule],
  controllers: [LiveController, LivePlayerController, LiveAdminController],
  providers: [LiveService, LiveGateway],
  exports: [LiveService],
})
export class LiveModule {}
