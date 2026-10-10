import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SuggestionsController } from './suggestions.controller';
import { SuggestionsService } from './suggestions.service';

@Module({
  imports: [NotificationsModule],
  controllers: [SuggestionsController],
  providers: [SuggestionsService],
})
export class SuggestionsModule {}
