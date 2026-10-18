import { Body, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { DonationWebhooksService } from './donation-webhooks.service';

/**
 * Points d'entrée appelés par Ko-fi et Buy Me a Coffee (sans connexion : c'est la plateforme qui appelle). Chaque message est vérifié (jeton Ko-fi, signature Buy Me a Coffee) ;
 * un message invalide reçoit un simple refus. Les plateformes attendent une réponse 200 rapide.
 */
@Controller('donations/webhook')
export class DonationWebhooksController {
  constructor(private hooks: DonationWebhooksService) {}

  @Post('kofi')
  @HttpCode(200)
  async kofi(@Body() body: any) { await this.hooks.receiveKofi(body); return { ok: true }; }

  @Post('bmc')
  @HttpCode(200)
  async bmc(@Body() body: any, @Headers('x-signature-sha256') signature: string | undefined, @Req() req: any) { await this.hooks.receiveBmc(req.rawBody, signature, body); return { ok: true }; }
}
