import { Module } from '@nestjs/common';
import { PlayersPublicController } from './players.controller';
import { PlayersAdminController } from './players-admin.controller';
import { PlayersService } from './players.service';
import { PublishKeyJwtAuthGuard } from './publish-key.guard';

@Module({ controllers: [PlayersPublicController, PlayersAdminController], providers: [PlayersService, PublishKeyJwtAuthGuard], exports: [PlayersService] })
export class PlayersModule {}
