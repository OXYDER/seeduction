import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaService } from '../common/prisma.service';
import { MessageRequestsController } from './message-requests.controller';
import { MessageRequestsService } from './message-requests.service';

@Module({ imports: [NotificationsModule], controllers: [MessageRequestsController], providers: [MessageRequestsService, PrismaService], exports: [MessageRequestsService] })
export class MessageRequestsModule {}
