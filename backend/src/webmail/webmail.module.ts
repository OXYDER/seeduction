import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { WebmailController } from './webmail.controller';
import { WebmailExtrasService } from './webmail-extras.service';
import { WebmailService } from './webmail.service';

@Module({ imports: [NotificationsModule], controllers: [WebmailController], providers: [WebmailService, WebmailExtrasService] })
export class WebmailModule {}
