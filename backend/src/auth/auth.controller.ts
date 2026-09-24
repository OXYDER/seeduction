import { Body, Controller, Get, Post, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

const ipOf = (req: any): string | null => (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? null;

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  register(@Body() body: { inviteCode: string; username: string; email: string; password: string }) {
    return this.authService.register(body.inviteCode, body.username, body.email, body.password);
  }

  @Post('login')
  login(@Body() body: { usernameOrEmail: string; password: string; totpToken?: string }, @Request() req: any) {
    return this.authService.login(body.usernameOrEmail, body.password, body.totpToken, ipOf(req));
  }

  // ---- double authentification (2FA)

  @UseGuards(JwtAuthGuard)
  @Get('2fa/status')
  twoFactorStatus(@Request() req: any) {
    return this.authService.twoFactorStatus(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/setup')
  setup2FA(@Request() req: any) {
    return this.authService.setup2FA(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/confirm')
  confirm2FA(@Body('token') token: string, @Request() req: any) {
    return this.authService.confirm2FA(req.user.userId, token, ipOf(req));
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/disable')
  disable2FA(@Body() body: { password: string; token: string }, @Request() req: any) {
    return this.authService.disable2FA(req.user.userId, body.password, body.token, ipOf(req));
  }

  // ---- mot de passe

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(@Body() body: { currentPassword: string; newPassword: string }, @Request() req: any) {
    return this.authService.changePassword(req.user.userId, body.currentPassword, body.newPassword, ipOf(req));
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
    return this.authService.recentLogins(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('invite')
  createInvite(@Request() req: any) {
    return this.authService.createInvite(req.user.userId);
  }
}
