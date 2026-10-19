import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { StaffBoardService } from './staff-board.service';

/** Tableau de bord de l'équipe : files d'attente, délais de traitement, activité. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
@Controller('staff/board')
export class StaffBoardController {
  constructor(private board: StaffBoardService) {}

  @Get()
  get(@Request() req: any) { return this.board.board({ userId: req.user.accountId ?? req.user.userId, role: req.user.role }); }
}
