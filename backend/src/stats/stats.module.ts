import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { PrismaService } from '../common/prisma.service';
import { UsersModule } from '../users/users.module';
import { BadgesModule } from '../badges/badges.module';

@Module({
  imports: [UsersModule, BadgesModule],
  controllers: [StatsController],
  providers: [StatsService, PrismaService],
})
export class StatsModule {}
