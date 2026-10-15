import { Module } from '@nestjs/common';
import { EventThemesController } from './event-themes.controller';
import { EventThemesService } from './event-themes.service';

@Module({ controllers: [EventThemesController], providers: [EventThemesService] })
export class EventThemesModule {}
