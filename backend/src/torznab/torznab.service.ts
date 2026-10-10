import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { SettingsService } from '../settings/settings.service';
import { TorrentsService } from '../torrents/torrents.service';
import { ECONOMY } from '../common/utils/economy';
import { FeedItem, TorznabQuery, capsXml, errorXml, feedXml, torznabCategoriesFor, torznabTopOf } from './torznab-core';

/** Erreur Torznab : renvoyée au client sous forme de <error code="..." description="..."/>. */
export class TorznabError extends Error {
  constructor(public code: number, message: string) { super(message); }
}

const FUNCTION_TOP: Record<string, number> = { tvsearch: 5000, movie: 2000, music: 3000, book: 7000 };

/**
 * Torznab / RSS : cherche dans les torrents approuvés avec les mêmes règles que Parcourir (contenu adulte masqué si l'option n'est pas activée dans le compte)
 * et donne pour chacun un lien de téléchargement personnel (clé API dans l'adresse) : le .torrent contient la passkey du propriétaire de la clé.
 */
@Injectable()
export class TorznabService {
  private limits = new Map<string, { n: number; reset: number }>();
  private catCache: { at: number; byId: Map<string, number> } | null = null;

  constructor(private prisma: PrismaService, private apiKeys: ApiKeysService, private torrents: TorrentsService, private settings: SettingsService) {}

  /** Adresse publique du site (SITE_URL), sinon celle de la requête. */
  siteUrl(req: { protocol?: string; get?: (h: string) => string | undefined; headers?: Record<string, any> }): string {
    const env = (process.env.SITE_URL ?? '').replace(/\/+$/, '');
    if (env) return env;
    const proto = String(req.headers?.['x-forwarded-proto'] ?? req.protocol ?? 'https').split(',')[0];
    return `${proto}://${req.get?.('host') ?? 'localhost'}`;
  }

  caps(site: string) {
    return capsXml(site);
  }

  /** Valide la clé et sa portée, vérifie le compte et limite le débit (120 requêtes par minute et par clé). */
  async authenticate(rawKey: string | undefined, scope: string): Promise<{ userId: string }> {
    if (!rawKey) throw new TorznabError(100, 'Clé API manquante (paramètre apikey)');
    const key = await this.apiKeys.validate(rawKey);
    if (!key) throw new TorznabError(100, 'Clé API invalide ou révoquée');
    if (!key.scopes.includes(scope)) throw new TorznabError(105, `Cette clé n'a pas la portée « ${scope} » : crée une clé avec cette portée dans ton profil`);
    const user = await this.prisma.user.findUnique({ where: { id: key.userId }, select: { id: true, status: true } });
    if (!user || user.status === 'BANNED') throw new TorznabError(101, 'Compte suspendu');
    const now = Date.now();
    const cur = this.limits.get(key.id);
    if (!cur || cur.reset < now) this.limits.set(key.id, { n: 1, reset: now + 60_000 });
    else if (++cur.n > 120) throw new TorznabError(500, 'Trop de requêtes : 120 par minute au maximum');
    if (this.limits.size > 5000) for (const [k, v] of this.limits) if (v.reset < now) this.limits.delete(k);
    return { userId: user.id };
  }

  /** id de catégorie Seeduction -> catégorie principale Torznab (mise en cache une minute). */
  private async categoryTops(): Promise<Map<string, number>> {
    if (this.catCache && Date.now() - this.catCache.at < 60_000) return this.catCache.byId;
    const cats = await this.prisma.category.findMany({ select: { id: true, name: true, parentId: true } });
    const name = new Map(cats.map((c) => [c.id, c.name]));
    const byId = new Map<string, number>();
    for (const c of cats) byId.set(c.id, torznabTopOf([...(c.parentId ? [name.get(c.parentId) ?? ''] : []), c.name]));
    this.catCache = { at: Date.now(), byId };
    return byId;
  }

  async search(q: TorznabQuery, userId: string, rawKey: string, site: string): Promise<string> {
    const tops = q.tops.length ? q.tops : FUNCTION_TOP[q.t] ? [FUNCTION_TOP[q.t]] : [];
    let categoryIds: string[] | undefined;
    if (tops.length) {
      const byId = await this.categoryTops();
      categoryIds = [...byId].filter(([, top]) => tops.includes(top)).map(([id]) => id);
      if (categoryIds.length === 0) return feedXml(site, [], { total: 0, offset: q.offset, minSeedSeconds: ECONOMY.hnrSeedHours * 3600, minRatio: ECONOMY.hnrRatio });
    }
    const page = Math.floor(q.offset / q.limit) + 1;
    const r = await this.torrents.list({
      page, pageSize: q.limit, viewerId: userId,
      categoryIds, searchTokens: q.tokens, season: q.t === 'tvsearch' ? q.season : undefined, episode: q.t === 'tvsearch' && q.season != null ? q.ep : undefined,
      tmdbId: q.tmdbid, year: q.t === 'movie' || q.t === 'music' ? q.year : undefined,
      language: q.language, resolution: q.resolution, source: q.source, codec: q.codec, audio: q.audio, freeleechOnly: q.freeleech, minSeeders: q.minseeders,
      sort: q.sort === 'seeders' ? 'seeders' : q.sort === 'size' ? 'taille' : 'date', order: 'desc',
    });
    const globalFree = await this.settings.freeleechUntil();
    const gFree = !!globalFree && globalFree.getTime() > Date.now();
    const items: FeedItem[] = r.items.map((t: any) => ({
      id: t.id, name: t.name, createdAt: t.createdAt, size: Number(t.size), seeders: t.seeders, leechers: t.leechers, completed: t.completedCount, infoHash: t.infoHash,
      categories: torznabCategoriesFor({ path: [t.category?.parent?.name, t.category?.name].filter(Boolean), resolution: t.resolution, season: t.season, episode: t.episode, audio: t.audio, source: t.source, containerFormat: t.containerFormat }),
      downloadUrl: `${site}/api/torznab/download/${t.id}?apikey=${encodeURIComponent(rawKey)}`,
      detailUrl: `${site}/torrents/${t.id}`,
      coverUrl: t.coverImage ? (String(t.coverImage).startsWith('http') ? t.coverImage : `${site}${t.coverImage}`) : null,
      tmdbId: t.metaSource === 'tmdb' ? t.metaExternalId : null,
      freeleech: !!t.freeleech || gFree, doubleUpload: !!t.doubleUpload,
      description: [t.category?.name, t.language, t.resolution, t.source].filter(Boolean).join(' · '),
    }));
    return feedXml(site, items, { total: r.total, offset: q.offset, minSeedSeconds: ECONOMY.hnrSeedHours * 3600, minRatio: ECONOMY.hnrRatio });
  }

  /** .torrent personnalisé (passkey du propriétaire de la clé), comme le téléchargement depuis le site. */
  download(id: string, userId: string): Promise<Buffer> {
    return this.torrents.getDownloadFile(id, userId, { viewerId: userId });
  }

  errorXml(e: TorznabError) {
    return errorXml(e.code, e.message);
  }
}
