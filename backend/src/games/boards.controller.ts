import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { accountOf } from '../common/utils/account';
import { BoardsService } from './boards.service';

/** Classements des jeux gratuits (quiz, pronostics, roue, défis, cartes). */
@Controller('games/boards')
export class BoardsController {
  constructor(private boards: BoardsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  overview(@Request() req: any) { return this.boards.overview(accountOf(req)); }
}
