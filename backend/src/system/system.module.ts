import { Module } from '@nestjs/common';
import { RoadmapModule } from '../roadmap/roadmap.module';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

@Module({ imports: [RoadmapModule], controllers: [SystemController], providers: [SystemService] })
export class SystemModule {}
