import { Body, Controller, Delete, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PushService } from './push.service';

/** Notifications push de l'appareil : clé publique, abonnement, appareils, essai. L'abonnement est celui du profil actif. */
@UseGuards(JwtAuthGuard)
@Controller('push')
export class PushController {
  constructor(private push: PushService) {}

  @Get('key')
  async key() { return { publicKey: await this.push.publicKey() }; }

  @Get('status')
  status(@Request() req: any) { return this.push.status(req.user.userId); }

  @Post('subscribe')
  subscribe(@Body() body: any, @Request() req: any) { return this.push.subscribe(req.user.userId, body ?? {}); }

  @Post('unsubscribe')
  unsubscribe(@Body('endpoint') endpoint: string, @Request() req: any) { return this.push.unsubscribe(req.user.userId, endpoint); }

  @Delete('devices/:id')
  removeDevice(@Param('id') id: string, @Request() req: any) { return this.push.removeDevice(req.user.userId, id); }

  @Post('test')
  test(@Request() req: any) { return this.push.test(req.user.userId); }
}
