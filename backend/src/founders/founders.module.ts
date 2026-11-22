import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { BadgesModule } from '../badges/badges.module';
import { FoundersController } from './founders.controller';
import { FoundersService } from './founders.service';

@Module({
  imports: [NotificationsModule, BadgesModule],
  controllers: [FoundersController],
  providers: [FoundersService],
  exports: [FoundersService],
})
export class FoundersModule {}
