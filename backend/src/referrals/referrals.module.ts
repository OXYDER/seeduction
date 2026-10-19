import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

@Module({ imports: [AuthModule, NotificationsModule], controllers: [ReferralsController], providers: [ReferralsService] })
export class ReferralsModule {}
