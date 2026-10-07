import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { TorrentsService } from '../torrents/torrents.service';
import { AdminService } from '../admin/admin.service';
import { ImportConfig, ImportSecrets, openSecrets, sealSecrets } from './importer.types';
import { Qbit, QbitTorrent } from './qbit.client';
import { hasNfo, nfoFor } from './release-files';
import { detectReleaseMeta } from './release-meta';

const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];
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
 * (NFO lu ou MediaInfo calculé par FTP), approuvées si le compte est du staff, puis le torrent de Seeduction est ajouté dans qBittorrent
 * sur les mêmes fichiers pour seeder. Une passe toutes les `intervalMinutes`, chaque torrent n'est traité qu'une fois.
 */
@Injectable()
export class ImporterService {
  private readonly logger = new Logger(ImporterService.name);
  private running: { sourceId: string; dryRun: boolean; startedAt: number } | null = null;
  private warnedNoNfo = new Set<string>();

  constructor(private prisma: PrismaService, private torrents: TorrentsService, private admin: AdminService) {}

  // ------------------------------------------------------------------ configuration

  /** Valide et nettoie les réglages envoyés par le formulaire. */
  normalize(raw: any): ImportConfig {
    const q = raw?.qbit ?? {};
    const url = str(q.url, 300);
    if (!/^https?:\/\/[^\s]+$/i.test(url)) throw new BadRequestException("Adresse de l'interface web de qBittorrent invalide (ex. https://qbittorrent.exemple.com)");
    const cfg: ImportConfig = {
      qbit: { url: url.replace(/\/$/, ''), username: str(q.username, 100) || undefined, category: str(q.category, 100) || undefined, tag: str(q.tag, 100) || undefined, doneTag: str(q.doneTag, 100) || 'seeduction-envoye' },
      defaultCategory: str(raw?.defaultCategory, 100),
      categoryRules: [],
      include: regexList(raw?.include, 'filtre « inclure »'),
      exclude: regexList(raw?.exclude, 'filtre « exclure »'),
      description: str(raw?.description, 2000) || undefined,
      mediainfo: raw?.mediainfo !== false,
      seedOnSeeduction: raw?.seedOnSeeduction !== false,
      seedCategory: str(raw?.seedCategory, 100) || 'seeduction',
      skipChecking: raw?.skipChecking !== false,
      intervalMinutes: num(raw?.intervalMinutes, 1, 1440, 10),
      maxPerRun: num(raw?.maxPerRun, 1, 50, 5),
      delaySeconds: num(raw?.delaySeconds, 0, 120, 30),
    };
    if (!cfg.defaultCategory) throw new BadRequestException('Choisis la catégorie par défaut sur Seeduction');
    for (const r of Array.isArray(raw?.categoryRules) ? raw.categoryRules.slice(0, 30) : []) {
      const match = str(r?.match, 200), category = str(r?.category, 100);
      if (!match || !category) continue;
      try { new RegExp(match, 'i'); } catch { throw new BadRequestException(`Expression régulière invalide (règle de catégorie) : ${match}`); }
      cfg.categoryRules!.push({ match, category });
    }
    const f = raw?.ftp;
    if (f && str(f.host, 200)) {
      cfg.ftp = { host: str(f.host, 200), port: num(f.port, 1, 65535, 21), username: str(f.username, 100), secure: f.secure !== false, rejectUnauthorized: f.rejectUnauthorized !== false, headMB: num(f.headMB, 1, 64, 16), searchDepth: num(f.searchDepth, 1, 6, 3) };
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

  private pickCategory(cfg: ImportConfig, t: QbitTorrent): string {
    for (const r of cfg.categoryRules ?? []) if (new RegExp(r.match, 'i').test(`${t.name} ${t.category}`)) return r.category;
    return cfg.defaultCategory;
  }

  private async categoryId(name: string): Promise<string | null> {
    const cat = await this.prisma.category.findFirst({ where: { name: { equals: name, mode: 'insensitive' } }, select: { id: true, _count: { select: { children: true } } } });
    return cat && cat._count.children === 0 ? cat.id : null; // seules les sous-catégories reçoivent des torrents
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
      const uploader = await this.prisma.user.findUnique({ where: { id: src.uploaderId }, select: { role: true, status: true, username: true } });
      if (!uploader || uploader.status !== 'ACTIVE') throw new Error("le compte au nom duquel les torrents sont envoyés n'existe plus ou est désactivé");
      const staff = STAFF.includes(uploader.role);
      const q = new Qbit(cfg.qbit.url, cfg.qbit.username, secrets.qbitPassword);
      await q.login();
      await this.seedPass(src.id, src.uploaderId, cfg, q, dryRun, ev);

      const list = (await q.completed({ category: cfg.qbit.category, tag: cfg.qbit.tag })).sort((a, b) => (a.completion_on || a.added_on) - (b.completion_on || b.added_on));
      const known = new Set((await this.prisma.importItem.findMany({ where: { sourceId: id }, select: { key: true } })).map((i) => i.key));
      let sent = 0;
      for (const t of list) {
        if (known.has(t.hash)) continue;
        const skip = async (why: string) => { if (!dryRun) await this.prisma.importItem.create({ data: { sourceId: id, key: t.hash, name: t.name, status: 'SKIPPED', why } }); await ev('WARN', `${t.name} — mis de côté : ${why}`); };
        if ((cfg.include ?? []).length && !(cfg.include ?? []).some((p) => new RegExp(p, 'i').test(t.name))) { await skip('ne correspond à aucun filtre « inclure »'); continue; }
        if ((cfg.exclude ?? []).some((p) => new RegExp(p, 'i').test(t.name))) { await skip('exclu par un filtre « exclure »'); continue; }
        const catName = this.pickCategory(cfg, t);
        const catId = await this.categoryId(catName);
        if (!catId) { await skip(`catégorie « ${catName} » introuvable sur Seeduction (ou catégorie principale)`); continue; }
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
          const created = await this.torrents.upload({ userId: src.uploaderId, fileBuffer: buf, name: t.name, description: cfg.description, categoryId: catId, tags: [], anonymous: false, nfo, ...meta });
          const status = staff ? (await this.admin.approveTorrent(created.id)).status : created.status; // le staff valide de toute façon ses propres envois
          await this.prisma.importItem.create({ data: { sourceId: id, key: t.hash, name: t.name, status: 'UPLOADED', torrentId: created.id, savePath: t.save_path } });
          await ev('INFO', `✓ ${t.name} → ${catName}${meta.language ? ` · ${meta.language}` : ''} (${status === 'APPROVED' ? 'approuvé' : 'en attente de validation'})`);
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

  /** « Tester » : ce que la source contient et si le NFO de chaque release est trouvable, sans rien envoyer. */
  async inspect(id: string) {
    const src = await this.prisma.importSource.findUnique({ where: { id } });
    if (!src) throw new NotFoundException('Source introuvable');
    const cfg = src.config as unknown as ImportConfig;
    const secrets = openSecrets(src.secrets);
    const q = new Qbit(cfg.qbit.url, cfg.qbit.username, secrets.qbitPassword);
    let list: QbitTorrent[];
    try {
      await q.login();
      list = await q.completed({ category: cfg.qbit.category, tag: cfg.qbit.tag });
    } catch (e: any) {
      throw new BadRequestException(String(e?.message ?? e)); // message clair dans l'interface (mot de passe, adresse...)
    }
    const known = new Map((await this.prisma.importItem.findMany({ where: { sourceId: id } })).map((i) => [i.key, i.status]));
    const out: any[] = [];
    for (const t of list.slice(0, 8)) {
      let nfo = '', note = '';
      try { nfo = await nfoFor(cfg, secrets, id, t); } catch (e: any) { note = e.message; }
      const meta = detectReleaseMeta(t.name, nfo);
      out.push({ name: t.name, size: t.size, qbitCategory: t.category, savePath: t.save_path, alreadyDone: known.get(t.hash) ?? null, nfo: hasNfo(nfo) ? 'FOUND' : 'MISSING', note, language: meta.language ?? null, resolution: meta.resolution ?? null, category: this.pickCategory(cfg, t) });
    }
    return { total: list.length, shown: out };
  }
}
