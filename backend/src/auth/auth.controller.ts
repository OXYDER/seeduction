import { Body, Controller, Post, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  register(@Body() body: { inviteCode: string; username: string; email: string; password: string }) {
    return this.authService.register(body.inviteCode, body.username, body.email, body.password);
  }

  @Post('login')
  login(@Body() body: { usernameOrEmail: string; password: string; totpToken?: string }) {
    return this.authService.login(body.usernameOrEmail, body.password, body.totpToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enable')
  enable2FA(@Request() req: any) {
    return this.authService.enable2FA(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('invite')
  createInvite(@Request() req: any) {
    return this.authService.createInvite(req.user.userId);
  }
}
