import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { StaffMembersService } from './staff-members.service';

/** Listes de membres de l'équipe : tous, en ligne, qui seedent (tuiles « La communauté » de l'accueil). */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
@Controller('staff/members')
export class StaffMembersController {
  constructor(private members: StaffMembersService) {}

  @Get()
  list(@Query() q: any) { return this.members.list({ ...q, page: Number(q?.page) }); }

  @Get('online')
  online() { return this.members.online(); }

  @Get('seeders')
  seeders(@Query() q: any) { return this.members.seeders(q ?? {}); }
}
