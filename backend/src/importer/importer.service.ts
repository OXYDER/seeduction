import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { TorrentsService } from '../torrents/torrents.service';
import { AdminService } from '../admin/admin.service';
import { ImportConfig, ImportSecrets, openSecrets, sealSecrets } from './importer.types';
import { Qbit, QbitTorrent } from './qbit.client';
import { FtpConnectError, hasNfo, nfoFor, probeFor } from './release-files';
import { detectReleaseMeta } from './release-meta';
import { MetadataService, titleKey } from '../metadata/metadata.service';
import { SupportBotService } from '../support/support-bot.service';
import { NotificationsService } from '../notifications/notifications.service';
import { cleanTitle, ContentType, feedLabelOf, guessType, isFilmLike, isSeriesLike, leafKey, refineWithGenres, resolveCandidate, typeFromFeedLabel } from './category-guess';

/** Ce que la détection a compris d'une release (rempli par chooseCategory) : sert à la mise en vérification manuelle. */
export interface ReleaseInfo { type?: ContentType; title?: string; year?: number }
/** Choix final avant l'envoi : catégorie de Seeduction + fiche à rattacher (facultative). */
interface Chosen { id: string; name: string; how: string; meta?: { kind: string; id: string; title: string; year?: string } }
const META_KINDS = ['FILM', 'SERIE', 'MUSIQUE', 'LIVRE', 'JEU'];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const str = (v: any, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: any, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d; };
const regexList = (v: any, what: string): string[] => {
  const out: string[] = [];
  for (const p of Array.isArray(v) ? v.slice(0, 30) : []) {
    const s = str(p, 200);
    if (!s) continue;
    try { new RegExp(s, 'i'); } catch { throw new BadRequestException(`Expression régulière invalide (${what}) : ${s}`); }
    out.push(s);
  }
  return out;
};

/**
 * Import automatique depuis un qBittorrent (Admin > Import) : les releases terminées d'une catégorie sont envoyées sur Seeduction
 * (NFO lu ou MediaInfo calculé par FTP), publiées au nom du robot « Seeduction » (pas d'un compte de membre), approuvées, puis le torrent de Seeduction est ajouté dans qBittorrent
 * sur les mêmes fichiers pour seeder. Une passe toutes les `intervalMinutes`, chaque torrent n'est traité qu'une fois.
 */
@Injectable()
export class ImporterService {
  private readonly logger = new Logger(ImporterService.name);
  private running: { sourceId: string; dryRun: boolean; startedAt: number } | null = null;
  private warnedNoNfo = new Set<string>();

  constructor(private prisma: PrismaService, private torrents: TorrentsService, private admin: AdminService, private metadata: MetadataService, private bot: SupportBotService, private notifications: NotificationsService) {}

  // ------------------------------------------------------------------ configuration

  /** Valide et nettoie les réglages envoyés par le formulaire. */
  normalize(raw: any): ImportConfig {
    const q = raw?.qbit ?? {};
    const url = str(q.url, 300);
    if (!/^https?:\/\/[^\s]+$/i.test(url)) throw new BadRequestException("Adresse de l'interface web de qBittorrent invalide (ex. https://qbittorrent.exemple.com)");
    const cfg: ImportConfig = {
      qbit: { url: url.replace(/\/$/, ''), username: str(q.username, 100) || undefined, category: str(q.category, 100) || undefined, tag: str(q.tag, 100) || undefined, doneTag: str(q.doneTag, 100) || 'seeduction-envoye', conflictTag: str(q.conflictTag, 100) || 'interference-seeduction', conflictCategory: str(q.conflictCategory, 100) || undefined },
      defaultCategory: str(raw?.defaultCategory, 100) || undefined,
      autoCategory: raw?.autoCategory !== false,
      readFeedCategory: raw?.readFeedCategory !== false,
      attachMetadata: raw?.attachMetadata !== false,
      reviewUnmatched: raw?.reviewUnmatched !== false,
      categoryRules: [],
      include: regexList(raw?.include, 'filtre « inclure »'),
      exclude: regexList(raw?.exclude, 'filtre « exclure »'),
      description: str(raw?.description, 2000) || undefined,
      mediainfo: raw?.mediainfo !== false,
      autoApprove: raw?.autoApprove !== false,
      seedOnSeeduction: raw?.seedOnSeeduction !== false,
      seedCategory: str(raw?.seedCategory, 100) || 'seeduction',
      skipChecking: raw?.skipChecking !== false,
      intervalMinutes: num(raw?.intervalMinutes, 1, 1440, 10),
      maxPerRun: num(raw?.maxPerRun, 1, 50, 5),
      delaySeconds: num(raw?.delaySeconds, 0, 120, 30),
    };
    for (const r of Array.isArray(raw?.categoryRules) ? raw.categoryRules.slice(0, 30) : []) {
      const match = str(r?.match, 200), category = str(r?.category, 100);
      if (!match || !category) continue;
      try { new RegExp(match, 'i'); } catch { throw new BadRequestException(`Expression régulière invalide (règle de catégorie) : ${match}`); }
      cfg.categoryRules!.push({ match, category });
    }
    const f = raw?.ftp;
    if (f && str(f.host, 200)) {
      cfg.ftp = { host: str(f.host, 200), port: num(f.port, 1, 65535, 21), username: str(f.username, 100), secure: f.secure !== false, rejectUnauthorized: f.rejectUnauthorized !== false, headMB: num(f.headMB, 1, 64, 16), searchDepth: num(f.searchDepth, 1, 8, 6) };
    }
    return cfg;
  }

  private view(s: any, counts: Record<string, number> = {}) {
    const secrets = openSecrets(s.secrets);
    return { id: s.id, name: s.name, enabled: s.enabled, config: s.config, hasQbitPassword: !!secrets.qbitPassword, hasFtpPassword: !!secrets.ftpPassword, lastRunAt: s.lastRunAt, lastError: s.lastError, createdAt: s.createdAt, counts };
  }

  async list() {
    const [sources, groups] = await Promise.all([
      this.prisma.importSource.findMany({ orderBy: { createdAt: 'asc' } }),
      this.prisma.importItem.groupBy({ by: ['sourceId', 'status'], _count: { _all: true } }),
    ]);
    return sources.map((s) => {
      const counts: Record<string, number> = {};
      for (const g of groups) if (g.sourceId === s.id) counts[g.status] = g._count._all;
      return this.view(s, counts);
    });
  }

  private mergeSecrets(prev: string, body: any): string {
    const old = openSecrets(prev);
    const next: ImportSecrets = { ...old };
    if (typeof body?.qbitPassword === 'string' && body.qbitPassword) next.qbitPassword = body.qbitPassword;
    if (typeof body?.ftpPassword === 'string' && body.ftpPassword) next.ftpPassword = body.ftpPassword;
    return sealSecrets(next);
  }

  async create(uploaderId: string, body: any) {
    const name = str(body?.name, 100);
    if (!name) throw new BadRequestException('Donne un nom à cette source');
    const created = await this.prisma.importSource.create({ data: { name, enabled: false, uploaderId, config: this.normalize(body?.config) as any, secrets: this.mergeSecrets('', body?.secrets) } });
    return this.view(created);
  }

  async update(id: string, body: any) {
    const cur = await this.prisma.importSource.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Source introuvable');
    const data: any = {};
    if (typeof body?.name === 'string' && body.name.trim()) data.name = str(body.name, 100);
    if (typeof body?.enabled === 'boolean') data.enabled = body.enabled;
    if (body?.config) data.config = this.normalize(body.config);
    if (body?.secrets) data.secrets = this.mergeSecrets(cur.secrets, body.secrets);
    const next = await this.prisma.importSource.update({ where: { id }, data });
    return this.view(next);
  }

  async remove(id: string) {
    await this.prisma.importSource.delete({ where: { id } }).catch(() => { throw new NotFoundException('Source introuvable'); });
    return { deleted: true };
  }

  items(sourceId: string, status?: string) {
    return this.prisma.importItem.findMany({ where: { sourceId, ...(status ? { status } : {}) }, orderBy: { updatedAt: 'desc' }, take: 300 });
  }

  async retryItem(id: string) {
    const item = await this.prisma.importItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Élément introuvable');
    if (!['SKIPPED', 'REJECTED', 'REVIEW', 'CONFLICT'].includes(item.status)) throw new BadRequestException('Seuls les éléments mis de côté, refusés, à vérifier ou en interférence peuvent être retentés');
    await this.prisma.importItem.delete({ where: { id } }); // il sera repris à la prochaine passe
    return { retried: true };
  }

  events(sourceId?: string, limit = 100) {
    return this.prisma.importEvent.findMany({ where: sourceId ? { sourceId } : {}, orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(limit, 1), 300) });
  }

  status() {
    return { running: this.running };
  }

  private async event(sourceId: string | null, level: 'INFO' | 'WARN' | 'ERROR', message: string) {
    this.logger[level === 'ERROR' ? 'error' : 'log'](`[${sourceId?.slice(0, 8) ?? '-'}] ${message}`);
    await this.prisma.importEvent.create({ data: { sourceId, level, message: message.slice(0, 1000) } }).catch(() => undefined);
  }

  /** Statistiques internes du robot (jamais publiques) : ce qu'il a publié, ce qu'il seede, ce qu'il a envoyé et reçu. */
  async botStats() {
    const robot = await this.bot.ensureBot();
    const user = await this.prisma.user.findUnique({ where: { id: robot.id }, select: { id: true, username: true, passkey: true, uploaded: true, downloaded: true, bonusPoints: true, createdAt: true } });
    const [byStatus, agg, peers, recent] = await Promise.all([
      this.prisma.torrent.groupBy({ by: ['status'], where: { uploaderId: robot.id }, _count: { _all: true } }),
      this.prisma.torrent.aggregate({ where: { uploaderId: robot.id, status: { in: ['APPROVED', 'PENDING'] } }, _count: { _all: true }, _sum: { size: true, completedCount: true, seeders: true, leechers: true } }),
      this.prisma.peer.findMany({ where: { userId: robot.id }, select: { isSeeder: true, lastAnnounceAt: true } }),
      this.prisma.torrent.findMany({ where: { uploaderId: robot.id }, orderBy: { createdAt: 'desc' }, take: 12, select: { id: true, name: true, size: true, status: true, seeders: true, leechers: true, completedCount: true, createdAt: true } }),
    ]);
    const up = Number(user?.uploaded ?? 0n), down = Number(user?.downloaded ?? 0n);
    return {
      id: robot.id,
      username: robot.username,
      passkeyHint: user?.passkey ? `…${user.passkey.slice(-6)}` : null, // le passkey complet n'est jamais affiché
      uploaded: String(user?.uploaded ?? 0n),
      downloaded: String(user?.downloaded ?? 0n),
      ratio: down > 0 ? up / down : null,
      bonusPoints: user?.bonusPoints ?? 0,
      torrents: {
        byStatus: Object.fromEntries(byStatus.map((g) => [g.status, g._count._all])),
        live: agg._count._all,
        totalSize: String(agg._sum.size ?? 0n),
        completedByOthers: agg._sum.completedCount ?? 0,
        seedersOnThem: agg._sum.seeders ?? 0,
        leechersOnThem: agg._sum.leechers ?? 0,
      },
      peers: { seeding: peers.filter((p) => p.isSeeder).length, downloading: peers.filter((p) => !p.isSeeder).length, lastAnnounceAt: peers.reduce<Date | null>((m, p) => (!m || p.lastAnnounceAt > m ? p.lastAnnounceAt : m), null) },
      recent,
    };
  }

  // ------------------------------------------------------------------ exécution

  /** Planification : toutes les minutes, les sources actives dont la dernière passe date de plus de `intervalMinutes`. */
  @Cron('* * * * *')
  async tick() {
    if (this.running) return;
    try {
      const sources = await this.prisma.importSource.findMany({ where: { enabled: true } });
      for (const s of sources) {
        const cfg = s.config as unknown as ImportConfig;
        const ready = await this.prisma.importItem.count({ where: { sourceId: s.id, status: 'READY' } });
        if (s.lastRunAt && Date.now() - s.lastRunAt.getTime() < (cfg.intervalMinutes ?? 10) * 60_000) { if (ready) await this.execute(s.id, false, true); continue; }
        await this.execute(s.id, false);
      }
      // Sources désactivées : seuls les éléments validés à la main sont envoyés.
      for (const s of await this.prisma.importSource.findMany({ where: { enabled: false, items: { some: { status: 'READY' } } } })) await this.execute(s.id, false, true);
      // Journal : on ne garde que 14 jours.
      if (new Date().getMinutes() === 0) await this.prisma.importEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 14 * 86400_000) } } });
    } catch (err: any) {
      this.logger.warn(`Import : ${err?.message ?? err}`);
    }
  }

  /** Lancement à la demande (bouton « Lancer maintenant » / « Essai ») : en arrière-plan, le suivi se lit dans le journal. */
  async start(id: string, dryRun: boolean) {
    if (this.running) throw new BadRequestException('Un import est déjà en cours : patiente quelques instants');
    if (!(await this.prisma.importSource.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundException('Source introuvable');
    void this.execute(id, dryRun);
    return { started: true };
  }

  /** Releases terminées : une ou plusieurs catégories qBittorrent (séparées par des virgules), ou une étiquette, ou tout. */
  async listCompleted(q: Qbit, cfg: ImportConfig): Promise<QbitTorrent[]> {
    const cats = String(cfg.qbit.category ?? '').split(',').map((c) => c.trim()).filter(Boolean);
    if (cats.length <= 1) return q.completed({ category: cats[0], tag: cfg.qbit.tag });
    const seen = new Map<string, QbitTorrent>();
    for (const c of cats) for (const t of await q.completed({ category: c, tag: cfg.qbit.tag })) seen.set(t.hash, t);
    return [...seen.values()];
  }

  /** Libellé de catégorie du flux RSS pour chaque release (l'article dont le titre contient le nom de la release). */
  private async feedLabels(q: Qbit, cfg: ImportConfig, list: QbitTorrent[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (cfg.readFeedCategory === false || list.length === 0) return out;
    let articles: { title: string; description: string; torrentURL: string }[] = [];
    try { articles = await q.rssArticles(); } catch { return out; }
    if (articles.length === 0) return out;
    const flat = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const indexed = articles.map((a) => ({ key: flat(a.title.replace(/^\s*(\[[^\]]+\]\s*)+/, '')), label: feedLabelOf(a) })).filter((a) => a.key);
    for (const t of list) {
      const k = flat(t.name);
      if (k.length < 8) continue;
      const hit = indexed.find((a) => a.key === k) ?? indexed.find((a) => a.key.includes(k) || k.includes(a.key));
      if (hit?.label) out.set(t.hash, hit.label);
    }
    return out;
  }

  private leafCache: { at: number; ids: Map<string, string>; names: Map<string, string> } | null = null;

  /** Sous-catégories existantes (seules elles reçoivent des torrents), par nom sans accents ni casse. */
  private async leaves() {
    if (this.leafCache && Date.now() - this.leafCache.at < 60_000) return this.leafCache;
    const all = await this.prisma.category.findMany({ select: { id: true, name: true, parentId: true } });
    const parents = new Set(all.map((c) => c.parentId).filter(Boolean));
    const ids = new Map<string, string>();
    const names = new Map<string, string>();
    for (const c of all) if (!parents.has(c.id)) { ids.set(leafKey(c.name), c.id); names.set(leafKey(c.name), c.name); }
    this.leafCache = { at: Date.now(), ids, names };
    return this.leafCache;
  }

  /**
   * Catégorie d'une release, dans cet ordre : 1) tes règles (nom ou catégorie qBittorrent) ; 2) détection automatique d'après le nom
   * (série, film, sport, musique...) affinée par la fiche TMDB (animation, émission, documentaire) si la clé TMDB est configurée ;
   * 3) la catégorie par défaut, si tu en as choisi une. Sinon null : la release est mise de côté plutôt que rangée au hasard.
   */
  /** La même série (ou le même film) est déjà sur le site avec une fiche TMDB : sa fiche et sa catégorie, pour ne pas la chercher à chaque épisode. */
  private async knownFiche(series: boolean, title: string, year?: number): Promise<{ id: string; title: string; year?: string; categoryId: string | null } | null> {
    const key = titleKey(title);
    const words = title.split(/\s+/).filter(Boolean);
    if (!key || words.length === 0) return null;
    const rows = await this.prisma.torrent.findMany({
      where: {
        metaSource: 'tmdb', metaExternalId: { not: null }, status: { not: 'REJECTED' },
        OR: [words.join('.'), words.join(' ')].map((p) => ({ name: { startsWith: p, mode: 'insensitive' as const } })),
      },
      select: { name: true, metaExternalId: true, metadata: true, categoryId: true },
      orderBy: { createdAt: 'desc' }, take: 40,
    });
    for (const r of rows) {
      const parsed = cleanTitle(r.name);
      if (titleKey(parsed.title) !== key) continue;
      const m: any = r.metadata ?? {};
      if ((m.kind === 'tv') !== series) continue;
      if (!series && year && parsed.year && parsed.year !== year) continue; // deux films du même titre : l'année les départage
      return { id: r.metaExternalId!, title: String(m.originalTitle ?? parsed.title), year: typeof m.releaseDate === 'string' ? m.releaseDate.slice(0, 4) : undefined, categoryId: r.categoryId };
    }
    return null;
  }

  async chooseCategory(cfg: ImportConfig, t: QbitTorrent, feedLabel = '', info: ReleaseInfo = {}): Promise<{ name: string; id: string; how: string; meta?: { kind: 'FILM' | 'SERIE'; id: string; title: string; year?: string } } | null> {
    const leaves = await this.leaves();
    // Type de contenu : la catégorie du flux RSS (si claire) prime sur le nom ; sinon le nom.
    const byName = guessType(t.name);
    const byFeed = cfg.readFeedCategory !== false && feedLabel ? typeFromFeedLabel(feedLabel, byName) : undefined;
    let type = byFeed ?? byName;
    let how = byFeed ? 'flux RSS' : 'détection';
    const parsed = cleanTitle(t.name);
    info.title = parsed.title; info.year = parsed.year; info.type = type;

    // Fiche TMDB (film ou série) : sert à classer (animation, émission, documentaire) ET à rattacher la fiche au torrent.
    let meta: { kind: 'FILM' | 'SERIE'; id: string; title: string; year?: string } | undefined;
    let siblingCategoryId: string | undefined;
    const wantsTmdb = cfg.attachMetadata !== false || cfg.autoCategory !== false;
    if (type && wantsTmdb && (isFilmLike(type) || isSeriesLike(type))) {
      const { title, year } = cleanTitle(t.name);
      const series = isSeriesLike(type);
      // 1) La même série (ou le même film) est déjà sur le site avec sa fiche : on la reprend telle quelle, avec sa catégorie (chaque épisode suivant se range pareil).
      const known = await this.knownFiche(series, title, year);
      if (known) {
        meta = { kind: series ? 'SERIE' : 'FILM', id: known.id, title: known.title, year: known.year };
        siblingCategoryId = known.categoryId ?? undefined;
        how = how === 'flux RSS' ? 'flux RSS + déjà sur le site' : 'déjà sur le site';
      } else {
        // 2) Sinon, recherche sur TMDB (titre exact, tolérant sur les accents, ligatures, article, année).
        const match = await this.metadata.tmdbMatch(series ? 'tv' : 'movie', title, year);
        if (match) {
          meta = { kind: series ? 'SERIE' : 'FILM', id: match.id, title: match.title, year: match.year };
          if (cfg.autoCategory !== false && (type === 'FILM' || type === 'SERIE')) {
            const refined = refineWithGenres(type, match.genreIds);
            if (refined !== type) { how = how === 'flux RSS' ? 'flux RSS + TMDB' : 'TMDB'; type = refined; info.type = type; }
          }
        }
      }
    }

    for (const r of cfg.categoryRules ?? []) {
      if (!new RegExp(r.match, 'i').test(`${t.name} ${t.category} ${feedLabel}`)) continue;
      const id = leaves.ids.get(leafKey(r.category));
      if (id) return { name: leaves.names.get(leafKey(r.category))!, id, how: 'règle', meta };
    }
    if (cfg.autoCategory !== false && siblingCategoryId) {
      const hit = [...leaves.ids.entries()].find(([, cid]) => cid === siblingCategoryId);
      if (hit) return { name: leaves.names.get(hit[0])!, id: siblingCategoryId, how, meta };
    }
    if (cfg.autoCategory !== false && type) {
      const name = resolveCandidate(type, leaves.names);
      if (name) return { name, id: leaves.ids.get(leafKey(name))!, how, meta };
    }
    if (cfg.defaultCategory) {
      const id = leaves.ids.get(leafKey(cfg.defaultCategory));
      if (id) return { name: leaves.names.get(leafKey(cfg.defaultCategory))!, id, how: 'défaut', meta };
    }
    return null;
  }

  private async execute(id: string, dryRun: boolean, onlyReady = false) {
    if (this.running) return;
    this.running = { sourceId: id, dryRun, startedAt: Date.now() };
    const src = await this.prisma.importSource.findUnique({ where: { id } });
    if (!src) { this.running = null; return; }
    const cfg = src.config as unknown as ImportConfig;
    const secrets = openSecrets(src.secrets);
    const ev = (level: 'INFO' | 'WARN' | 'ERROR', msg: string) => this.event(id, level, (dryRun ? '(essai) ' : '') + msg);
    let lastError: string | null = null;
    try {
      if (!dryRun && !onlyReady) await this.prisma.importSource.update({ where: { id }, data: { lastRunAt: new Date() } });
      // Les torrents sont publiés (et seedés, avec son passkey) par le compte du robot « Seeduction » : jamais par un compte de membre.
      const robot = await this.bot.ensureBot();
      const uploaderId = robot.id;
      if (src.uploaderId !== robot.id) await this.prisma.importSource.update({ where: { id }, data: { uploaderId: robot.id } }).catch(() => undefined);
      const q = new Qbit(cfg.qbit.url, cfg.qbit.username, secrets.qbitPassword);
      await q.login();
      await this.seedPass(src.id, uploaderId, cfg, q, dryRun, ev);

      const list = (await this.listCompleted(q, cfg)).sort((a, b) => (a.completion_on || a.added_on) - (b.completion_on || b.added_on));
      await this.readyPass(id, uploaderId, cfg, secrets, q, list, dryRun, ev);
      if (onlyReady) { await this.seedPass(src.id, uploaderId, cfg, q, dryRun, ev); return; }
      const known = new Set((await this.prisma.importItem.findMany({ where: { sourceId: id }, select: { key: true } })).map((i) => i.key));
      const labels = await this.feedLabels(q, cfg, list);
      let sent = 0;
      for (const t of list) {
        if (known.has(t.hash)) continue;
        const skip = async (why: string) => { if (!dryRun) await this.prisma.importItem.create({ data: { sourceId: id, key: t.hash, name: t.name, status: 'SKIPPED', why } }); await ev('WARN', `${t.name} — mis de côté : ${why}`); };
        if ((cfg.include ?? []).length && !(cfg.include ?? []).some((p) => new RegExp(p, 'i').test(t.name))) { await skip('ne correspond à aucun filtre « inclure »'); continue; }
        if ((cfg.exclude ?? []).some((p) => new RegExp(p, 'i').test(t.name))) { await skip('exclu par un filtre « exclure »'); continue; }
        // Interférence : la même release est déjà sur Seeduction (autre source, autre membre...) : rien n'est envoyé, l'administrateur est averti tout de suite.
        const clash = await this.findClash(t);
        if (clash) { await this.recordConflict(id, cfg, q, t, `« ${clash.name} » est déjà sur Seeduction${clash.uploader ? ` (envoyé par ${clash.uploader})` : ''}`, clash, dryRun, ev); continue; }

        const info: ReleaseInfo = {};
        const found = await this.chooseCategory(cfg, t, labels.get(t.hash) ?? '', info);
        const wantsFiche = cfg.attachMetadata !== false && cfg.reviewUnmatched !== false && !!info.type && (isFilmLike(info.type) || isSeriesLike(info.type)) && this.metadata.supportedKinds.includes('FILM');
        if (!found && cfg.reviewUnmatched === false) { await skip("type de contenu non détecté : ajoute une règle de catégorie ou choisis une catégorie par défaut, puis « Retenter »"); continue; }
        if (!found || (wantsFiche && !found.meta)) {
          // Pas de catégorie ou pas de fiche sûre : la release attend dans « À vérifier » que tu la complètes à la main (elle ne compte pas dans la limite par passe).
          await this.queueReview(id, t, found, info, labels.get(t.hash) ?? '', found ? `aucune fiche TMDB sûre pour « ${info.title} »` : 'catégorie non détectée', dryRun, ev);
          continue;
        }
        const chosen: Chosen = { id: found.id, name: found.name, how: found.how, meta: cfg.attachMetadata !== false ? found.meta : undefined };
        if (sent >= (cfg.maxPerRun ?? 5)) { await ev('INFO', `Limite de ${cfg.maxPerRun} envoi(s) par passe atteinte : la suite à la prochaine passe.`); break; }

        let buf: Buffer; let nfo = '';
        try {
          buf = await q.exportTorrent(t.hash);
          if (!buf.length || buf[0] !== 0x64) throw new Error("le fichier exporté n'est pas un .torrent");
          nfo = await nfoFor(cfg, secrets, id, t);
        } catch (e: any) { await ev('ERROR', `${t.name} — ${e.message}`); continue; } // erreur temporaire : on réessaiera à la prochaine passe
        if (!hasNfo(nfo)) {
          if (!this.warnedNoNfo.has(t.hash)) { this.warnedNoNfo.add(t.hash); await ev('WARN', `${t.name} — NFO / MediaInfo introuvable (obligatoire) : ajoute un .nfo dans le dossier de la release ; il sera pris à la prochaine passe`); }
          continue;
        }
        if (dryRun) { await ev('INFO', `enverrait : ${t.name} → ${chosen.name}`); sent++; continue; }
        if (await this.publish(id, uploaderId, cfg, q, t, buf, nfo, chosen, ev)) sent++;
        if (cfg.delaySeconds) await sleep(cfg.delaySeconds * 1000);
      }
      await this.seedPass(src.id, uploaderId, cfg, q, dryRun, ev); // les torrents envoyés pendant cette passe partent seeder tout de suite, sans attendre la passe suivante
      await ev('INFO', `Passe terminée : ${sent} ${dryRun ? 'à envoyer' : 'envoyé(s)'} sur ${list.length} release(s) terminée(s).`);
    } catch (e: any) {
      lastError = String(e?.message ?? e);
      await ev('ERROR', lastError);
    } finally {
      if (!dryRun) await this.prisma.importSource.update({ where: { id }, data: { lastError } }).catch(() => undefined);
      this.running = null;
    }
  }

  /** Envoie une release (déjà exportée, NFO prêt) : upload, approbation, mémoire, étiquette qBittorrent. Vrai si elle est partie. */
  private async publish(sourceId: string, uploaderId: string, cfg: ImportConfig, q: Qbit, t: QbitTorrent, buf: Buffer, nfo: string, chosen: Chosen, ev: (l: 'INFO' | 'WARN' | 'ERROR', m: string) => Promise<void>, onTemporaryError?: (msg: string) => Promise<void>): Promise<boolean> {
    const where = { sourceId_key: { sourceId, key: t.hash } };
    try {
      const meta = detectReleaseMeta(t.name, nfo); // langue (VFQ en priorité), résolution, source, codec, saison / épisode...
      const created = await this.torrents.upload({ userId: uploaderId, fileBuffer: buf, name: t.name, description: cfg.description, categoryId: chosen.id, tags: [], anonymous: false, nfo, ...meta, ...(chosen.meta ? { metaKind: chosen.meta.kind, metaId: chosen.meta.id } : {}) });
      const status = cfg.autoApprove !== false ? (await this.admin.approveTorrent(created.id)).status : created.status; // import configuré par un administrateur : approuvé directement
      await this.prisma.importItem.upsert({ where, create: { sourceId, key: t.hash, name: t.name, status: 'UPLOADED', torrentId: created.id, savePath: t.save_path }, update: { status: 'UPLOADED', torrentId: created.id, savePath: t.save_path, why: null } });
      await ev('INFO', `✓ ${t.name} → ${chosen.name} [${chosen.how}]${meta.language ? ` · ${meta.language}` : ''}${chosen.meta ? ` · fiche : ${chosen.meta.title}` : ''} (${status === 'APPROVED' ? 'approuvé' : 'en attente de validation'})`);
      q.addTags(t.hash, cfg.qbit.doneTag || 'seeduction-envoye').catch(() => undefined);
      return true;
    } catch (e: any) {
      if (e instanceof BadRequestException) {
        const msg = String(e.message);
        const dupe = /dupe|existe déjà/i.test(msg);
        if (dupe) {
          // Même contenu (même empreinte) déjà sur le site : c'est une interférence, signalée tout de suite à l'administrateur.
          const clash = await this.findClash(t);
          await this.recordConflict(sourceId, cfg, q, t, clash ? `« ${clash.name} » a exactement le même contenu${clash.uploader ? ` (envoyé par ${clash.uploader})` : ''}` : 'ce contenu existe déjà sur Seeduction', clash, false, ev);
          return false;
        }
        await this.prisma.importItem.upsert({ where, create: { sourceId, key: t.hash, name: t.name, status: 'REJECTED', why: msg }, update: { status: 'REJECTED', why: msg } });
        await ev('WARN', `${t.name} — refusé : ${msg}`);
      } else {
        await ev('ERROR', `${t.name} — erreur d'envoi : ${e?.message ?? e}`); // temporaire : réessayé plus tard
        await onTemporaryError?.(String(e?.message ?? e));
      }
      return false;
    }
  }

  // ------------------------------------------------------------------ interférences (même release déjà sur Seeduction)

  /** Torrent déjà sur Seeduction qui porte exactement le même nom que cette release (autre source, autre membre...). */
  async findClash(t: QbitTorrent): Promise<{ id: string; name: string; uploader: string | null } | null> {
    const base = t.name.replace(/\.(mkv|mp4|avi)$/i, '');
    const names = new Set<string>();
    for (const b of [t.name, base, base.replace(/\./g, ' '), base.replace(/ /g, '.')]) for (const ext of ['', '.mkv', '.mp4', '.avi']) names.add(b + ext);
    const hit = await this.prisma.torrent.findFirst({
      where: { status: { not: 'REJECTED' }, OR: [...names].map((n) => ({ name: { equals: n, mode: 'insensitive' as const } })) },
      select: { id: true, name: true, anonymousUpload: true, uploader: { select: { username: true } } },
    });
    return hit ? { id: hit.id, name: hit.name, uploader: hit.anonymousUpload ? null : hit.uploader?.username ?? null } : null;
  }

  /**
   * Une release fait interférence : elle n'est PAS envoyée, l'élément passe en « Interférence » (rouge, en haut de la page d'import), un message
   * d'erreur est écrit dans le journal, les administrateurs reçoivent une notification, et la release est étiquetée dans ce qBittorrent
   * (étiquette « interference-seeduction » par défaut ; sa catégorie n'est changée que si tu l'as demandé : ça peut déplacer les fichiers).
   */
  private async recordConflict(sourceId: string, cfg: ImportConfig, q: Qbit, t: QbitTorrent, why: string, clash: { id: string; name: string; uploader: string | null } | null, dryRun: boolean, ev: (l: 'INFO' | 'WARN' | 'ERROR', m: string) => Promise<void>) {
    const reason = `Interférence : ${why}`;
    if (dryRun) { await ev('ERROR', `⚠ ${t.name} — ${reason} : ne serait pas envoyé`); return; }
    const detail = { existingId: clash?.id ?? null, existingName: clash?.name ?? null, existingUploader: clash?.uploader ?? null, qbitCategory: t.category, size: t.size };
    await this.prisma.importItem.upsert({
      where: { sourceId_key: { sourceId, key: t.hash } },
      create: { sourceId, key: t.hash, name: t.name, status: 'CONFLICT', why: reason, savePath: t.save_path, detail: detail as any },
      update: { status: 'CONFLICT', why: reason, detail: detail as any },
    });
    await ev('ERROR', `⚠ INTERFÉRENCE — ${t.name} : ${why}. Rien n'a été envoyé ; à régler dans Admin > Import.`);
    try {
      await q.addTags(t.hash, cfg.qbit.conflictTag || 'interference-seeduction');
      if (cfg.qbit.conflictCategory) await q.setCategory(t.hash, cfg.qbit.conflictCategory);
    } catch (e: any) { await ev('WARN', `${t.name} — étiquette d'interférence non posée dans qBittorrent : ${e?.message ?? e}`); }
    const source = await this.prisma.importSource.findUnique({ where: { id: sourceId }, select: { name: true } });
    const admins = await this.prisma.user.findMany({ where: { role: { in: ['ADMIN', 'OWNER'] as any }, parentId: null, status: 'ACTIVE' }, select: { id: true } });
    await Promise.all(admins.map((a) => this.notifications.notify({ userId: a.id, type: 'SYSTEM', title: "⚠ Interférence à l'import", body: `${source?.name ?? 'Une source'} : ${t.name} — ${why}`, link: '/admin' }).catch(() => undefined)));
  }

  /** Toutes les interférences en cours, toutes sources confondues (affichées en rouge en haut de la page d'import). */
  conflicts() {
    return this.prisma.importItem.findMany({ where: { status: 'CONFLICT' }, include: { source: { select: { id: true, name: true } } }, orderBy: { updatedAt: 'desc' }, take: 200 });
  }

  /** Met une release dans « À vérifier » avec ce qui a été détecté et les fiches que TMDB propose pour ce titre. */
  private async queueReview(sourceId: string, t: QbitTorrent, found: { id: string; name: string; how: string } | null, info: ReleaseInfo, feedLabel: string, reason: string, dryRun: boolean, ev: (l: 'INFO' | 'WARN' | 'ERROR', m: string) => Promise<void>) {
    if (dryRun) { await ev('WARN', `${t.name} — irait dans « À vérifier » : ${reason}`); return; }
    const kind = info.type && isSeriesLike(info.type) ? 'SERIE' : 'FILM';
    let suggestions: { id: string; title: string; subtitle: string; thumbnail: string | null }[] = [];
    const title = info.title || cleanTitle(t.name).title;
    if (title && this.metadata.supportedKinds.includes(kind) && (!info.type || isFilmLike(info.type) || isSeriesLike(info.type))) {
      suggestions = await this.metadata.search(kind, title, info.year ? String(info.year) : undefined).catch(() => []);
      if (suggestions.length === 0 && info.year) suggestions = await this.metadata.search(kind, title).catch(() => []);
    }
    const meta = detectReleaseMeta(t.name, '');
    const detail = {
      reason, type: info.type ?? null, kind, title, year: info.year ?? null, feedLabel: feedLabel || null,
      category: found ? { id: found.id, name: found.name, how: found.how } : null,
      language: meta.language ?? null, resolution: meta.resolution ?? null, size: t.size, suggestions: suggestions.slice(0, 6),
    };
    await this.prisma.importItem.create({ data: { sourceId, key: t.hash, name: t.name, status: 'REVIEW', why: reason, savePath: t.save_path, detail: detail as any } });
    await ev('WARN', `${t.name} — à vérifier : ${reason}`);
  }

  /** Releases validées à la main (« À vérifier » > Importer) : elles partent avec la catégorie et la fiche choisies, sans attendre la limite par passe. */
  private async readyPass(sourceId: string, uploaderId: string, cfg: ImportConfig, secrets: ImportSecrets, q: Qbit, list: QbitTorrent[], dryRun: boolean, ev: (l: 'INFO' | 'WARN' | 'ERROR', m: string) => Promise<void>) {
    const ready = await this.prisma.importItem.findMany({ where: { sourceId, status: 'READY' } });
    for (const it of ready) {
      const back = (why: string) => this.prisma.importItem.update({ where: { id: it.id }, data: { status: 'REVIEW', why } }).then(() => undefined);
      const detail: any = it.detail ?? {};
      const o = detail.override ?? {};
      if (dryRun) { await ev('INFO', `enverrait (validé à la main) : ${it.name} → ${o.categoryName ?? '?'}`); continue; }
      const t = list.find((x) => x.hash === it.key);
      if (!t) { await ev('WARN', `${it.name} — introuvable dans qBittorrent (supprimé ou hors catégorie)`); await back('introuvable dans qBittorrent : vérifie la catégorie, puis valide à nouveau'); continue; }
      if (!o.categoryId) { await back('catégorie manquante'); continue; }
      let buf: Buffer; let nfo = '';
      try {
        buf = await q.exportTorrent(t.hash);
        if (!buf.length || buf[0] !== 0x64) throw new Error("le fichier exporté n'est pas un .torrent");
        nfo = await nfoFor(cfg, secrets, sourceId, t);
      } catch (e: any) { await ev('ERROR', `${t.name} — ${e.message}`); await back(String(e.message)); continue; }
      if (!hasNfo(nfo)) { await ev('WARN', `${t.name} — NFO / MediaInfo introuvable (obligatoire)`); await back('NFO / MediaInfo introuvable : ajoute un .nfo dans le dossier de la release, puis valide à nouveau'); continue; }
      const chosen: Chosen = { id: o.categoryId, name: o.categoryName ?? '', how: 'validé à la main', meta: o.metaKind && o.metaId ? { kind: o.metaKind, id: o.metaId, title: o.metaTitle ?? o.metaId } : undefined };
      await this.publish(sourceId, uploaderId, cfg, q, t, buf, nfo, chosen, ev, back);
    }
  }

  // ------------------------------------------------------------------ « À vérifier » : choix manuel de la fiche et de la catégorie

  /** Ce dont l'écran « À vérifier » a besoin : sous-catégories de Seeduction et types de fiches recherchables. */
  async reviewOptions() {
    const leaves = await this.leaves();
    const categories = [...leaves.ids.entries()].map(([k, id]) => ({ id, name: leaves.names.get(k)! })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    return { categories, kinds: this.metadata.supportedKinds.filter((k) => META_KINDS.includes(k)) };
  }

  /** Recherche manuelle d'une fiche (TMDB pour films et séries, Deezer, livres, RAWG), la même que sur la page d'envoi. */
  searchFiche(kind: string, q: string, year?: string) {
    if (!META_KINDS.includes(kind)) throw new BadRequestException('Type de fiche inconnu');
    return this.metadata.search(kind, q, year);
  }

  /** Valide à la main une release « À vérifier » : catégorie + fiche (ou « sans fiche »), puis envoi en arrière-plan. */
  async approveItem(id: string, body: any) {
    const it = await this.prisma.importItem.findUnique({ where: { id } });
    if (!it) throw new NotFoundException('Élément introuvable');
    if (it.status !== 'REVIEW') throw new BadRequestException("Cet élément n'est pas en attente de vérification");
    const detail: any = it.detail ?? {};
    const categoryId = str(body?.categoryId, 60) || detail.category?.id;
    const leaves = await this.leaves();
    const cat = categoryId ? await this.prisma.category.findUnique({ where: { id: categoryId }, select: { id: true, name: true } }) : null;
    if (!cat) throw new BadRequestException('Choisis la catégorie de Seeduction');
    if (![...leaves.ids.values()].includes(cat.id)) throw new BadRequestException('Choisis une sous-catégorie (pas une catégorie parente)');
    const metaKind = str(body?.metaKind, 20), metaId = str(body?.metaId, 120);
    if (metaId && !META_KINDS.includes(metaKind)) throw new BadRequestException('Type de fiche inconnu');
    if (!metaId && body?.noMeta !== true) throw new BadRequestException('Choisis une fiche, ou « Importer sans fiche »');
    const override = { categoryId: cat.id, categoryName: cat.name, metaKind: metaId ? metaKind : null, metaId: metaId || null, metaTitle: str(body?.metaTitle, 200) || null };
    await this.prisma.importItem.update({ where: { id }, data: { status: 'READY', why: 'validé à la main : envoi en cours', detail: { ...detail, override } as any } });
    const now = !this.running;
    if (now) void this.execute(it.sourceId, false, true); // n'envoie que les éléments validés à la main, même si la source est désactivée
    return { queued: true, now };
  }

  /** Écarte une release « À vérifier » (elle ne sera plus proposée ; « Retenter » la remet en file). */
  async dismissItem(id: string) {
    const it = await this.prisma.importItem.findUnique({ where: { id } });
    if (!it) throw new NotFoundException('Élément introuvable');
    if (!['REVIEW', 'READY', 'CONFLICT'].includes(it.status)) throw new BadRequestException("Cet élément n'est pas en attente de vérification");
    await this.prisma.importItem.update({ where: { id }, data: { status: 'SKIPPED', why: it.status === 'CONFLICT' ? 'interférence ignorée à la main' : 'écarté à la main' } });
    return { dismissed: true };
  }

  /** Torrents envoyés puis approuvés : on ajoute la version de Seeduction (avec ton passkey) dans qBittorrent, sur les MÊMES fichiers. */
  private async seedPass(sourceId: string, uploaderId: string, cfg: ImportConfig, q: Qbit, dryRun: boolean, ev: (l: 'INFO' | 'WARN' | 'ERROR', m: string) => Promise<void>) {
    if (cfg.seedOnSeeduction === false) return;
    const items = await this.prisma.importItem.findMany({ where: { sourceId, status: 'UPLOADED', seeded: null, torrentId: { not: null } } });
    for (const it of items) {
      const t = await this.prisma.torrent.findUnique({ where: { id: it.torrentId! }, select: { status: true } });
      if (!t) { if (!dryRun) await this.prisma.importItem.update({ where: { id: it.id }, data: { seeded: 'UNAVAILABLE' } }); await ev('WARN', `${it.name} — supprimé de Seeduction : seed abandonné`); continue; }
      if (t.status === 'PENDING') continue; // en attente de validation : le seed démarrera ensuite
      if (!['APPROVED', 'DEAD'].includes(t.status)) { if (!dryRun) await this.prisma.importItem.update({ where: { id: it.id }, data: { seeded: 'UNAVAILABLE' } }); await ev('WARN', `${it.name} — statut ${t.status} : seed abandonné`); continue; }
      if (dryRun) { await ev('INFO', `ajouterait le torrent de Seeduction dans qBittorrent : ${it.name}`); continue; }
      try {
        const file = await this.torrents.getDownloadFile(it.torrentId!, uploaderId);
        await q.add(file, { savepath: it.savePath ?? '', category: cfg.seedCategory || 'seeduction', tags: 'seeduction', skipChecking: cfg.skipChecking !== false });
        await this.prisma.importItem.update({ where: { id: it.id }, data: { seeded: 'OK' } });
        await ev('INFO', `🌱 ${it.name} — ajouté dans qBittorrent pour seeder sur Seeduction`);
      } catch (e: any) {
        await ev('ERROR', `${it.name} — seed : ${e?.message ?? e}`);
      }
    }
  }

  // ------------------------------------------------------------------ test d'une source (tâche de fond : le résultat se lit par interrogation)

  private inspections = new Map<string, { status: 'running' | 'done' | 'error'; startedAt: number; result?: any; error?: string }>();

  /** Lance le test en arrière-plan : il peut durer (FTP lent) et un serveur web devant le site coupe les réponses trop longues (504). */
  async startInspect(id: string) {
    if (!(await this.prisma.importSource.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundException('Source introuvable');
    const cur = this.inspections.get(id);
    if (cur?.status === 'running' && Date.now() - cur.startedAt < 180_000) return { started: true };
    this.inspections.set(id, { status: 'running', startedAt: Date.now() });
    const deadline = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('le test a dépassé 2 minutes : le FTP ou qBittorrent répond trop lentement')), 120_000));
    void Promise.race([this.inspectNow(id), deadline])
      .then((result) => this.inspections.set(id, { status: 'done', startedAt: Date.now(), result }))
      .catch((e: any) => this.inspections.set(id, { status: 'error', startedAt: Date.now(), error: String(e?.message ?? e) }));
    return { started: true };
  }

  getInspect(id: string) {
    return this.inspections.get(id) ?? { status: 'none' as const };
  }

  /** Ce que la source contient et si le NFO de chaque release est trouvable, sans rien envoyer ni télécharger de vidéo. */
  private async inspectNow(id: string) {
    const src = await this.prisma.importSource.findUnique({ where: { id } });
    if (!src) throw new NotFoundException('Source introuvable');
    const cfg = src.config as unknown as ImportConfig;
    const secrets = openSecrets(src.secrets);
    const q = new Qbit(cfg.qbit.url, cfg.qbit.username, secrets.qbitPassword);
    let list: QbitTorrent[];
    try {
      await q.login();
      list = await this.listCompleted(q, cfg);
    } catch (e: any) {
      throw new Error(String(e?.message ?? e)); // message clair dans l'interface (mot de passe, adresse...)
    }
    const known = new Map((await this.prisma.importItem.findMany({ where: { sourceId: id } })).map((i) => [i.key, i.status]));
    const shown = list.slice(0, 6);
    const labels = await this.feedLabels(q, cfg, shown);
    const out: any[] = [];
    let ftpError: string | null = null; // si le FTP est en panne, on ne le réessaie pas pour chaque release
    for (const t of shown) {
      let source: 'NFO' | 'VIDEO' | 'NONE' = 'NONE', nfo = '', note = '';
      if (!cfg.ftp) note = 'aucun FTP configuré : le NFO ne peut pas être lu';
      else if (ftpError) note = ftpError;
      else {
        try {
          const r = await probeFor(cfg, secrets, id, t); source = r.source; nfo = r.nfo ?? '';
          if (source === 'VIDEO') {
            note = 'pas de .nfo : le MediaInfo sera calculé sur le début de la vidéo à l\'import';
            // Le nom ne dit pas la langue : on calcule le MediaInfo maintenant pour montrer la langue lue dans les pistes audio (ce que fera l'import).
            if (!detectReleaseMeta(t.name, '').language) {
              try { nfo = await nfoFor(cfg, secrets, id, t); if (hasNfo(nfo)) note = 'pas de .nfo : MediaInfo calculé sur le début de la vidéo (langue lue dans les pistes audio)'; else nfo = ''; }
              catch (e: any) { note = `MediaInfo non calculé : ${String(e?.message ?? e).slice(0, 120)}`; }
            }
          }
        }
        catch (e: any) { note = String(e?.message ?? e); if (e instanceof FtpConnectError) ftpError = note; }
      }
      const meta = detectReleaseMeta(t.name, nfo);
      // Langue introuvable malgré un NFO / MediaInfo : on montre les lignes qui parlent de langue pour comprendre pourquoi.
      const nfoHint = !meta.language && nfo ? nfo.split(/\r?\n/).filter((l) => /langu|audio|fran[cç]ais|french|\bvf[fqib2]\b|\bvo(?:st)?f?\b|qu[eé]b|canad/i.test(l)).slice(0, 6).map((l) => l.trim().slice(0, 110)) : [];
      const chosen = await this.chooseCategory(cfg, t, labels.get(t.hash) ?? '');
      out.push({
        name: t.name, size: t.size, qbitCategory: t.category, savePath: t.save_path, alreadyDone: known.get(t.hash) ?? null,
        nfo: source === 'NFO' && hasNfo(nfo) ? 'FOUND' : source === 'VIDEO' ? 'MEDIAINFO' : 'MISSING', note,
        language: meta.language ?? null, resolution: meta.resolution ?? null, nfoHint,
        category: chosen?.name ?? null, categoryHow: chosen?.how ?? null, feedLabel: labels.get(t.hash) ?? null,
        fiche: chosen?.meta ? `${chosen.meta.title}${chosen.meta.year ? ` (${chosen.meta.year})` : ''}` : null,
      });
    }
    return { total: list.length, shown: out, ftp: cfg.ftp ? (ftpError ? { ok: false, message: ftpError } : { ok: true }) : null };
  }
}
