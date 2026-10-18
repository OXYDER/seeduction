import { Module } from '@nestjs/common';
import { DonationsController } from './donations.controller';
import { DonationsService } from './donations.service';
import { DonationWebhooksController } from './donation-webhooks.controller';
import { DonationWebhooksService } from './donation-webhooks.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { BadgesModule } from '../badges/badges.module';

@Module({ imports: [NotificationsModule, BadgesModule], controllers: [DonationsController, DonationWebhooksController], providers: [DonationsService, DonationWebhooksService] })
export class DonationsModule {}
