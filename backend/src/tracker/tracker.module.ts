import { Module } from '@nestjs/common';
import { TrackerController } from './tracker.controller';
import { TrackerService } from './tracker.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [TrackerController],
  providers: [TrackerService, PrismaService],
})
export class TrackerModule {}
