import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaService } from '../common/prisma.service';
import { RecapController } from './recap.controller';
import { RecapService } from './recap.service';

@Module({ imports: [NotificationsModule], controllers: [RecapController], providers: [RecapService, PrismaService] })
export class RecapModule {}
