import { Module } from '@nestjs/common';
import { TorrentsController } from './torrents.controller';
import { TorrentsService } from './torrents.service';
import { RecommendationsService } from './recommendations.service';
import { PrismaService } from '../common/prisma.service';
import { MetadataModule } from '../metadata/metadata.module';
import { TeamsModule } from '../teams/teams.module';

@Module({
  imports: [MetadataModule, TeamsModule],
  controllers: [TorrentsController],
  providers: [TorrentsService, RecommendationsService, PrismaService],
  exports: [TorrentsService],
})
export class TorrentsModule {}
