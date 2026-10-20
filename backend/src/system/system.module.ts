import { Module } from '@nestjs/common';
import { RoadmapModule } from '../roadmap/roadmap.module';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';
import { PublicStatusService } from './public-status.service';
import { PrismaService } from '../common/prisma.service';

@Module({ imports: [RoadmapModule], controllers: [SystemController], providers: [SystemService, PublicStatusService, PrismaService] })
export class SystemModule {}
