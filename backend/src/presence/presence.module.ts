import { Module } from '@nestjs/common';
import { PresenceService } from './presence.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  providers: [PresenceService, PrismaService],
  exports: [PresenceService],
})
export class PresenceModule {}
