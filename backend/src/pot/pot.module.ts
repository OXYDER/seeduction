import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PotController } from './pot.controller';
import { PotService } from './pot.service';

@Module({
  imports: [NotificationsModule],
  controllers: [PotController],
  providers: [PotService],
  exports: [PotService],
})
export class PotModule {}
