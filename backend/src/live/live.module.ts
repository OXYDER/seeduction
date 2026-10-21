import { Module } from '@nestjs/common';
import { LiveAdminController, LiveController, LivePlayerController } from './live.controller';
import { LiveService } from './live.service';

@Module({ controllers: [LiveController, LivePlayerController, LiveAdminController], providers: [LiveService], exports: [LiveService] })
export class LiveModule {}
