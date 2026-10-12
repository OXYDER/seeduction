import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { NOTIFICATION_CATEGORIES, NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  /**
   * Liste : `limit`, `category` (onglet), `unread=1`, `sort=recent|oldest|unread`, `offset` (« Voir plus »). Sans `offset` ni filtre, renvoie un simple tableau
   * (compatible avec l'ancienne cloche) ; avec l'un d'eux, `{ items, next }`.
   */
  @Get()
  async list(@Request() req: any, @Query() q: Record<string, string>) {
    const res = await this.notificationsService.list(req.user.userId, {
      limit: q.limit ? parseInt(q.limit, 10) : 30, category: q.category, unread: q.unread === '1', sort: q.sort, offset: q.offset ? parseInt(q.offset, 10) : 0,
    });
    return q.page === '1' ? res : res.items;
  }

  @Get('unread-count')
  unreadCount(@Request() req: any) {
    return this.notificationsService.unreadCount(req.user.userId);
  }

  /** Onglets : catégories, avec leurs non lues et leur total. */
  @Get('summary')
  async summary(@Request() req: any) {
    return { categories: NOTIFICATION_CATEGORIES, ...(await this.notificationsService.summary(req.user.userId)) };
  }

  @Get('preferences')
  async preferences(@Request() req: any) {
    return { categories: NOTIFICATION_CATEGORIES, prefs: await this.notificationsService.prefsOf(req.user.userId) };
  }

  @Put('preferences')
  async setPreferences(@Body('prefs') prefs: Record<string, boolean>, @Request() req: any) {
    return { prefs: await this.notificationsService.setPrefs(req.user.userId, prefs ?? {}) };
  }

  @Post('read-all')
  markAllRead(@Request() req: any, @Body('category') category?: string) {
    return this.notificationsService.markAllRead(req.user.userId, category);
  }

  /** Ouvrir une page lit d'office les notifications qui y mènent. */
  @Post('read-by-link')
  readByLink(@Body('links') links: string[], @Request() req: any) {
    return this.notificationsService.markReadByLink(req.user.userId, Array.isArray(links) ? links : []);
  }

  /** Supprime les notifications déjà lues (un onglet ou toutes). */
  @Delete('read')
  removeRead(@Request() req: any, @Query('category') category?: string) {
    return this.notificationsService.removeRead(req.user.userId, category);
  }

  @Post(':id/read')
  markRead(@Param('id') id: string, @Request() req: any) {
    return this.notificationsService.markRead(req.user.userId, id);
  }

  @Post(':id/unread')
  markUnread(@Param('id') id: string, @Request() req: any) {
    return this.notificationsService.markUnread(req.user.userId, id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.notificationsService.remove(req.user.userId, id);
  }
}
