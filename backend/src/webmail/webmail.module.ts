import { Module } from '@nestjs/common';
import { WebmailController } from './webmail.controller';
import { WebmailService } from './webmail.service';

@Module({ controllers: [WebmailController], providers: [WebmailService] })
export class WebmailModule {}
