import { Body, Controller, Delete, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TelegramService } from './telegram.service';

const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'] as const;

/** Telegram : page « Telegram » du compte (rejoindre, lier son compte) et réglages de l'équipe (modérateurs et plus). */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('telegram')
export class TelegramController {
  constructor(private telegram: TelegramService) {}

  // --- Membres ---

  @Get('info')
  info(@Request() req: any) { return this.telegram.info(req.user.userId); }

  @Post('link-code')
  linkCode(@Request() req: any) { return this.telegram.createLinkCode(req.user.userId); }

  @Delete('link')
  unlink(@Request() req: any) { return this.telegram.unlink(req.user.userId); }

  // --- Administrateurs ---

  @Get('admin')
  @Roles(...STAFF)
  overview() { return this.telegram.adminOverview(); }

  @Put('admin')
  @Roles(...STAFF)
  save(@Body() body: any) { return this.telegram.saveAdmin(body ?? {}); }

  @Post('admin/test')
  @Roles(...STAFF)
  test(@Body() body: any) { return this.telegram.test(body ?? {}); }

  @Post('admin/channel')
  @Roles(...STAFF)
  createChannel(@Request() req: any) { return this.telegram.createChannel({ userId: req.user.userId, username: req.user.username, role: req.user.role }); }

  @Delete('admin/links/:userId')
  @Roles(...STAFF)
  adminUnlink(@Param('userId') userId: string) { return this.telegram.adminUnlink(userId); }
}
