import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TelegramService } from '../telegram/telegram.service';
import { TorrentsService, type TorrentFilters } from '../torrents/torrents.service';
import { normalizeOrigin } from '../common/utils/facets';
import { MAX_SAVED_SEARCHES, defaultName, describeQuery, sanitizeQuery, type SavedQuery } from '../common/utils/saved-search';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Les paramètres enregistrés (ceux de la page Parcourir) → les filtres de recherche de torrents. */
export function filtersOf(q: SavedQuery): TorrentFilters {
  const attrFilters: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(q)) if (k.startsWith('f.')) attrFilters[k.slice(2)] = v.split('|');
  return {
    attrFilters, categoryId: q.categoryId, search: q.search, year: q.year ? Number(q.year) : undefined, language: q.language, origin: normalizeOrigin(q.origin), resolution: q.resolution, codec: q.codec,
    hdr: q.hdr === 'true' ? true : undefined, audio: q.audio, source: q.source, containerFormat: q.containerFormat, genre: q.genre, entityId: q.entityId, role: q.role,
    minSize: q.minSize ? Number(q.minSize) * 1e9 : undefined, maxSize: q.maxSize ? Number(q.maxSize) * 1e9 : undefined,
  };
}

/** Alertes de recherche (page « Alertes ») : enregistrer, tester, activer ; et la vérification de toutes les 5 minutes qui envoie les alertes. */
@Injectable()
export class SavedSearchesService {
  private readonly logger = new Logger(SavedSearchesService.name);
  private running = false;

  constructor(private prisma: PrismaService, private torrents: TorrentsService, private notifications: NotificationsService, private telegram: TelegramService) {}

  private view(r: any) {
    return { id: r.id, name: r.name, query: r.query as SavedQuery, summary: describeQuery(r.query as SavedQuery), inApp: r.inApp, telegram: r.telegram, active: r.active, lastMatchAt: r.lastMatchAt, matchCount: r.matchCount, createdAt: r.createdAt };
  }

  async list(userId: string) {
    const [rows, link] = await Promise.all([
      this.prisma.savedSearch.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.telegramLink.findUnique({ where: { userId }, select: { id: true } }),
    ]);
    return { max: MAX_SAVED_SEARCHES, telegramLinked: !!link, items: rows.map((r) => this.view(r)) };
  }

  private async assertTelegram(userId: string, want: boolean) {
    if (want && !(await this.prisma.telegramLink.findUnique({ where: { userId }, select: { id: true } }))) throw new BadRequestException("Relie d'abord ton compte à Telegram (page « Telegram » du compte) pour recevoir les alertes là-bas");
  }

  async create(userId: string, body: { name?: string; query?: unknown; inApp?: boolean; telegram?: boolean }) {
    const query = sanitizeQuery(body.query);
    if (!query) throw new BadRequestException('Choisis au moins un mot ou un filtre pour cette alerte');
    if ((await this.prisma.savedSearch.count({ where: { userId } })) >= MAX_SAVED_SEARCHES) throw new BadRequestException(`Tu as déjà ${MAX_SAVED_SEARCHES} alertes : supprime-en une d'abord`);
    const telegram = body.telegram === true;
    await this.assertTelegram(userId, telegram);
    const row = await this.prisma.savedSearch.create({ data: { userId, name: String(body.name ?? '').trim().slice(0, 80) || defaultName(query), query: query as any, inApp: body.inApp !== false, telegram } });
    return this.view(row);
  }

  async update(userId: string, id: string, body: { name?: string; inApp?: boolean; telegram?: boolean; active?: boolean }) {
    const prev = await this.prisma.savedSearch.findUnique({ where: { id } });
    if (!prev || prev.userId !== userId) throw new NotFoundException('Alerte introuvable');
    if (body.telegram === true) await this.assertTelegram(userId, true);
    const row = await this.prisma.savedSearch.update({
      where: { id },
      data: {
        ...(typeof body.name === 'string' && body.name.trim() ? { name: body.name.trim().slice(0, 80) } : {}),
        ...(typeof body.inApp === 'boolean' ? { inApp: body.inApp } : {}), ...(typeof body.telegram === 'boolean' ? { telegram: body.telegram } : {}),
        // remise en marche : on repart de maintenant, sans déverser des mois de nouveautés
        ...(typeof body.active === 'boolean' ? { active: body.active, ...(body.active && !prev.active ? { lastCheckedAt: new Date() } : {}) } : {}),
      },
    });
    return this.view(row);
  }

  async remove(userId: string, id: string) {
    const prev = await this.prisma.savedSearch.findUnique({ where: { id } });
    if (!prev || prev.userId !== userId) throw new NotFoundException('Alerte introuvable');
    await this.prisma.savedSearch.delete({ where: { id } });
    return { ok: true };
  }

  /** Combien de torrents actuels correspondent (et lesquels, les plus récents), pour vérifier qu'une alerte est bien réglée avant de l'enregistrer. */
  async preview(userId: string, queryInput: unknown) {
    const query = sanitizeQuery(queryInput);
    if (!query) throw new BadRequestException('Choisis au moins un mot ou un filtre');
    const where = await this.torrents.buildWhere({ ...filtersOf(query), viewerId: userId });
    const [total, sample] = await Promise.all([
      this.prisma.torrent.count({ where }),
      this.prisma.torrent.findMany({ where, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, name: true, createdAt: true } }),
    ]);
    return { total, summary: describeQuery(query), sample };
  }

  /** Toutes les 5 minutes : les torrents apparus (ou approuvés) depuis la dernière vérification de chaque alerte, et les alertes qui vont avec. */
  @Cron('*/5 * * * *')
  async check() {
    if (this.running) return;
    this.running = true;
    try {
      const tick = new Date();
      const searches = await this.prisma.savedSearch.findMany({ where: { active: true }, orderBy: { lastCheckedAt: 'asc' }, take: 2000 });
      if (searches.length === 0) return;
      // rien de nouveau depuis la plus ancienne vérification : on passe les alertes à « à jour » sans les chercher une par une
      const oldest = searches[0].lastCheckedAt;
      const fresh = await this.prisma.torrent.count({ where: { status: 'APPROVED', OR: [{ approvedAt: { gt: oldest } }, { approvedAt: null, createdAt: { gt: oldest } }] } });
      if (fresh === 0) { await this.prisma.savedSearch.updateMany({ where: { id: { in: searches.map((s) => s.id) } }, data: { lastCheckedAt: tick } }); return; }
      for (const s of searches) {
        try { await this.checkOne(s, tick); } catch (e: any) { this.logger.warn(`Alerte « ${s.name} » : ${e?.message ?? e}`); }
      }
    } finally { this.running = false; }
  }

  /** « Vérifier maintenant » : la même vérification que celle de toutes les 5 minutes, pour une seule alerte. */
  async checkNow(userId: string, id: string) {
    const s = await this.prisma.savedSearch.findUnique({ where: { id } });
    if (!s || s.userId !== userId) throw new NotFoundException('Alerte introuvable');
    const found = await this.checkOne(s, new Date());
    return { found, item: this.view(await this.prisma.savedSearch.findUniqueOrThrow({ where: { id } })) };
  }

  private async checkOne(s: { id: string; userId: string; name: string; query: unknown; inApp: boolean; telegram: boolean; lastCheckedAt: Date }, tick: Date): Promise<number> {
    const query = sanitizeQuery(s.query);
    if (!query) { await this.prisma.savedSearch.update({ where: { id: s.id }, data: { active: false } }); return 0; }
    const base = await this.torrents.buildWhere({ ...filtersOf(query), viewerId: s.userId });
    const since = s.lastCheckedAt;
    const where = { AND: [base, { OR: [{ approvedAt: { gt: since, lte: tick } }, { approvedAt: null, createdAt: { gt: since, lte: tick } }] }] };
    const [count, rows] = await Promise.all([
      this.prisma.torrent.count({ where }),
      this.prisma.torrent.findMany({ where, orderBy: { createdAt: 'desc' }, take: 3, select: { id: true, name: true } }),
    ]);
    if (count === 0) { await this.prisma.savedSearch.update({ where: { id: s.id }, data: { lastCheckedAt: tick } }); return 0; }
    const site = (process.env.SITE_URL ?? '').replace(/\/$/, '');
    const link = count === 1 ? `/torrents/${rows[0].id}` : `/browse?${new URLSearchParams(query).toString()}`;
    const names = rows.map((r) => r.name);
    if (s.inApp) {
      await this.notifications.notify({
        userId: s.userId, type: 'SYSTEM', category: 'alerts', groupKey: `ss:${s.id}`,
        title: `🔔 ${s.name} : 1 nouveau torrent`, titleMany: `🔔 ${s.name} : nouveaux torrents`,
        body: count > 3 ? `${names.join(' · ')} … (${count} au total)` : names.join(' · '), link,
      }).catch(() => undefined);
    }
    if (s.telegram) {
      const lines = rows.map((r) => `• <a href="${site}/torrents/${r.id}">${esc(r.name)}</a>`).join('\n');
      await this.telegram.dm(s.userId, `🔔 <b>${esc(s.name)}</b> : ${count} nouveau${count > 1 ? 'x' : ''} torrent${count > 1 ? 's' : ''}\n${lines}${count > 3 ? `\n… et ${count - 3} autre${count > 4 ? 's' : ''}` : ''}${site ? `\n\n<a href="${site}${link}">Voir sur Seeduction</a>` : ''}`).catch(() => undefined);
    }
    await this.prisma.savedSearch.update({ where: { id: s.id }, data: { lastCheckedAt: tick, lastMatchAt: tick, matchCount: { increment: count } } });
    return count;
  }
}
