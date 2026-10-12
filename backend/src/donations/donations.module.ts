import { Module } from '@nestjs/common';
import { DonationsController } from './donations.controller';
import { DonationsService } from './donations.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { BadgesModule } from '../badges/badges.module';

@Module({ imports: [NotificationsModule, BadgesModule], controllers: [DonationsController], providers: [DonationsService] })
export class DonationsModule {}
