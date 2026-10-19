import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AdultService } from '../adult/adult.service';
import { MAX_SUBTITLE_BYTES, SUBTITLE_LANGS, clampOffset, normalizeLang, parseSubtitle, prepareSubtitle, toSrt } from '../common/utils/subtitle-file';

const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];
const MAX_PER_TORRENT = 40;
const MAX_PER_SLOT = 8; // même fichier, même langue
const MAX_PER_DAY = 30;

/**
 * Sous-titres partagés par les membres (.srt / .vtt envoyés depuis la fiche d'un torrent). Le lecteur Seeduction les récupère tout seul au moment de la lecture,
 * et un membre peut aussi les télécharger. Ils sont normalisés en SRT UTF-8 à l'envoi ; le décalage de synchronisation éventuel est appliqué quand on les sert.
 */
@Injectable()
export class SubtitlesService {
  constructor(private prisma: PrismaService, private adult: AdultService) {}

  private async visibleTorrent(torrentId: string, viewerId: string, role: string) {
    const t = await this.prisma.torrent.findUnique({ where: { id: torrentId }, select: { id: true, status: true, categoryId: true, fileList: true } });
    if (!t || (t.status !== 'APPROVED' && !STAFF.includes(role))) throw new NotFoundException('Torrent introuvable');
    if (!STAFF.includes(role) && (await this.adult.hiddenFor(viewerId)).includes(t.categoryId)) throw new ForbiddenException('Ce contenu est réservé aux adultes : active-le dans ton profil.');
    return t;
  }

  private view(r: any, viewerId: string, role: string) {
    return {
      id: r.id, fileIndex: r.fileIndex, language: r.language, languageName: SUBTITLE_LANGS[r.language]?.name ?? r.language, label: r.label, cues: r.cues, offsetMs: r.offsetMs, downloads: r.downloads,
      uploader: r.uploader?.username ?? null, createdAt: r.createdAt, mine: r.uploaderId === viewerId, canEdit: r.uploaderId === viewerId || STAFF.includes(role),
    };
  }

  async list(torrentId: string, viewerId: string, role: string) {
    const t = await this.visibleTorrent(torrentId, viewerId, role);
    const rows = await this.prisma.subtitleFile.findMany({ where: { torrentId }, orderBy: [{ language: 'asc' }, { createdAt: 'asc' }], select: { id: true, fileIndex: true, language: true, label: true, cues: true, offsetMs: true, downloads: true, uploaderId: true, createdAt: true, uploader: { select: { username: true } } } });
    const files = Array.isArray(t.fileList) ? (t.fileList as any[]).map((f, index) => ({ index, path: String(f?.path ?? '') })).filter((f) => /\.(mkv|mp4|m4v|avi|mov|wmv|ts|m2ts|webm|mpg|mpeg|flv|ogv|divx|vob)$/i.test(f.path)) : [];
    return { languages: Object.entries(SUBTITLE_LANGS).map(([code, v]) => ({ code, name: v.name })), files, items: rows.map((r) => this.view(r, viewerId, role)) };
  }

  async upload(user: { userId: string; accountId: string; role: string }, torrentId: string, file: { buffer: Buffer; size: number; originalname: string } | undefined, body: { language?: string; label?: string; fileIndex?: string | number }) {
    const viewerId = user.accountId ?? user.userId;
    const t = await this.visibleTorrent(torrentId, viewerId, user.role);
    if (!file) throw new BadRequestException('Choisis un fichier de sous-titres (.srt ou .vtt)');
    if (file.size > MAX_SUBTITLE_BYTES) throw new BadRequestException('Fichier trop gros (600 Ko au plus)');
    const language = normalizeLang(body.language);
    if (!language) throw new BadRequestException('Choisis la langue des sous-titres');
    const files = Array.isArray(t.fileList) ? (t.fileList as any[]) : [];
    const fileIndex = body.fileIndex === undefined || body.fileIndex === null || body.fileIndex === '' ? null : Math.floor(Number(body.fileIndex));
    if (fileIndex !== null && (!Number.isInteger(fileIndex) || fileIndex < 0 || fileIndex >= files.length)) throw new BadRequestException('Fichier du torrent inconnu');
    if (fileIndex === null && files.filter((f) => /\.(mkv|mp4|m4v|avi|mov|wmv|ts|m2ts|webm|mpg|mpeg|flv|ogv|divx|vob)$/i.test(String(f?.path ?? ''))).length > 1) {
      throw new BadRequestException('Ce torrent contient plusieurs vidéos : choisis celle à laquelle ces sous-titres vont');
    }
    const prepared = prepareSubtitle(file.buffer);
    if (!prepared.ok) throw new BadRequestException(prepared.reason);
    const [today, total, slot] = await Promise.all([
      this.prisma.subtitleFile.count({ where: { uploaderId: viewerId, createdAt: { gt: new Date(Date.now() - 86_400_000) } } }),
      this.prisma.subtitleFile.count({ where: { torrentId } }),
      this.prisma.subtitleFile.count({ where: { torrentId, language, fileIndex } }),
    ]);
    if (today >= MAX_PER_DAY) throw new BadRequestException(`Limite de ${MAX_PER_DAY} sous-titres par jour atteinte`);
    if (total >= MAX_PER_TORRENT) throw new BadRequestException('Ce torrent a déjà beaucoup de sous-titres');
    if (slot >= MAX_PER_SLOT) throw new BadRequestException('Il y a déjà plusieurs sous-titres dans cette langue pour ce fichier : choisis-en un existant');
    const row = await this.prisma.subtitleFile.create({
      data: { torrentId, fileIndex, language, label: String(body.label ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80), content: prepared.srt, cues: prepared.cues, uploaderId: viewerId },
      select: { id: true, fileIndex: true, language: true, label: true, cues: true, offsetMs: true, downloads: true, uploaderId: true, createdAt: true, uploader: { select: { username: true } } },
    });
    return this.view(row, viewerId, user.role);
  }

  private async editable(user: { userId: string; accountId: string; role: string }, id: string) {
    const row = await this.prisma.subtitleFile.findUnique({ where: { id }, select: { id: true, uploaderId: true } });
    if (!row) throw new NotFoundException('Sous-titres introuvables');
    const viewerId = user.accountId ?? user.userId;
    if (row.uploaderId !== viewerId && !STAFF.includes(user.role)) throw new ForbiddenException("Seule la personne qui les a envoyés (ou l'équipe) peut les modifier");
    return row;
  }

  async update(user: { userId: string; accountId: string; role: string }, id: string, body: { offsetMs?: number; label?: string; language?: string }) {
    await this.editable(user, id);
    const language = body.language !== undefined ? normalizeLang(body.language) : undefined;
    if (body.language !== undefined && !language) throw new BadRequestException('Langue inconnue');
    const row = await this.prisma.subtitleFile.update({
      where: { id },
      data: { ...(body.offsetMs !== undefined ? { offsetMs: clampOffset(body.offsetMs) } : {}), ...(typeof body.label === 'string' ? { label: body.label.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80) } : {}), ...(language ? { language } : {}) },
      select: { id: true, fileIndex: true, language: true, label: true, cues: true, offsetMs: true, downloads: true, uploaderId: true, createdAt: true, uploader: { select: { username: true } } },
    });
    return this.view(row, user.accountId ?? user.userId, user.role);
  }

  async remove(user: { userId: string; accountId: string; role: string }, id: string) {
    await this.editable(user, id);
    await this.prisma.subtitleFile.delete({ where: { id } });
    return { ok: true };
  }

  /** Le fichier .srt prêt à l'emploi (décalage appliqué) pour un membre connecté. */
  async download(user: { userId: string; accountId: string; role: string }, id: string) {
    const row = await this.prisma.subtitleFile.findUnique({ where: { id }, select: { id: true, torrentId: true, language: true, content: true, offsetMs: true, torrent: { select: { name: true } } } });
    if (!row) throw new NotFoundException('Sous-titres introuvables');
    await this.visibleTorrent(row.torrentId, user.accountId ?? user.userId, user.role);
    await this.prisma.subtitleFile.update({ where: { id }, data: { downloads: { increment: 1 } } }).catch(() => undefined);
    return { filename: `${row.torrent.name.replace(/[^\w.\- ()]/g, '_').slice(0, 120)}.${row.language}.srt`, text: this.apply(row.content, row.offsetMs) };
  }

  private apply(content: string, offsetMs: number) { return offsetMs ? toSrt(parseSubtitle(content), offsetMs) : content; }

  // ------------------------------------------------------------------ lecteur Seeduction (identifié par la passkey, comme la lecture et le suivi)

  private async byPasskey(passkey: string) {
    const u = passkey ? await this.prisma.user.findUnique({ where: { passkey: String(passkey) }, select: { id: true, status: true, role: true } }) : null;
    if (!u || u.status === 'BANNED' || u.status === 'DISABLED') throw new ForbiddenException('Accès refusé');
    return u;
  }

  /** Sous-titres qui vont avec le fichier lu : ceux du fichier précis et ceux valables pour tout le torrent, du plus téléchargé au moins téléchargé. */
  async forPlayer(passkey: string, torrentId: string, fileIndex: number) {
    const u = await this.byPasskey(passkey);
    await this.visibleTorrent(torrentId, u.id, u.role);
    const rows = await this.prisma.subtitleFile.findMany({
      where: { torrentId, OR: [{ fileIndex }, { fileIndex: null }] }, orderBy: [{ downloads: 'desc' }, { createdAt: 'asc' }], take: 12, select: { id: true, language: true, label: true, fileIndex: true },
    });
    return rows.map((r) => ({ id: r.id, language: r.language, iso3: SUBTITLE_LANGS[r.language]?.iso3 ?? 'und', label: r.label || SUBTITLE_LANGS[r.language]?.name || r.language, exact: r.fileIndex !== null }));
  }

  async playFile(passkey: string, id: string) {
    const u = await this.byPasskey(passkey);
    const row = await this.prisma.subtitleFile.findUnique({ where: { id }, select: { torrentId: true, content: true, offsetMs: true } });
    if (!row) throw new NotFoundException('Sous-titres introuvables');
    await this.visibleTorrent(row.torrentId, u.id, u.role);
    return this.apply(row.content, row.offsetMs);
  }
}
