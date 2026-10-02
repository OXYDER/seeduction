import { Body, Controller, Get, Post, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { accountOf, assertMaster } from '../common/utils/account';

const ipOf = (req: any): string | null => (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? null;

/**
 * Adresse IP du visiteur pour les limites d'inscription : on ne se fie pas à la PREMIÈRE valeur de X-Forwarded-For (un
 * visiteur peut en envoyer une fausse), mais à celle ajoutée par notre chaîne de proxys. TRUSTED_PROXY_HOPS = nombre de
 * proxys devant le backend qui ajoutent l'adresse de leur client (2 par défaut : Nginx Proxy Manager + le nginx du site ;
 * 3 si Cloudflare est devant).
 */
const trustedIpOf = (req: any): string | null => {
  const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? 2) || 2);
  const parts = String(req.headers?.['x-forwarded-for'] ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return req.ip ?? null;
  return parts[Math.max(0, parts.length - hops)] ?? null;
};

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  register(@Body() body: { inviteCode: string; username: string; email: string; password: string }, @Request() req: any) {
    return this.authService.register(body.inviteCode, body.username, body.email, body.password, trustedIpOf(req));
  }

  @Post('login')
  login(@Body() body: { usernameOrEmail: string; password: string; totpToken?: string }, @Request() req: any) {
    return this.authService.login(body.usernameOrEmail, body.password, body.totpToken, ipOf(req));
  }

  // ---- double authentification (2FA)

  @UseGuards(JwtAuthGuard)
  @Get('2fa/status')
  twoFactorStatus(@Request() req: any) {
    assertMaster(req);
    return this.authService.twoFactorStatus(accountOf(req));
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/setup')
  setup2FA(@Request() req: any) {
    assertMaster(req);
    return this.authService.setup2FA(accountOf(req));
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/confirm')
  confirm2FA(@Body('token') token: string, @Request() req: any) {
    assertMaster(req);
    return this.authService.confirm2FA(accountOf(req), token, ipOf(req));
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/disable')
  disable2FA(@Body() body: { password: string; token: string }, @Request() req: any) {
    assertMaster(req);
    return this.authService.disable2FA(accountOf(req), body.password, body.token, ipOf(req));
  }

  // ---- mot de passe

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(@Body() body: { currentPassword: string; newPassword: string }, @Request() req: any) {
    assertMaster(req);
    return this.authService.changePassword(accountOf(req), body.currentPassword, body.newPassword, ipOf(req));
  }

  @Get('features')
  features() {
    return { emailReset: this.authService.emailResetAvailable };
  }

  @Post('forgot-password')
  forgotPassword(@Body('email') email: string, @Request() req: any) {
    return this.authService.forgotPassword(email, ipOf(req));
  }

  @Post('reset-password')
  resetPassword(@Body() body: { token: string; newPassword: string }, @Request() req: any) {
    return this.authService.resetPassword(body.token, body.newPassword, ipOf(req));
  }

  @UseGuards(JwtAuthGuard)
  @Get('logins')
  recentLogins(@Request() req: any) {
    assertMaster(req);
    return this.authService.recentLogins(accountOf(req));
  }

  @UseGuards(JwtAuthGuard)
  @Post('invite')
  createInvite(@Request() req: any) {
    assertMaster(req);
    return this.authService.createInvite(accountOf(req));
  }
}
