import { Module } from '@nestjs/common';
import { CoversModule } from '../covers/covers.module';
import { MessengerModule } from '../messenger/messenger.module';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';

@Module({
  imports: [MessengerModule, CoversModule],
  controllers: [TelegramController],
  providers: [TelegramService],
})
export class TelegramModule {}
