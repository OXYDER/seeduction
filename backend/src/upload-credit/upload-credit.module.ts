import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { UploadCreditController } from './upload-credit.controller';
import { UploadCreditService } from './upload-credit.service';

@Module({ imports: [NotificationsModule], controllers: [UploadCreditController], providers: [UploadCreditService], exports: [UploadCreditService] })
export class UploadCreditModule {}
