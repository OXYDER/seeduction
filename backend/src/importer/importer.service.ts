import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { TorrentsService } from '../torrents/torrents.service';
import { AdminService } from '../admin/admin.service';
import { ImportConfig, ImportSecrets, openSecrets, sealSecrets } from './importer.types';
import { Qbit, QbitTorrent } from './qbit.client';
import { FtpConnectError, hasNfo, nfoFor, probeFor } from './release-files';
import { detectReleaseMeta } from './release-meta';
import { MetadataService } from '../metadata/metadata.service';
import { SupportBotService } from '../support/support-bot.service';
import { cleanTitle, feedLabelOf, guessType, isFilmLike, isSeriesLike, leafKey, refineWithGenres, resolveCandidate, typeFromFeedLabel } from './category-guess';

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

  constructor(private prisma: PrismaService, private torrents: TorrentsService, private admin: AdminService, private metadata: MetadataService, private bot: SupportBotService) {}

  // ------------------------------------------------------------------ configuration

  /** Valide et nettoie les réglages envoyés par le formulaire. */
  normalize(raw: any): ImportConfig {
    const q = raw?.qbit ?? {};
    const url = str(q.url, 300);
    if (!/^https?:\/\/[^\s]+$/i.test(url)) throw new BadRequestException("Adresse de l'interface web de qBittorrent invalide (ex. https://qbittorrent.exemple.com)");
    const cfg: ImportConfig = {
      qbit: { url: url.replace(/\/$/, ''), username: str(q.username, 100) || undefined, category: str(q.category, 100) || undefined, tag: str(q.tag, 100) || undefined, doneTag: str(q.doneTag, 100) || 'seeduction-envoye' },
      defaultCategory: str(raw?.defaultCategory, 100) || undefined,
      autoCategory: raw?.autoCategory !== false,
      readFeedCategory: raw?.readFeedCategory !== false,
      attachMetadata: raw?.attachMetadata !== false,
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
    if (!['SKIPPED', 'REJECTED'].includes(item.status)) throw new BadRequestException('Seuls les éléments mis de côté ou refusés peuvent être retentés');
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
        if (s.lastRunAt && Date.now() - s.lastRunAt.getTime() < (cfg.intervalMinutes ?? 10) * 60_000) continue;
        await this.execute(s.id, false);
      }
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
  private async listCompleted(q: Qbit, cfg: ImportConfig): Promise<QbitTorrent[]> {
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
  private async chooseCategory(cfg: ImportConfig, t: QbitTorrent, feedLabel = ''): Promise<{ name: string; id: string; how: string; meta?: { kind: 'FILM' | 'SERIE'; id: string; title: string; year?: string } } | null> {
    const leaves = await this.leaves();
    // Type de contenu : la catégorie du flux RSS (si claire) prime sur le nom ; sinon le nom.
    const byName = guessType(t.name);
    const byFeed = cfg.readFeedCategory !== false && feedLabel ? typeFromFeedLabel(feedLabel, byName) : undefined;
    let type = byFeed ?? byName;
    let how = byFeed ? 'flux RSS' : 'détection';

    // Fiche TMDB (film ou série) : sert à classer (animation, émission, documentaire) ET à rattacher la fiche au torrent.
    let meta: { kind: 'FILM' | 'SERIE'; id: string; title: string; year?: string } | undefined;
    const wantsTmdb = cfg.attachMetadata !== false || cfg.autoCategory !== false;
    if (type && wantsTmdb && (isFilmLike(type) || isSeriesLike(type))) {
      const { title, year } = cleanTitle(t.name);
      const series = isSeriesLike(type);
      const match = await this.metadata.tmdbMatch(series ? 'tv' : 'movie', title, year);
      if (match) {
        meta = { kind: series ? 'SERIE' : 'FILM', id: match.id, title: match.title, year: match.year };
        if (cfg.autoCategory !== false && (type === 'FILM' || type === 'SERIE')) {
          const refined = refineWithGenres(type, match.genreIds);
          if (refined !== type) { how = how === 'flux RSS' ? 'flux RSS + TMDB' : 'TMDB'; type = refined; }
        }
      }
    }

    for (const r of cfg.categoryRules ?? []) {
      if (!new RegExp(r.match, 'i').test(`${t.name} ${t.category} ${feedLabel}`)) continue;
      const id = leaves.ids.get(leafKey(r.category));
      if (id) return { name: leaves.names.get(leafKey(r.category))!, id, how: 'règle', meta };
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

  private async execute(id: string, dryRun: boolean) {
    if (this.running) return;
    this.running = { sourceId: id, dryRun, startedAt: Date.now() };
    const src = await this.prisma.importSource.findUnique({ where: { id } });
    if (!src) { this.running = null; return; }
    const cfg = src.config as unknown as ImportConfig;
    const secrets = openSecrets(src.secrets);
    const ev = (level: 'INFO' | 'WARN' | 'ERROR', msg: string) => this.event(id, level, (dryRun ? '(essai) ' : '') + msg);
    let lastError: string | null = null;
    try {
      if (!dryRun) await this.prisma.importSource.update({ where: { id }, data: { lastRunAt: new Date() } });
      // Les torrents sont publiés (et seedés, avec son passkey) par le compte du robot « Seeduction » : jamais par un compte de membre.
      const robot = await this.bot.ensureBot();
      const uploaderId = robot.id;
      if (src.uploaderId !== robot.id) await this.prisma.importSource.update({ where: { id }, data: { uploaderId: robot.id } }).catch(() => undefined);
      const q = new Qbit(cfg.qbit.url, cfg.qbit.username, secrets.qbitPassword);
      await q.login();
      await this.seedPass(src.id, uploaderId, cfg, q, dryRun, ev);

      const list = (await this.listCompleted(q, cfg)).sort((a, b) => (a.completion_on || a.added_on) - (b.completion_on || b.added_on));
      const known = new Set((await this.prisma.importItem.findMany({ where: { sourceId: id }, select: { key: true } })).map((i) => i.key));
      const labels = await this.feedLabels(q, cfg, list);
      let sent = 0;
      for (const t of list) {
        if (known.has(t.hash)) continue;
        const skip = async (why: string) => { if (!dryRun) await this.prisma.importItem.create({ data: { sourceId: id, key: t.hash, name: t.name, status: 'SKIPPED', why } }); await ev('WARN', `${t.name} — mis de côté : ${why}`); };
        if ((cfg.include ?? []).length && !(cfg.include ?? []).some((p) => new RegExp(p, 'i').test(t.name))) { await skip('ne correspond à aucun filtre « inclure »'); continue; }
        if ((cfg.exclude ?? []).some((p) => new RegExp(p, 'i').test(t.name))) { await skip('exclu par un filtre « exclure »'); continue; }
        const chosen = await this.chooseCategory(cfg, t, labels.get(t.hash) ?? '');
        if (!chosen) { await skip("type de contenu non détecté : ajoute une règle de catégorie ou choisis une catégorie par défaut, puis « Retenter »"); continue; }
        const catName = chosen.name, catId = chosen.id;
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
        if (dryRun) { await ev('INFO', `enverrait : ${t.name} → ${catName}`); sent++; continue; }

        try {
          const meta = detectReleaseMeta(t.name, nfo); // langue (VFQ en priorité), résolution, source, codec, saison / épisode...
          const created = await this.torrents.upload({ userId: uploaderId, fileBuffer: buf, name: t.name, description: cfg.description, categoryId: catId, tags: [], anonymous: false, nfo, ...meta, ...(cfg.attachMetadata !== false && chosen.meta ? { metaKind: chosen.meta.kind, metaId: chosen.meta.id } : {}) });
          const status = cfg.autoApprove !== false ? (await this.admin.approveTorrent(created.id)).status : created.status; // import configuré par un administrateur : approuvé directement
          await this.prisma.importItem.create({ data: { sourceId: id, key: t.hash, name: t.name, status: 'UPLOADED', torrentId: created.id, savePath: t.save_path } });
          await ev('INFO', `✓ ${t.name} → ${catName} [${chosen.how}]${meta.language ? ` · ${meta.language}` : ''} ${chosen.meta && cfg.attachMetadata !== false ? ` · fiche TMDB : ${chosen.meta.title}` : ''} (${status === 'APPROVED' ? 'approuvé' : 'en attente de validation'})`);
          q.addTags(t.hash, cfg.qbit.doneTag || 'seeduction-envoye').catch(() => undefined);
          sent++;
        } catch (e: any) {
          if (e instanceof BadRequestException) {
            const msg = String(e.message);
            const dupe = /dupe|existe déjà/i.test(msg);
            await this.prisma.importItem.create({ data: { sourceId: id, key: t.hash, name: t.name, status: dupe ? 'DUPE' : 'REJECTED', why: msg } });
            await ev('WARN', dupe ? `= ${t.name} — déjà sur Seeduction` : `${t.name} — refusé : ${msg}`);
          } else {
            await ev('ERROR', `${t.name} — erreur d'envoi : ${e?.message ?? e}`); // temporaire : réessayé plus tard
          }
        }
        if (cfg.delaySeconds) await sleep(cfg.delaySeconds * 1000);
      }
      await ev('INFO', `Passe terminée : ${sent} ${dryRun ? 'à envoyer' : 'envoyé(s)'} sur ${list.length} release(s) terminée(s).`);
    } catch (e: any) {
      lastError = String(e?.message ?? e);
      await ev('ERROR', lastError);
    } finally {
      if (!dryRun) await this.prisma.importSource.update({ where: { id }, data: { lastError } }).catch(() => undefined);
      this.running = null;
    }
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
        try { const r = await probeFor(cfg, secrets, id, t); source = r.source; nfo = r.nfo ?? ''; if (source === 'VIDEO') note = 'pas de .nfo : le MediaInfo sera calculé sur le début de la vidéo à l\'import'; }
        catch (e: any) { note = String(e?.message ?? e); if (e instanceof FtpConnectError) ftpError = note; }
      }
      const meta = detectReleaseMeta(t.name, nfo);
      const chosen = await this.chooseCategory(cfg, t, labels.get(t.hash) ?? '');
      out.push({
        name: t.name, size: t.size, qbitCategory: t.category, savePath: t.save_path, alreadyDone: known.get(t.hash) ?? null,
        nfo: source === 'NFO' && hasNfo(nfo) ? 'FOUND' : source === 'VIDEO' ? 'MEDIAINFO' : 'MISSING', note,
        language: meta.language ?? null, resolution: meta.resolution ?? null,
        category: chosen?.name ?? null, categoryHow: chosen?.how ?? null, feedLabel: labels.get(t.hash) ?? null,
        fiche: chosen?.meta ? `${chosen.meta.title}${chosen.meta.year ? ` (${chosen.meta.year})` : ''}` : null,
      });
    }
    return { total: list.length, shown: out, ftp: cfg.ftp ? (ftpError ? { ok: false, message: ftpError } : { ok: true }) : null };
  }
}
