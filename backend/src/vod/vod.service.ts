import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomInt } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { AdultService } from '../adult/adult.service';
import { StreamService } from '../stream/stream.service';
import { RecommendationsService } from '../torrents/recommendations.service';
import { groupKeyOf, releaseTitle } from '../torrents/group-key';
import { numOf, seriesTitleOf } from '../common/utils/watch-progress';
import { bestPerEpisode, episodeLabel, parseEpisode, videoFiles, vodAccess, vodHealth, VOD_REASON_LABELS, VOD_RULE_TEXT, type EpisodeSource, type VodReason } from '../common/utils/vod';

/** Qui regarde : le profil actif (famille) et le compte (ratio, positions de lecture, droits). */
export interface VodViewer { userId: string; accountId: string; username: string; role: string; fam: boolean }

type Kind = 'FILM' | 'SERIE';
const PAIR_TTL_MS = 5 * 60_000;
const TOKEN_DAYS = 60;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans les caractères qu'on confond (0/O, 1/I/L)

/** Une catégorie de film ou de série (une sous-catégorie sans type propre hérite de celui de sa catégorie parente). */
const kindsWhere = (kinds: Kind[]) => ({ OR: [{ contentKind: { in: kinds } }, { contentKind: null, parent: { contentKind: { in: kinds } } }] });

const CARD_SELECT = {
  id: true, name: true, coverImage: true, year: true, resolution: true, language: true, seeders: true, season: true, episode: true, size: true, createdAt: true,
  metaSource: true, metaExternalId: true, metadata: true,
  category: { select: { slug: true, contentKind: true, parent: { select: { contentKind: true } } } },
} as const;

const DETAIL_SELECT = { ...CARD_SELECT, fileList: true, subtitles: true, hdr: true, audio: true, containerFormat: true, genres: true, categoryId: true } as const;

export interface VodItem {
  id: string;
  title: string;
  subtitle?: string;
  year?: number | null;
  kind?: 'film' | 'serie';
  cover: string | null;
  seeders?: number;
  health?: string;
  quality?: string | null;
  versions?: number;
  percent?: number | null;
  /** Lecture directe (« Reprendre », « Épisode suivant ») : sinon, on ouvre la fiche. */
  play?: { torrentId: string; fileIndex: number };
}

const kindOf = (row: any): 'film' | 'serie' => ((row.category?.contentKind ?? row.category?.parent?.contentKind) === 'SERIE' ? 'serie' : 'film');
const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;
const metaOf = (row: any) => (row.metadata && typeof row.metadata === 'object' ? (row.metadata as any) : {});
const titleOf = (row: any): string => {
  const main = metaOf(row)?.titles?.[0]?.title;
  if (typeof main === 'string' && main.trim()) return main.trim();
  return kindOf(row) === 'serie' ? seriesTitleOf(row.name) || releaseTitle(row.name) : releaseTitle(row.name);
};
const percentOf = (pos: number, dur: number | null) => (dur && dur > 0 ? Math.min(99, Math.round((pos / dur) * 100)) : null);

/**
 * « Seeduction Cinéma » : le catalogue de l'application Android (accueil en rails, recherche, fiche, lecture). Réservé aux donateurs, fondateurs et uploaders (voir common/utils/vod.ts).
 * Le catalogue est celui du site : films et séries approuvés qui ont au moins un seeder. Rien n'est « maison » : la disponibilité d'un titre est son nombre de seeders.
 */
@Injectable()
export class VodService {
  private pairings = new Map<string, { viewer: VodViewer; expiresAt: number }>();

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private adult: AdultService,
    private streams: StreamService,
    private recommendations: RecommendationsService,
  ) {}

  /** Le compte a-t-il (encore) droit au catalogue ? Vérifié à chaque appel : un don qui expire coupe l'accès. */
  async access(accountId: string): Promise<VodReason | null> {
    const u = await this.prisma.user.findUnique({ where: { id: accountId }, select: { role: true, founderAt: true, donorUntil: true, status: true, deletedAt: true } });
    if (!u || u.status === 'BANNED' || u.deletedAt) return null;
    return vodAccess(u);
  }

  async assertAccess(accountId: string): Promise<VodReason> {
    const reason = await this.access(accountId);
    if (!reason) throw new ForbiddenException(VOD_RULE_TEXT);
    return reason;
  }

  async status(accountId: string) {
    const reason = await this.access(accountId);
    return { eligible: !!reason, reason, label: reason ? VOD_REASON_LABELS[reason] : null, rule: VOD_RULE_TEXT };
  }

  /** Code d'association (5 minutes, une seule fois) affiché sur le site : l'application l'échange contre sa propre session, sans jamais demander le mot de passe. */
  async pair(viewer: VodViewer) {
    await this.assertAccess(viewer.accountId);
    const now = Date.now();
    for (const [k, v] of this.pairings) if (v.expiresAt < now) this.pairings.delete(k);
    if (this.pairings.size > 2000) this.pairings.clear();
    let code = '';
    do { code = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join(''); } while (this.pairings.has(code));
    this.pairings.set(code, { viewer, expiresAt: now + PAIR_TTL_MS });
    return { code, link: `seeduction://vod/${code}`, expiresInSeconds: PAIR_TTL_MS / 1000 };
  }

  async exchange(rawCode: string) {
    const code = String(rawCode ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const hit = this.pairings.get(code);
    if (!hit || hit.expiresAt < Date.now()) throw new UnauthorizedException("Code d'association invalide ou expiré : génère-en un nouveau sur le site (page Lecteur).");
    this.pairings.delete(code);
    const v = hit.viewer;
    await this.assertAccess(v.accountId);
    const payload = { sub: v.userId, username: v.username, role: v.role, ...(v.accountId !== v.userId ? { acct: v.accountId } : {}), ...(v.fam ? { fam: true } : {}) };
    const accessToken = this.jwt.sign(payload, { expiresIn: `${TOKEN_DAYS}d` });
    return { accessToken, username: v.username, expiresAt: new Date(Date.now() + TOKEN_DAYS * 86_400_000).toISOString() };
  }

  private async hiddenFor(viewer: VodViewer): Promise<string[]> {
    return this.adult.hiddenFor(viewer.userId);
  }

  /** Une carte par contenu (même fiche de métadonnées, sinon même titre) : la release la mieux seedée le représente. L'ordre d'arrivée est conservé. */
  private cards(rows: any[], limit: number): VodItem[] {
    const groups = new Map<string, any[]>();
    for (const r of rows) {
      const key = groupKeyOf({ name: r.name, metaSource: r.metaSource, metaExternalId: r.metaExternalId, category: { slug: r.category?.slug } });
      const g = groups.get(key);
      if (g) g.push(r); else groups.set(key, [r]);
    }
    const out: VodItem[] = [];
    for (const g of groups.values()) {
      const best = g.reduce((a, b) => (b.seeders > a.seeders ? b : a));
      out.push({
        id: best.id, title: titleOf(best), year: best.year ?? null, kind: kindOf(best), cover: best.coverImage ?? null,
        seeders: best.seeders, health: vodHealth(best.seeders), quality: best.resolution ?? null, versions: g.length,
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  async home(viewer: VodViewer) {
    await this.assertAccess(viewer.accountId);
    const hidden = await this.hiddenFor(viewer);
    const where = (kind: Kind) => ({ status: 'APPROVED' as const, seeders: { gte: 1 }, category: kindsWhere([kind]), ...(hidden.length ? { categoryId: { notIn: hidden } } : {}) });
    const find = (kind: Kind, orderBy: any) => this.prisma.torrent.findMany({ where: where(kind), orderBy, take: 80, select: CARD_SELECT });

    const [cont, filmsNew, filmsTop, seriesNew, seriesTop, foryou] = await Promise.all([
      this.streams.continueWatching(viewer.accountId).catch(() => ({ resume: [], next: [] } as any)),
      find('FILM', { createdAt: 'desc' }),
      find('FILM', [{ seeders: 'desc' }, { createdAt: 'desc' }]),
      find('SERIE', { createdAt: 'desc' }),
      find('SERIE', [{ seeders: 'desc' }, { createdAt: 'desc' }]),
      this.recommendations.forUser(viewer.userId, { limit: 40 }).catch(() => [] as any[]),
    ]);

    const resumeItems: VodItem[] = [
      ...(cont.resume ?? []).map((r: any) => ({
        id: r.torrentId, title: r.title, subtitle: [r.season != null && r.episode != null ? episodeLabel(r.season, r.episode) : '', r.percent != null ? `${r.percent} %` : ''].filter(Boolean).join(' · ') || undefined,
        cover: r.cover ?? null, percent: r.percent ?? null, play: { torrentId: r.torrentId, fileIndex: r.fileIndex ?? 0 },
      })),
      ...(cont.next ?? []).map((n: any) => ({
        id: n.torrentId, title: n.title, subtitle: `Suite · ${episodeLabel(n.season, n.episode)}`, cover: n.cover ?? null, percent: null, play: { torrentId: n.torrentId, fileIndex: 0 },
      })),
    ];

    // Recommandations : on ne garde que les films et séries lisibles (au moins un seeder), vus à travers la même requête que le reste du catalogue.
    const recIds: string[] = (foryou as any[]).map((x) => x.id).filter(Boolean);
    const recRows = recIds.length
      ? await this.prisma.torrent.findMany({ where: { id: { in: recIds }, status: 'APPROVED', seeders: { gte: 1 }, category: kindsWhere(['FILM', 'SERIE']), ...(hidden.length ? { categoryId: { notIn: hidden } } : {}) }, select: CARD_SELECT })
      : [];
    const recOrder = new Map(recIds.map((id, i) => [id, i]));
    recRows.sort((a, b) => (recOrder.get(a.id) ?? 0) - (recOrder.get(b.id) ?? 0));

    const rails = [
      { id: 'continue', title: 'Reprendre', items: resumeItems },
      { id: 'foryou', title: 'Recommandé pour toi', items: this.cards(recRows, 20) },
      { id: 'films-top', title: 'Films : démarrage rapide', items: this.cards(filmsTop, 20) },
      { id: 'films-new', title: 'Films récents', items: this.cards(filmsNew, 20) },
      { id: 'series-top', title: 'Séries : démarrage rapide', items: this.cards(seriesTop, 20) },
      { id: 'series-new', title: 'Séries récentes', items: this.cards(seriesNew, 20) },
    ].filter((r) => r.items.length > 0);
    return { rails };
  }

  async search(viewer: VodViewer, q: string) {
    await this.assertAccess(viewer.accountId);
    const term = String(q ?? '').trim().slice(0, 80);
    if (term.length < 2) return { items: [] as VodItem[] };
    const hidden = await this.hiddenFor(viewer);
    const dotted = term.replace(/\s+/g, '.');
    const rows = await this.prisma.torrent.findMany({
      where: {
        status: 'APPROVED', seeders: { gte: 1 }, category: kindsWhere(['FILM', 'SERIE']), ...(hidden.length ? { categoryId: { notIn: hidden } } : {}),
        OR: [{ name: { contains: term, mode: 'insensitive' } }, { name: { contains: dotted, mode: 'insensitive' } }, { searchTitles: { contains: term, mode: 'insensitive' } }],
      },
      orderBy: [{ seeders: 'desc' }, { createdAt: 'desc' }], take: 120, select: CARD_SELECT,
    });
    return { items: this.cards(rows, 40) };
  }

  /** Fiche d'un contenu : synopsis, versions (qualité, langue, seeders) ou, pour une série, un épisode par ligne avec la release la mieux seedée. */
  async title(viewer: VodViewer, id: string) {
    await this.assertAccess(viewer.accountId);
    const hidden = await this.hiddenFor(viewer);
    const t: any = await this.prisma.torrent.findFirst({ where: { id, status: 'APPROVED', category: kindsWhere(['FILM', 'SERIE']) }, select: DETAIL_SELECT });
    if (!t || hidden.includes(t.categoryId)) throw new NotFoundException('Titre introuvable');

    const key = groupKeyOf({ name: t.name, metaSource: t.metaSource, metaExternalId: t.metaExternalId, category: { slug: t.category?.slug } });
    let rows: any[];
    if (t.metaSource && t.metaExternalId) {
      rows = await this.prisma.torrent.findMany({ where: { status: 'APPROVED', metaSource: t.metaSource, metaExternalId: t.metaExternalId, ...(hidden.length ? { categoryId: { notIn: hidden } } : {}) }, take: 400, select: DETAIL_SELECT });
    } else {
      const dotted = releaseTitle(t.name).split(/\s+/).join('.');
      rows = (await this.prisma.torrent.findMany({
        where: { status: 'APPROVED', name: { contains: dotted, mode: 'insensitive' }, category: kindsWhere(['FILM', 'SERIE']), ...(hidden.length ? { categoryId: { notIn: hidden } } : {}) }, take: 200, select: DETAIL_SELECT,
      })).filter((r: any) => groupKeyOf({ name: r.name, metaSource: r.metaSource, metaExternalId: r.metaExternalId, category: { slug: r.category?.slug } }) === key);
      if (!rows.some((r) => r.id === t.id)) rows.push(t);
    }
    rows = rows.filter((r) => r.seeders >= 1).sort((a, b) => b.seeders - a.seeders || b.createdAt.getTime() - a.createdAt.getTime());
    if (rows.length === 0) rows = [t];

    const positions = await this.prisma.playbackPosition.findMany({
      where: { userId: viewer.accountId, torrentId: { in: rows.map((r) => r.id) } },
      select: { torrentId: true, fileIndex: true, positionSeconds: true, durationSeconds: true },
    });
    const progress = new Map(positions.map((p) => [`${p.torrentId}:${p.fileIndex}`, p]));
    const progressOf = (torrentId: string, fileIndex: number) => {
      const p = progress.get(`${torrentId}:${fileIndex}`);
      return p ? { percent: percentOf(p.positionSeconds, p.durationSeconds), positionSeconds: p.positionSeconds } : { percent: null, positionSeconds: 0 };
    };

    const kind = kindOf(t);
    const m = metaOf(t);
    const versions = rows.slice(0, 40).map((r) => {
      const files = videoFiles(r.fileList);
      const main = files.length ? files.reduce((a, b) => (b.size > a.size ? b : a)) : null;
      const fileIndex = main?.index ?? 0;
      return {
        id: r.id, name: r.name, size: Number(r.size), seeders: r.seeders, health: vodHealth(r.seeders), resolution: r.resolution ?? null, language: r.language ?? null,
        label: [r.resolution, r.language, r.hdr ? 'HDR' : null, r.containerFormat].filter(Boolean).join(' · ') || 'Version',
        subtitles: r.subtitles ?? [], audio: r.audio ?? null, fileIndex, ...progressOf(r.id, fileIndex),
      };
    });

    let episodes: any[] | undefined;
    if (kind === 'serie') {
      const sources: EpisodeSource[] = [];
      for (const r of rows) {
        const files = videoFiles(r.fileList);
        const list = files.length ? files : [{ index: 0, path: r.name, size: Number(r.size) }];
        for (const f of list) {
          let ep = parseEpisode(f.path);
          if (!ep && list.length === 1) {
            const s = numOf(r.season), e = numOf(r.episode);
            ep = s != null && e != null ? { season: s, episode: e } : parseEpisode(r.name);
          }
          sources.push({ torrentId: r.id, fileIndex: f.index, season: ep?.season ?? null, episode: ep?.episode ?? null, size: f.size, seeders: r.seeders, resolution: r.resolution ?? null, language: r.language ?? null, label: baseName(f.path) });
        }
      }
      episodes = bestPerEpisode(sources).slice(0, 600).map((s) => ({
        season: s.season, episode: s.episode, label: episodeLabel(s.season, s.episode) || s.label, name: s.label, torrentId: s.torrentId, fileIndex: s.fileIndex,
        size: s.size, seeders: s.seeders, health: vodHealth(s.seeders), resolution: s.resolution, language: s.language, ...progressOf(s.torrentId, s.fileIndex),
      }));
    }

    const rating = Number(m.rating);
    return {
      id: t.id, title: titleOf(t), year: t.year ?? null, kind, cover: t.coverImage ?? null,
      backdrop: typeof m.backdrop === 'string' ? m.backdrop : null,
      synopsis: typeof m.overview === 'string' && m.overview.trim() ? m.overview.trim() : null,
      rating: Number.isFinite(rating) && rating > 0 ? Math.round(rating * 10) / 10 : null,
      runtime: Number(m.runtime) || null,
      genres: Array.isArray(t.genres) ? t.genres.slice(0, 6) : [],
      versions, ...(episodes ? { episodes } : {}),
    };
  }

  /** Jeton de lecture pour l'application : elle l'ouvre comme un lien seeduction://stream/<jeton> ; le .torrent remis porte `vod=1` (téléchargement non compté pour le spectateur). */
  async play(viewer: VodViewer, torrentId: string, fileIndexRaw: unknown) {
    await this.assertAccess(viewer.accountId);
    const t = await this.prisma.torrent.findUnique({ where: { id: String(torrentId ?? '') }, select: { status: true, seeders: true, categoryId: true, fileList: true } });
    if (!t || t.status !== 'APPROVED') throw new NotFoundException('Titre introuvable');
    if ((await this.hiddenFor(viewer)).includes(t.categoryId)) throw new ForbiddenException('Ce contenu est réservé aux adultes : active-le dans ton profil.');
    if (t.seeders < 1) throw new ConflictException('Plus aucun seeder pour cette version : réessaie plus tard ou choisis-en une autre.');
    const n = Array.isArray(t.fileList) ? t.fileList.length : 1;
    const fileIndex = Math.max(0, Math.min(Math.floor(Number(fileIndexRaw) || 0), Math.max(0, n - 1)));
    const token = this.streams.createPlaySession(viewer.accountId, String(torrentId), fileIndex, viewer.userId, true);
    return { token };
  }
}
