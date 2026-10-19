import { Module } from '@nestjs/common';
import { BadgesModule } from '../badges/badges.module';
import { SubtitlesController } from './subtitles.controller';
import { SubtitlesService } from './subtitles.service';

@Module({ imports: [BadgesModule], controllers: [SubtitlesController], providers: [SubtitlesService] })
export class SubtitlesModule {}
