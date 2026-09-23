import { Module } from '@nestjs/common';
import { EconomyController } from './economy.controller';
import { EconomyService } from './economy.service';
import { RanksService } from './ranks.service';
import { PrismaService } from '../common/prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [EconomyController],
  providers: [EconomyService, RanksService, PrismaService],
  exports: [EconomyService],
})
export class EconomyModule {}
