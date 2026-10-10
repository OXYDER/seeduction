import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { TorrentsService } from '../torrents/torrents.service';
import { MetadataService } from '../metadata/metadata.service';
import { ImporterService, ReleaseInfo } from './importer.service';
import { ImportConfig, ImportSecrets, openSecrets, sealSecrets } from './importer.types';
import { Qbit, QbitTorrent } from './qbit.client';
import { FtpConnectError, ftpConnect, hasNfo, nfoFor } from './release-files';
import { detectReleaseMeta } from './release-meta';
import { cleanTitle, isFilmLike, isSeriesLike } from './category-guess';
import { assertPublicHost, assertPublicUrl } from './net-guard';

/** Catégorie créée dans le client du membre pour les torrents de Seeduction (jamais sur le tracker). */
export const SEED_CATEGORY = 'Seeduction';
const MAX_ANALYZE_PER_SCAN = 150;
const MAX_QUEUE_PER_REQUEST = 30;
const MAX_UPLOADS_PER_DAY = 100;
const MIN_SCAN_GAP_MS = 60_000;
const MAX_PARALLEL_JOBS = 3;
const META_KINDS = ['FILM', 'SERIE', 'MUSIQUE', 'LIVRE', 'JEU'];
const LIVE = ['PROPOSED', 'DUPE', 'QUEUED', 'UPLOADED', 'REJECTED', 'IGNORED'];

const str = (v: any, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
type JobKind = 'test' | 'scan' | 'publish' | 'seed';
interface Job { kind: JobKind; status: 'running' | 'done' | 'error'; startedAt: number; finishedAt?: number; done: number; total: number; message: string; result?: any; error?: string }

/**
 * Envoi de plusieurs torrents depuis le client du membre (page « Envoyer » > « Plusieurs torrents »).
 * Même principe que l'import du staff : le site lit le qBittorrent du membre (et son FTP pour le NFO), propose chaque release en vert
 * (reconnue) ou en orange (à corriger), publie ce que le membre confirme, puis ajoute la version Seeduction dans SON client, dans une
 * catégorie « Seeduction », sur les mêmes fichiers. Aucune catégorie n'est ajoutée sur le tracker, et rien n'est modifié dans le client
 * avant la première publication. Les torrents restent soumis à la modération habituelle.
 */
@Injectable()
export class MemberImportService {
  private readonly logger = new Logger(MemberImportService.name);
  private jobs = new Map<string, Job>();

  constructor(private prisma: PrismaService, private torrents: TorrentsService, private metadata: MetadataService, private importer: ImporterService) {}

  // ------------------------------------------------------------------ connexion (réglages)

  private view(b: any) {
    if (!b) return null;
    const secrets = openSecrets(b.secrets);
    const cfg = b.config as ImportConfig;
    return {
      qbit: { url: cfg.qbit.url, username: cfg.qbit.username ?? '', category: cfg.qbit.category ?? '', tag: cfg.qbit.tag ?? '' },
      ftp: cfg.ftp ? { host: cfg.ftp.host, port: cfg.ftp.port ?? 21, username: cfg.ftp.username, secure: cfg.ftp.secure !== false, rejectUnauthorized: cfg.ftp.rejectUnauthorized !== false } : null,
      hasQbitPassword: !!secrets.qbitPassword, hasFtpPassword: !!secrets.ftpPassword,
      lastScanAt: b.lastScanAt, lastError: b.lastError,
    };
  }

  /** Réglages enregistrés, état de l'opération en cours et compteurs par statut. */
  async get(userId: string) {
    const box = await this.prisma.memberSeedbox.findUnique({ where: { userId } });
    if (!box) return { box: null, job: null, counts: {} as Record<string, number> };
    const groups = await this.prisma.memberImportItem.groupBy({ by: ['status'], where: { boxId: box.id }, _count: { _all: true } });
    const counts: Record<string, number> = {};
    for (const g of groups) counts[g.status] = g._count._all;
    return { box: this.view(box), job: this.jobs.get(box.id) ?? null, counts };
  }

  async save(userId: string, body: any) {
    const q = body?.qbit ?? {};
    let url: string;
    try { url = await assertPublicUrl(str(q.url, 300)); } catch (e: any) { throw new BadRequestException(`qBittorrent : ${e.message}`); }
    const f = body?.ftp;
    if (f && str(f.host, 200)) { try { await assertPublicHost(str(f.host, 200)); } catch (e: any) { throw new BadRequestException(`FTP : ${e.message}`); } }
    const config = this.importer.normalize({
      qbit: { url, username: q.username, category: q.category, tag: q.tag },
      ftp: f && str(f.host, 200) ? f : undefined,
      mediainfo: true, autoCategory: true, readFeedCategory: false, attachMetadata: true, reviewUnmatched: true, autoApprove: false,
      seedOnSeeduction: true, seedCategory: SEED_CATEGORY, skipChecking: true,
    });
    const prev = await this.prisma.memberSeedbox.findUnique({ where: { userId } });
    const old = openSecrets(prev?.secrets ?? '');
    const next: ImportSecrets = { ...old };
    if (typeof body?.secrets?.qbitPassword === 'string' && body.secrets.qbitPassword) next.qbitPassword = body.secrets.qbitPassword;
    if (typeof body?.secrets?.ftpPassword === 'string' && body.secrets.ftpPassword) next.ftpPassword = body.secrets.ftpPassword;
    if (!config.ftp) delete next.ftpPassword;
    const secrets = sealSecrets(next);
    const box = prev
      ? await this.prisma.memberSeedbox.update({ where: { id: prev.id }, data: { config: config as any, secrets, lastError: null } })
      : await this.prisma.memberSeedbox.create({ data: { userId, config: config as any, secrets } });
    return this.view(box);
  }

  /** « Supprimer mes accès » : la connexion, les mots de passe et toute la liste disparaissent (les torrents déjà publiés restent). */
  async remove(userId: string) {
    const box = await this.prisma.memberSeedbox.findUnique({ where: { userId } });
    if (!box) return { deleted: false };
    this.jobs.delete(box.id);
    await this.prisma.memberSeedbox.delete({ where: { id: box.id } });
    return { deleted: true };
  }

  private async requireBox(userId: string) {
    const box = await this.prisma.memberSeedbox.findUnique({ where: { userId } });
    if (!box) throw new NotFoundException("Enregistre d'abord la connexion à ton client");
    return box;
  }

  /** Ouvre la connexion au client : l'adresse est revérifiée à chaque fois (elle ne doit jamais mener au réseau interne du site). */
  private async connect(box: { config: any; secrets: string }) {
    const cfg = box.config as ImportConfig;
    const secrets = openSecrets(box.secrets);
    try { await assertPublicUrl(cfg.qbit.url); } catch (e: any) { throw new Error(`qBittorrent : ${e.message}`); }
    if (cfg.ftp) { try { await assertPublicHost(cfg.ftp.host); } catch (e: any) { throw new Error(`FTP : ${e.message}`); } }
    const q = new Qbit(cfg.qbit.url, cfg.qbit.username, secrets.qbitPassword, true);
    await q.login();
    return { q, cfg, secrets };
  }

  // ------------------------------------------------------------------ opérations en arrière-plan (la réponse HTTP ne doit jamais attendre : coupure à ~60 s)

  private launch(box: { id: string }, kind: JobKind, run: (job: Job) => Promise<void>): Job {
    const cur = this.jobs.get(box.id);
    if (cur?.status === 'running' && Date.now() - cur.startedAt < 15 * 60_000) throw new BadRequestException('Une opération est déjà en cours sur ton client : patiente un instant');
    if ([...this.jobs.values()].filter((j) => j.status === 'running').length >= MAX_PARALLEL_JOBS) throw new BadRequestException('Le site traite déjà plusieurs clients en même temps : réessaie dans une minute');
    const job: Job = { kind, status: 'running', startedAt: Date.now(), done: 0, total: 0, message: '' };
    this.jobs.set(box.id, job);
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error("l'opération a dépassé 14 minutes : relance-la")), 14 * 60_000); });
    void Promise.race([run(job), deadline])
      .then(() => { if (job.status === 'running') job.status = 'done'; job.finishedAt = Date.now(); })
      .catch(async (e: any) => {
        job.status = 'error'; job.error = String(e?.message ?? e); job.finishedAt = Date.now();
        this.logger.warn(`[membre ${box.id.slice(0, 8)}] ${kind} : ${job.error}`);
        if (kind !== 'seed') await this.prisma.memberSeedbox.update({ where: { id: box.id }, data: { lastError: job.error.slice(0, 500) } }).catch(() => undefined);
      })
      .finally(() => clearTimeout(timer));
    return job;
  }

  /** Test de la connexion : qBittorrent (combien de torrents terminés) et FTP. Ne modifie rien. */
  async startTest(userId: string) {
    const box = await this.requireBox(userId);
    this.launch(box, 'test', async (job) => {
      job.message = 'Connexion à qBittorrent…';
      const { q, cfg, secrets } = await this.connect(box);
      const list = await this.importer.listCompleted(q, cfg);
      const result: any = { qbit: { ok: true, completed: list.length }, ftp: null };
      if (cfg.ftp) {
        job.message = 'Connexion au FTP…';
        try { (await ftpConnect(cfg, secrets)).close(); result.ftp = { ok: true }; }
        catch (e: any) { result.ftp = { ok: false, message: String(e?.message ?? e) }; }
      }
      job.result = result;
      job.message = `qBittorrent : ${list.length} torrent(s) terminé(s)${cfg.ftp ? (result.ftp.ok ? ' · FTP : connexion réussie' : ` · FTP : ${result.ftp.message}`) : ' · FTP non configuré (le NFO sera à coller à la main)'}`;
      await this.prisma.memberSeedbox.update({ where: { id: box.id }, data: { lastError: null } });
    });
    return { started: true };
  }

  /** Analyse les torrents terminés du client qui ne sont pas encore connus : chacun devient une ligne verte (reconnue), orange (à corriger) ou « déjà sur Seeduction ». */
  async startScan(userId: string) {
    const box = await this.requireBox(userId);
    if (box.lastScanAt && Date.now() - box.lastScanAt.getTime() < MIN_SCAN_GAP_MS) throw new BadRequestException('Analyse déjà faite à l\'instant : patiente une minute avant de relancer');
    this.launch(box, 'scan', (job) => this.runScan(box, job));
    return { started: true };
  }

  /** « Vérifier maintenant » : remet tout de suite en seed les torrents approuvés par la modération (sinon c'est fait toutes les 3 minutes). */
  async startSeed(userId: string) {
    const box = await this.requireBox(userId);
    this.launch(box, 'seed', async (job) => {
      job.message = 'Connexion à ton client…';
      const { q, cfg } = await this.connect(box);
      job.done = await this.seedBox(box, q, cfg);
      const waiting = await this.prisma.memberImportItem.count({ where: { boxId: box.id, status: 'UPLOADED', seeded: null } });
      job.message = `${job.done} torrent(s) remis en seed dans ton client${waiting ? ` · ${waiting} attendent encore la validation de la modération` : ''}`;
    });
    return { started: true };
  }

  private async runScan(box: { id: string; config: any; secrets: string }, job: Job) {
    job.message = 'Connexion à ton client…';
    const { q, cfg, secrets } = await this.connect(box);
    // Les torrents que ce service a lui-même remis en seed (catégorie « Seeduction ») ne sont jamais reproposés.
    const list = (await this.importer.listCompleted(q, cfg)).filter((t) => t.category !== SEED_CATEGORY).sort((a, b) => (b.completion_on || b.added_on) - (a.completion_on || a.added_on));
    const known = new Set((await this.prisma.memberImportItem.findMany({ where: { boxId: box.id }, select: { key: true } })).map((i) => i.key));
    const fresh = list.filter((t) => !known.has(t.hash));
    const batch = fresh.slice(0, MAX_ANALYZE_PER_SCAN);
    job.total = batch.length;
    job.message = `${list.length} torrent(s) terminé(s), ${fresh.length} nouveau(x) : analyse en cours…`;
    await this.prisma.memberSeedbox.update({ where: { id: box.id }, data: { lastScanAt: new Date(), lastError: null } });
    let ftpDown: string | null = null; // FTP en panne : on ne le réessaie pas pour chaque release
    for (const t of batch) {
      if (job.status !== 'running') return;
      try { ftpDown = (await this.analyze(box.id, cfg, secrets, t, ftpDown)) ?? ftpDown; }
      catch (e: any) { this.logger.warn(`analyse de ${t.name} : ${e?.message ?? e}`); }
      job.done++;
    }
    const rest = fresh.length - batch.length;
    job.message = `${batch.length} torrent(s) analysé(s) sur ${list.length} terminé(s)${rest > 0 ? ` · ${rest} restent à analyser : relance l'analyse` : ''}${ftpDown ? ` · FTP : ${ftpDown}` : ''}`;
  }

  /** Analyse un torrent et enregistre la ligne. Renvoie un message d'erreur FTP si le FTP est tombé (pour ne plus l'essayer). */
  private async analyze(boxId: string, cfg: ImportConfig, secrets: ImportSecrets, t: QbitTorrent, ftpDown: string | null): Promise<string | null> {
    const base = { boxId, key: t.hash, name: t.name, savePath: t.save_path };
    const clash = await this.importer.findClash(t);
    if (clash) {
      await this.prisma.memberImportItem.create({ data: { ...base, status: 'DUPE', why: `« ${clash.name} » est déjà sur Seeduction`, detail: { existingId: clash.id, existingName: clash.name, size: t.size, qbitCategory: t.category } as any } });
      return null;
    }
    const info: ReleaseInfo = {};
    const found = await this.importer.chooseCategory(cfg, t, '', info);
    const wantsFiche = !!info.type && (isFilmLike(info.type) || isSeriesLike(info.type)) && this.metadata.supportedKinds.includes('FILM');
    const kind = info.type && isSeriesLike(info.type) ? 'SERIE' : 'FILM';
    const title = info.title || cleanTitle(t.name).title;
    let suggestions: { id: string; title: string; subtitle: string; thumbnail: string | null }[] = [];
    if (wantsFiche && !found?.meta && title) {
      suggestions = await this.metadata.search(kind, title, info.year ? String(info.year) : undefined).catch(() => []);
      if (suggestions.length === 0 && info.year) suggestions = await this.metadata.search(kind, title).catch(() => []);
    }
    let nfo = '', nfoError = '', down: string | null = null;
    if (cfg.ftp && !ftpDown) {
      try { nfo = await nfoFor(cfg, secrets, 'm:' + boxId, t); }
      catch (e: any) { nfoError = String(e?.message ?? e).slice(0, 200); if (e instanceof FtpConnectError) down = nfoError; }
    } else if (ftpDown) nfoError = ftpDown;
    const meta = detectReleaseMeta(t.name, nfo);
    const detail: any = {
      type: info.type ?? null, kind, title, year: info.year ?? null, wantsFiche,
      category: found ? { id: found.id, name: found.name, how: found.how } : null,
      meta: found?.meta ?? null, suggestions: suggestions.slice(0, 6),
      language: meta.language ?? null, resolution: meta.resolution ?? null, size: t.size, qbitCategory: t.category,
      nfoState: hasNfo(nfo) ? 'OK' : nfoError ? 'ERROR' : cfg.ftp ? 'MISSING' : 'NO_FTP', nfoError: nfoError || null,
    };
    Object.assign(detail, this.verdict(detail, hasNfo(nfo)));
    await this.prisma.memberImportItem.create({ data: { ...base, status: 'PROPOSED', why: detail.reason, detail, nfo: hasNfo(nfo) ? nfo.slice(0, 200_000) : null } });
    return down;
  }

  /** Vert si tout est connu (catégorie, fiche pour un film / une série, NFO), sinon orange avec ce qu'il reste à faire. */
  private verdict(detail: any, nfoOk: boolean): { verdict: 'GREEN' | 'ORANGE'; problems: string[]; reason: string | null } {
    const o = detail.override ?? {};
    const problems: string[] = [];
    if (!(o.categoryId ?? detail.category?.id)) problems.push('category');
    if (detail.wantsFiche && !(o.metaId || detail.meta?.id || o.noMeta)) problems.push('fiche');
    if (!nfoOk) problems.push('nfo');
    const text: Record<string, string> = { category: 'catégorie non détectée', fiche: `aucune fiche sûre pour « ${detail.title ?? '?'} »`, nfo: detail.nfoState === 'NO_FTP' ? 'NFO à coller (aucun FTP configuré)' : 'NFO / MediaInfo introuvable' };
    return { verdict: problems.length ? 'ORANGE' : 'GREEN', problems, reason: problems.length ? problems.map((p) => text[p]).join(' · ') : null };
  }

  // ------------------------------------------------------------------ liste et corrections

  async items(userId: string, status?: string) {
    const box = await this.prisma.memberSeedbox.findUnique({ where: { userId } });
    if (!box) return [];
    const rows = await this.prisma.memberImportItem.findMany({
      where: { boxId: box.id, ...(status && LIVE.includes(status) ? { status } : {}) },
      orderBy: { updatedAt: 'desc' }, take: 500,
      select: { id: true, key: true, name: true, status: true, why: true, detail: true, torrentId: true, seeded: true, createdAt: true, updatedAt: true },
    });
    const ids = rows.map((r) => r.torrentId).filter((x): x is string => !!x);
    const states = ids.length ? await this.prisma.torrent.findMany({ where: { id: { in: ids } }, select: { id: true, status: true } }) : [];
    const byId = new Map(states.map((s) => [s.id, s.status]));
    return rows.map((r) => ({ ...r, torrentStatus: r.torrentId ? byId.get(r.torrentId) ?? 'DELETED' : null }));
  }

  /** Catégories de Seeduction et types de fiches (mêmes listes que l'envoi d'un seul torrent). */
  options() {
    return this.importer.reviewOptions();
  }

  search(kind: string, q: string, year?: string) {
    return this.importer.searchFiche(kind, q, year);
  }

  /** Correction faite par le membre : catégorie, fiche (ou « sans fiche »), langue, NFO collé. La ligne est ré-évaluée aussitôt. */
  async updateItem(userId: string, id: string, body: any) {
    const box = await this.requireBox(userId);
    const it = await this.prisma.memberImportItem.findFirst({ where: { id, boxId: box.id } });
    if (!it) throw new NotFoundException('Torrent introuvable');
    if (it.status !== 'PROPOSED') throw new BadRequestException("Ce torrent n'est plus modifiable");
    const detail: any = it.detail ?? {};
    const o: any = { ...(detail.override ?? {}) };
    if ('categoryId' in (body ?? {})) {
      const categoryId = str(body.categoryId, 60);
      if (categoryId) {
        const opts = await this.importer.reviewOptions();
        const cat = opts.categories.find((c) => c.id === categoryId);
        if (!cat) throw new BadRequestException('Choisis une sous-catégorie de la liste');
        o.categoryId = cat.id; o.categoryName = cat.name;
      } else { delete o.categoryId; delete o.categoryName; }
    }
    if ('metaId' in (body ?? {}) || 'noMeta' in (body ?? {})) {
      const metaId = str(body.metaId, 120), metaKind = str(body.metaKind, 20);
      if (metaId && !META_KINDS.includes(metaKind)) throw new BadRequestException('Type de fiche inconnu');
      o.metaId = metaId || null; o.metaKind = metaId ? metaKind : null; o.metaTitle = metaId ? str(body.metaTitle, 200) || null : null;
      o.noMeta = !metaId && body.noMeta === true;
    }
    if ('language' in (body ?? {})) o.language = str(body.language, 20) || null;
    let nfo = it.nfo;
    if (typeof body?.nfo === 'string') {
      const text = body.nfo.slice(0, 200_000);
      if (text.trim() && !hasNfo(text)) throw new BadRequestException('Le NFO / MediaInfo collé est trop court (20 caractères minimum)');
      nfo = text.trim() ? text : null;
    }
    const next: any = { ...detail, override: o };
    next.nfoState = hasNfo(nfo ?? '') ? 'OK' : detail.nfoState === 'OK' ? 'MISSING' : detail.nfoState;
    Object.assign(next, this.verdict(next, hasNfo(nfo ?? '')));
    const updated = await this.prisma.memberImportItem.update({ where: { id }, data: { detail: next, nfo, why: next.reason } });
    return { id: updated.id, status: updated.status, why: updated.why, detail: updated.detail };
  }

  /** Remet une ligne dans la file d'analyse (elle sera reprise à la prochaine analyse). */
  async retryItem(userId: string, id: string) {
    const box = await this.requireBox(userId);
    const it = await this.prisma.memberImportItem.findFirst({ where: { id, boxId: box.id } });
    if (!it) throw new NotFoundException('Torrent introuvable');
    if (!['PROPOSED', 'DUPE', 'IGNORED', 'REJECTED'].includes(it.status)) throw new BadRequestException('Ce torrent ne peut pas être ré-analysé');
    await this.prisma.memberImportItem.delete({ where: { id } });
    return { retried: true };
  }

  async ignoreItem(userId: string, id: string, ignore = true) {
    const box = await this.requireBox(userId);
    const it = await this.prisma.memberImportItem.findFirst({ where: { id, boxId: box.id } });
    if (!it) throw new NotFoundException('Torrent introuvable');
    if (ignore && it.status !== 'PROPOSED') throw new BadRequestException('Seul un torrent proposé peut être écarté');
    if (!ignore && it.status !== 'IGNORED') throw new BadRequestException("Ce torrent n'est pas écarté");
    await this.prisma.memberImportItem.update({ where: { id }, data: { status: ignore ? 'IGNORED' : 'PROPOSED', why: ignore ? 'écarté par toi' : null } });
    return { ok: true };
  }

  // ------------------------------------------------------------------ publication

  /** Le membre confirme une sélection de lignes : seules les lignes vertes (ou corrigées) partent, au plus {MAX_QUEUE_PER_REQUEST} à la fois et {MAX_UPLOADS_PER_DAY} par jour. */
  async publish(userId: string, ids: unknown) {
    const box = await this.requireBox(userId);
    const list = Array.isArray(ids) ? [...new Set(ids.filter((x): x is string => typeof x === 'string'))] : [];
    if (list.length === 0) throw new BadRequestException('Coche au moins un torrent');
    if (list.length > MAX_QUEUE_PER_REQUEST) throw new BadRequestException(`${MAX_QUEUE_PER_REQUEST} torrents maximum à la fois : envoie le reste ensuite`);
    const today = await this.prisma.memberImportItem.count({ where: { boxId: box.id, status: { in: ['UPLOADED', 'QUEUED'] }, updatedAt: { gt: new Date(Date.now() - 86400_000) } } });
    if (today + list.length > MAX_UPLOADS_PER_DAY) throw new BadRequestException(`Limite de ${MAX_UPLOADS_PER_DAY} torrents par jour via ton client : il t'en reste ${Math.max(0, MAX_UPLOADS_PER_DAY - today)} aujourd'hui`);
    const rows = await this.prisma.memberImportItem.findMany({ where: { boxId: box.id, id: { in: list } } });
    const queued: string[] = [], skipped: { name: string; why: string }[] = [];
    for (const it of rows) {
      const d: any = it.detail ?? {};
      if (it.status !== 'PROPOSED') { skipped.push({ name: it.name, why: 'déjà traité' }); continue; }
      if (d.problems?.length) { skipped.push({ name: it.name, why: it.why ?? 'à corriger' }); continue; }
      await this.prisma.memberImportItem.update({ where: { id: it.id }, data: { status: 'QUEUED', why: 'envoi en cours' } });
      queued.push(it.id);
    }
    if (queued.length) { try { this.launch(box, 'publish', (job) => this.runPublish(box, job)); } catch { /* une autre opération tourne : la file sera reprise par la passe suivante */ } }
    return { queued: queued.length, skipped };
  }

  private async runPublish(box: { id: string; userId: string; config: any; secrets: string }, job: Job) {
    const queued = await this.prisma.memberImportItem.findMany({ where: { boxId: box.id, status: 'QUEUED' }, orderBy: { createdAt: 'asc' }, take: MAX_QUEUE_PER_REQUEST });
    job.total = queued.length;
    job.message = 'Connexion à ton client…';
    const { q, cfg } = await this.connect(box);
    const byHash = new Map((await this.importer.listCompleted(q, cfg)).map((t) => [t.hash, t]));
    let sent = 0;
    for (const it of queued) {
      if (job.status !== 'running') return;
      job.message = `Envoi : ${it.name}`;
      const back = (why: string) => this.prisma.memberImportItem.update({ where: { id: it.id }, data: { status: 'PROPOSED', why } });
      const t = byHash.get(it.key);
      if (!t) { await back('introuvable dans ton client (supprimé, déplacé ou plus terminé) : relance l\'analyse'); job.done++; continue; }
      const d: any = it.detail ?? {}, o = d.override ?? {};
      const categoryId = o.categoryId ?? d.category?.id;
      const metaKind = o.metaId ? o.metaKind : d.meta?.kind, metaId = o.metaId ?? d.meta?.id;
      const nfo = it.nfo ?? '';
      if (!categoryId || !hasNfo(nfo)) { await back(!categoryId ? 'catégorie manquante' : 'NFO / MediaInfo manquant'); job.done++; continue; }
      try {
        const buf = await q.exportTorrent(t.hash);
        if (!buf.length || buf[0] !== 0x64) throw new Error("le fichier exporté n'est pas un .torrent");
        const meta = detectReleaseMeta(t.name, nfo);
        const language = o.language || meta.language;
        const created = await this.torrents.upload({
          userId: box.userId, fileBuffer: buf, name: t.name, categoryId, tags: [], anonymous: false, nfo, ...meta, ...(language ? { language } : {}),
          ...(metaKind && metaId ? { metaKind, metaId } : {}),
        });
        await this.prisma.memberImportItem.update({ where: { id: it.id }, data: { status: 'UPLOADED', torrentId: created.id, savePath: t.save_path, why: created.status === 'APPROVED' ? null : 'en attente de validation par la modération' } });
        sent++;
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (e instanceof BadRequestException) {
          const dupe = /dupe|existe déjà/i.test(msg);
          await this.prisma.memberImportItem.update({ where: { id: it.id }, data: { status: dupe ? 'DUPE' : 'REJECTED', why: dupe ? 'ce contenu existe déjà sur Seeduction' : msg } });
        } else await back(`erreur temporaire : ${msg.slice(0, 160)} — tu peux réessayer`);
      }
      job.done++;
    }
    job.message = `${sent} torrent(s) envoyé(s) sur ${queued.length}. Ils attendent la validation de la modération, puis ton client les reprendra en seed automatiquement.`;
    await this.seedBox(box, q, cfg); // si la modération a déjà tout approuvé, le seed démarre tout de suite
  }

  // ------------------------------------------------------------------ remise en seed (version Seeduction dans le client du membre)

  /** Torrents publiés et approuvés : la version Seeduction est ajoutée dans le client du membre, catégorie « Seeduction », mêmes fichiers, sans re-vérification. */
  private async seedBox(box: { id: string; userId: string }, q: Qbit, cfg: ImportConfig): Promise<number> {
    const items = await this.prisma.memberImportItem.findMany({ where: { boxId: box.id, status: 'UPLOADED', seeded: null, torrentId: { not: null } } });
    let added = 0, categoryReady = false;
    for (const it of items) {
      const t = await this.prisma.torrent.findUnique({ where: { id: it.torrentId! }, select: { status: true } });
      const abandon = (why: string) => this.prisma.memberImportItem.update({ where: { id: it.id }, data: { seeded: 'UNAVAILABLE', why } });
      if (!t) { await abandon('supprimé de Seeduction'); continue; }
      if (t.status === 'PENDING') continue; // pas encore validé par la modération
      if (!['APPROVED', 'DEAD'].includes(t.status)) { await abandon(`statut ${t.status} : seed non démarré`); continue; }
      try {
        if (!categoryReady) { await q.ensureCategory(SEED_CATEGORY); categoryReady = true; }
        const file = await this.torrents.getDownloadFile(it.torrentId!, box.userId);
        await q.add(file, { savepath: it.savePath ?? '', category: SEED_CATEGORY, tags: 'seeduction', skipChecking: cfg.skipChecking !== false });
        await this.prisma.memberImportItem.update({ where: { id: it.id }, data: { seeded: 'OK', why: null } });
        added++;
      } catch (e: any) {
        this.logger.warn(`[membre ${box.id.slice(0, 8)}] seed de ${it.name} : ${e?.message ?? e}`);
        await this.prisma.memberImportItem.update({ where: { id: it.id }, data: { why: `seed : ${String(e?.message ?? e).slice(0, 160)}` } }).catch(() => undefined);
      }
    }
    return added;
  }

  /** Toutes les 3 minutes : les torrents approuvés depuis le dernier passage reprennent le seed dans le client du membre. */
  @Cron('*/3 * * * *')
  async seedTick() {
    try {
      // Envois en file restés sans passe (une autre opération tournait au moment de la confirmation) : repris ici.
      for (const box of await this.prisma.memberSeedbox.findMany({ where: { items: { some: { status: 'QUEUED' } } }, take: 10 })) {
        try { this.launch(box, 'publish', (job) => this.runPublish(box, job)); } catch { /* occupé : prochaine passe */ }
      }
      const boxes = await this.prisma.memberSeedbox.findMany({ where: { items: { some: { status: 'UPLOADED', seeded: null } } }, take: 20 });
      for (const box of boxes) {
        const pending = await this.prisma.memberImportItem.findMany({ where: { boxId: box.id, status: 'UPLOADED', seeded: null, torrentId: { not: null } }, select: { torrentId: true } });
        const ready = await this.prisma.torrent.count({ where: { id: { in: pending.map((p) => p.torrentId!) }, status: { not: 'PENDING' } } });
        const gone = pending.length - (await this.prisma.torrent.count({ where: { id: { in: pending.map((p) => p.torrentId!) } } }));
        if (ready === 0 && gone === 0) continue; // tout attend encore la modération : on ne dérange pas le client du membre
        try { this.launch(box, 'seed', async (job) => { const { q, cfg } = await this.connect(box); job.total = ready; job.done = await this.seedBox(box, q, cfg); job.message = `${job.done} torrent(s) remis en seed dans ton client`; }); }
        catch { /* occupé : prochaine passe */ }
      }
    } catch (e: any) {
      this.logger.warn(`Remise en seed des membres : ${e?.message ?? e}`);
    }
  }
}
