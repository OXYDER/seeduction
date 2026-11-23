import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { accountOf } from '../common/utils/account';
import { PrismaService } from '../common/prisma.service';
import { RecapService } from './recap.service';

/** Mon récap du mois (du compte principal : les profils d'un compte famille partagent le même récap). */
@UseGuards(JwtAuthGuard)
@Controller('recap')
export class RecapController {
  constructor(private recap: RecapService, private prisma: PrismaService) {}

  @Get()
  async month(@Query('mois') mois: string | undefined, @Query('semaine') semaine: string | undefined, @Request() req: any) {
    const userId = accountOf(req);
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
    const created = u?.createdAt ?? new Date();
    // `semaine` (même vide) = « Ma semaine » (clé : le lundi) ; sinon le récap du mois.
    const week = semaine !== undefined;
    const body = week ? await this.recap.weekly(userId, semaine || undefined) : await this.recap.monthly(userId, mois);
    return { ...body, kind: week ? 'week' : 'month', months: this.recap.months(created), weeks: this.recap.weeks(created) };
  }
}
