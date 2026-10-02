import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowAccountScope } from '../common/decorators/allow-account-scope.decorator';
import { FamilyService } from './family.service';

const ipOf = (req: any): string | null => (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? null;

/** Seul le profil principal (le compte lui-même, après son PIN) gère le compte famille. */
function assertMaster(req: any) {
  if (!req.user?.isMaster || req.user.scope !== 'profile') throw new ForbiddenException('Réservé au profil principal');
}

@UseGuards(JwtAuthGuard)
@Controller('family')
export class FamilyController {
  constructor(private family: FamilyService) {}

  // ---- sélection du profil (jeton de compte accepté)

  @AllowAccountScope()
  @Get('picker')
  picker(@Request() req: any) {
    return this.family.picker(req.user.accountId);
  }

  @AllowAccountScope()
  @Post('select')
  select(@Body() body: { profileId: string; pin: string }, @Request() req: any) {
    return this.family.select(req.user.accountId, body?.profileId, body?.pin, ipOf(req));
  }

  /** Changer de profil : on repasse par l'écran de choix (et donc par un PIN). */
  @Post('exit')
  exit(@Request() req: any) {
    return this.family.exit(req.user.accountId);
  }

  // ---- gestion (profil principal)

  @Get('state')
  state(@Request() req: any) {
    assertMaster(req);
    return this.family.state(req.user.accountId);
  }

  @Post('enable')
  enable(@Body() body: { password: string; pin: string }, @Request() req: any) {
    assertMaster(req);
    return this.family.enable(req.user.accountId, body?.password, body?.pin);
  }

  @Post('master-pin')
  masterPin(@Body() body: { password: string; pin: string }, @Request() req: any) {
    assertMaster(req);
    return this.family.setMasterPin(req.user.accountId, body?.password, body?.pin);
  }

  @Post('profiles')
  create(@Body() body: { name: string; pin: string; perms?: Record<string, boolean>; avatarUrl?: string | null }, @Request() req: any) {
    assertMaster(req);
    return this.family.createProfile(req.user.accountId, body ?? ({} as any));
  }

  @Patch('profiles/:id')
  update(@Param('id') id: string, @Body() body: { name?: string; perms?: Record<string, boolean>; avatarUrl?: string | null }, @Request() req: any) {
    assertMaster(req);
    return this.family.updateProfile(req.user.accountId, id, body ?? {});
  }

  @Post('profiles/:id/pin')
  resetPin(@Param('id') id: string, @Body('pin') pin: string, @Request() req: any) {
    assertMaster(req);
    return this.family.resetPin(req.user.accountId, id, pin);
  }

  @Post('profiles/:id/block')
  block(@Param('id') id: string, @Body('blocked') blocked: boolean, @Request() req: any) {
    assertMaster(req);
    return this.family.setBlocked(req.user.accountId, id, !!blocked);
  }

  // ---- supervision

  @Get('activity')
  activity(@Query() q: { profileId?: string; action?: string; before?: string; limit?: string }, @Request() req: any) {
    assertMaster(req);
    return this.family.activity(req.user.accountId, { profileId: q.profileId, action: q.action, before: q.before, limit: q.limit ? Number(q.limit) : undefined });
  }

  @Get('profiles/:id/conversations')
  childConversations(@Param('id') id: string, @Request() req: any) {
    assertMaster(req);
    return this.family.childConversations(req.user.accountId, id);
  }

  @Get('profiles/:id/conversations/:cid/messages')
  childMessages(@Param('id') id: string, @Param('cid') cid: string, @Query('before') before: string | undefined, @Request() req: any) {
    assertMaster(req);
    return this.family.childMessages(req.user.accountId, id, cid, before);
  }
}
