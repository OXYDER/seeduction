import { Body, Controller, Get, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { accountOf } from '../common/utils/account';
import { ChallengesService } from './challenges.service';

/** Défis quotidiens et hebdomadaires : rien n'est misé, donc aucune permission « dépenser » n'est demandée aux profils d'un compte famille. */
@Controller('games/challenges')
export class ChallengesController {
  constructor(private challenges: ChallengesService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  overview(@Request() req: any) { return this.challenges.overview(accountOf(req)); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Get('admin')
  admin() { return this.challenges.adminOverview(); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Put('admin')
  async save(@Body() body: any, @Request() req: any) { return { config: await this.challenges.saveConfig({ userId: req.user.userId, username: req.user.username }, body, req.ip) }; }
}
