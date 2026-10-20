import { Module } from '@nestjs/common';
import { MetadataModule } from '../metadata/metadata.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaService } from '../common/prisma.service';
import { SeriesFollowController } from './series-follow.controller';
import { SeriesFollowService } from './series-follow.service';

@Module({ imports: [MetadataModule, NotificationsModule], controllers: [SeriesFollowController], providers: [SeriesFollowService, PrismaService], exports: [SeriesFollowService] })
export class SeriesFollowModule {}
