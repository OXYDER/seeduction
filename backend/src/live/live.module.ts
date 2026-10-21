import { Module } from '@nestjs/common';
import { LiveAdminController, LiveController } from './live.controller';
import { LiveService } from './live.service';

@Module({ controllers: [LiveController, LiveAdminController], providers: [LiveService], exports: [LiveService] })
export class LiveModule {}
