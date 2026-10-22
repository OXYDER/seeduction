import { Module } from '@nestjs/common';
import { PlayersPublicController } from './players.controller';
import { PlayersAdminController } from './players-admin.controller';
import { PlayersService } from './players.service';

@Module({ controllers: [PlayersPublicController, PlayersAdminController], providers: [PlayersService], exports: [PlayersService] })
export class PlayersModule {}
