import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { MetadataService } from '../metadata/metadata.service';
import { NotificationsService } from '../notifications/notifications.service';
import { jobMonitor } from '../common/utils/job-monitor';
import { seriesTitleOf, numVariants } from '../common/utils/watch-progress';
import { Ep, countdownLabel, daysUntil, epKey, epLabel, isNewForFollow, noticesFor, seriesKeyOf, torrentEp } from '../common/utils/series-follow';

const MAX_FOLLOWS = 100;
const TV = { select: { id: true, name: true, season: true, episode: true, metaSource: true, metaExternalId: true, metadata: true, coverImage: true, status: true, uploaderId: true } } as const;

/**
 * « Prochain épisode de cette série dès qu'il sort » : un membre suit une série (depuis la fiche d'un de ses torrents) ; chaque jour, TMDB dit quel est le prochain épisode et quand il sort.
 * On prévient la veille, le jour de la sortie, puis dès qu'un torrent de cet épisode est approuvé sur Seeduction. Les notifications passent par la cloche, le push et les autres canaux du membre.
 */
@Injectable()
export class SeriesFollowService {
  private readonly logger = new Logger(SeriesFollowService.name);
  private running = false;

  constructor(private prisma: PrismaService, private metadata: MetadataService, private notifications: NotificationsService) {}

  private async seriesOf(torrentId: string) {
    const t = await this.prisma.torrent.findUnique({ where: { id: torrentId }, ...TV });
    if (!t) throw new NotFoundException('Torrent introuvable');
    const key = seriesKeyOf(t);
    return { t, key };
  }

  /** La fiche d'un torrent : peut-on suivre sa série, et la suis-je déjà ? */
  async statusFor(userId: string, torrentId: string) {
    const { t, key } = await this.seriesOf(torrentId);
    if (!key) return { followable: false, following: false };
    const f = await this.prisma.seriesFollow.findUnique({ where: { userId_metaSource_metaExternalId: { userId, metaSource: key.source, metaExternalId: key.id } } });
    return { followable: true, following: !!f, title: seriesTitleOf(t.name), follow: f ? this.shape(f) : null };
  }

  async follow(userId: string, torrentId: string) {
    const { t, key } = await this.seriesOf(torrentId);
    if (!key) throw new BadRequestException('Ce torrent n\'est pas rattaché à une fiche de série : impossible de la suivre.');
    const existing = await this.prisma.seriesFollow.findUnique({ where: { userId_metaSource_metaExternalId: { userId, metaSource: key.source, metaExternalId: key.id } } });
    if (existing) return this.shape(existing);
    if ((await this.prisma.seriesFollow.count({ where: { userId } })) >= MAX_FOLLOWS) throw new BadRequestException(`Tu suis déjà ${MAX_FOLLOWS} séries : retires-en une pour en suivre une autre.`);
    const f = await this.prisma.seriesFollow.create({
      data: { userId, metaSource: key.source, metaExternalId: key.id, title: seriesTitleOf(t.name) || 'Série', cover: t.coverImage ?? null },
    });
    await this.refreshOne(f.id, { firstTime: true }).catch((e) => this.logger.warn(`Suivi de série : TMDB injoignable (${e?.message ?? e})`));
    return this.shape((await this.prisma.seriesFollow.findUnique({ where: { id: f.id } }))!);
  }

  async unfollow(userId: string, id: string) {
    const r = await this.prisma.seriesFollow.deleteMany({ where: { id, userId } });
    if (r.count === 0) throw new NotFoundException('Série suivie introuvable');
    return { ok: true };
  }

  private shape(f: { id: string; title: string; cover: string | null; status: string | null; nextAirDate: string | null; nextSeason: number | null; nextEpisode: number | null; nextName: string | null; lastAirDate: string | null; lastSeason: number | null; lastEpisode: number | null; checkedAt: Date | null; metaSource: string; metaExternalId: string }) {
    const days = daysUntil(f.nextAirDate);
    const next = f.nextSeason !== null && f.nextEpisode !== null ? { season: f.nextSeason, episode: f.nextEpisode } : null;
    const last = f.lastSeason !== null && f.lastEpisode !== null ? { season: f.lastSeason, episode: f.lastEpisode } : null;
    return {
      id: f.id, title: f.title, cover: f.cover, status: f.status, checkedAt: f.checkedAt,
      next: next ? { ...next, label: epLabel(next), name: f.nextName, airDate: f.nextAirDate, days, countdown: countdownLabel(days) } : null,
      last: last ? { ...last, label: epLabel(last), airDate: f.lastAirDate } : null,
    };
  }

  /** Mes séries suivies, la sortie la plus proche d'abord, avec ce qui est déjà sur Seeduction pour le prochain épisode. */
  async list(userId: string) {
    const rows = await this.prisma.seriesFollow.findMany({ where: { userId }, take: MAX_FOLLOWS });
    const out = await Promise.all(rows.map(async (f) => {
      const s = this.shape(f);
      // Le dernier épisode déjà disponible sur Seeduction (le plus récent par numéro).
      const eps = await this.prisma.torrent.findMany({
        where: { status: 'APPROVED', metaSource: f.metaSource, metaExternalId: f.metaExternalId, season: { not: null }, episode: { not: null } },
        select: { id: true, season: true, episode: true }, take: 400,
      });
      let latest: { id: string; ep: Ep } | null = null;
      for (const t of eps) { const e = torrentEp(t); if (e && (!latest || e.season > latest.ep.season || (e.season === latest.ep.season && e.episode > latest.ep.episode))) latest = { id: t.id, ep: e }; }
      let nextOnSite: string | null = null;
      if (s.next) {
        const hit = await this.prisma.torrent.findFirst({ where: { status: 'APPROVED', metaSource: f.metaSource, metaExternalId: f.metaExternalId, season: { in: numVariants(s.next.season) }, episode: { in: numVariants(s.next.episode) } }, select: { id: true } });
        nextOnSite = hit?.id ?? null;
      }
      return { ...s, latestOnSite: latest ? { torrentId: latest.id, label: epLabel(latest.ep) } : null, nextOnSite };
    }));
    return out.sort((a, b) => (a.next?.days ?? 99_999) - (b.next?.days ?? 99_999) || a.title.localeCompare(b.title));
  }

  // ------------------------------------------------------------------ rafraîchissement TMDB et notifications

  /** Met à jour un suivi depuis TMDB, puis envoie les notifications dues. */
  async refreshOne(id: string, opts: { firstTime?: boolean } = {}) {
    const f = await this.prisma.seriesFollow.findUnique({ where: { id } });
    if (!f) return;
    const info = await this.metadata.seriesAirInfo(f.metaExternalId);
    if (!info) return; // TMDB non configuré
    const data = {
      title: f.title || info.title, cover: f.cover ?? info.cover, status: info.status,
      nextAirDate: info.next?.airDate ?? null, nextSeason: info.next?.season ?? null, nextEpisode: info.next?.episode ?? null, nextName: info.next?.name?.slice(0, 160) ?? null,
      lastAirDate: info.last?.airDate ?? null, lastSeason: info.last?.season ?? null, lastEpisode: info.last?.episode ?? null,
      checkedAt: new Date(),
    };
    const first = opts.firstTime === true;
    // À la mise en suivi : ce qui est déjà sorti ne déclenche rien (pas de « sorti aujourd'hui » pour une série qu'on vient d'ajouter) et sert de point de départ.
    const baseline = first ? { baseSeason: info.last?.season ?? null, baseEpisode: info.last?.episode ?? null, notifiedAired: info.last ? epKey(info.last) : null } : {};
    const updated = await this.prisma.seriesFollow.update({ where: { id }, data: { ...data, ...baseline } });
    if (first) return;

    const notices = noticesFor({
      nextAirDate: updated.nextAirDate, next: updated.nextSeason !== null && updated.nextEpisode !== null ? { season: updated.nextSeason, episode: updated.nextEpisode } : null,
      lastAirDate: updated.lastAirDate, last: updated.lastSeason !== null && updated.lastEpisode !== null ? { season: updated.lastSeason, episode: updated.lastEpisode } : null,
      notifiedSoon: updated.notifiedSoon, notifiedAired: updated.notifiedAired,
    });
    for (const n of notices) {
      const label = `${updated.title} ${epLabel(n.ep)}`;
      const onSite = n.kind === 'aired' ? await this.availableTorrent(updated, n.ep) : null;
      await this.notifications.notify({
        userId: updated.userId, type: 'ANNOUNCEMENT', category: 'alerts', groupKey: `series:${updated.id}:${n.kind}:${epKey(n.ep)}`,
        title: n.kind === 'soon' ? `📺 Demain : ${label}` : `📺 ${label} vient de sortir`,
        body: n.kind === 'soon' ? 'Le prochain épisode sort demain. Tu seras prévenu dès qu\'il est sur Seeduction.' : onSite ? 'Il est déjà disponible sur Seeduction !' : 'Pas encore sur Seeduction : tu seras prévenu dès qu\'un torrent est approuvé.',
        link: onSite ? `/torrents/${onSite}` : '/series',
      }).catch(() => undefined);
      await this.prisma.seriesFollow.update({ where: { id }, data: n.kind === 'soon' ? { notifiedSoon: epKey(n.ep) } : { notifiedAired: epKey(n.ep) } });
    }
  }

  private async availableTorrent(f: { metaSource: string; metaExternalId: string }, ep: Ep): Promise<string | null> {
    const t = await this.prisma.torrent.findFirst({
      where: { status: 'APPROVED', metaSource: f.metaSource, metaExternalId: f.metaExternalId, season: { in: numVariants(ep.season) }, episode: { in: numVariants(ep.episode) } },
      orderBy: { seeders: 'desc' }, select: { id: true },
    });
    return t?.id ?? null;
  }

  /** Chaque jour à 6 h (Montréal) : met à jour toutes les séries suivies (une requête TMDB par série, quel que soit le nombre de suiveurs) et envoie les notifications dues. */
  @Cron('0 6 * * *', { timeZone: 'America/Toronto' })
  async daily() {
    jobMonitor.run('series.suivi');
    try { await this.refreshAll(); } catch (e) { jobMonitor.fail('series.suivi', e); this.logger.warn(`Suivi de séries : ${(e as Error).message}`); }
  }

  async refreshAll(): Promise<{ series: number; follows: number }> {
    if (this.running) return { series: 0, follows: 0 };
    this.running = true;
    try {
      const rows = await this.prisma.seriesFollow.findMany({ select: { id: true, metaExternalId: true } });
      const bySeries = new Map<string, string[]>();
      for (const r of rows) bySeries.set(r.metaExternalId, [...(bySeries.get(r.metaExternalId) ?? []), r.id]);
      let n = 0;
      for (const [, ids] of bySeries) {
        for (const id of ids) {
          try { await this.refreshOne(id); n++; } catch (e: any) { this.logger.warn(`Série ${id} : ${e?.message ?? e}`); break; } // TMDB injoignable : on réessaiera demain
        }
        await new Promise((r) => setTimeout(r, 250)); // ménage les limites de TMDB
      }
      return { series: bySeries.size, follows: n };
    } finally { this.running = false; }
  }

  /** Un torrent vient d'être approuvé : prévient ceux qui suivent sa série (épisode à partir de celui du jour de la mise en suivi), sauf son envoyeur. */
  async onTorrentApproved(torrentId: string) {
    const t = await this.prisma.torrent.findUnique({ where: { id: torrentId }, ...TV });
    if (!t) return 0;
    const key = seriesKeyOf(t), ep = torrentEp(t);
    if (!key || !ep) return 0;
    const follows = await this.prisma.seriesFollow.findMany({ where: { metaSource: key.source, metaExternalId: key.id, userId: { not: t.uploaderId } } });
    let n = 0;
    for (const f of follows) {
      const base = f.baseSeason !== null && f.baseEpisode !== null ? { season: f.baseSeason, episode: f.baseEpisode } : null;
      if (!isNewForFollow(ep, base)) continue;
      await this.notifications.notify({
        userId: f.userId, type: 'ANNOUNCEMENT', category: 'alerts', groupKey: `series:${f.id}:available:${epKey(ep)}`, titleMany: `📺 ${f.title} ${epLabel(ep)} : {n} versions disponibles`,
        title: `📺 ${f.title} ${epLabel(ep)} est disponible`, body: t.name, link: `/torrents/${t.id}`,
      }).then(() => { n++; }).catch(() => undefined);
    }
    return n;
  }
}
