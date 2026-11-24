import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { ONLINE_MS, cleanCommand, cleanDevice, cleanPlaying, dayKey, daysAgo, summarizeWatch, type LivePlaying, type RemoteCommand } from '../common/utils/vod-live';

interface Live {
  deviceId: string;
  accountId: string;
  playing: LivePlaying | null;
  /** Dernier message de l'appareil (ms). */
  at: number;
  commands: RemoteCommand[];
  /** Secondes regardées pas encore écrites en base. */
  pending: number;
  dbAt: number;
  sig: string;
}

const DB_EVERY_MS = 5 * 60_000;
const FLUSH_SECONDS = 30;
const MAX_STEP_S = 15; // jamais plus de 15 s créditées entre deux messages (l'application coupée au milieu ne crédite pas des heures)

/**
 * Appareils de l'application Seeduction et état en direct (ce qui joue, sur quel appareil). L'application écrit toutes les 3 s en lecture et toutes les 12 s sinon ;
 * la réponse porte les commandes envoyées depuis le site (pause, avance, arrêt, lancer un titre). Rien de cela n'est gardé en base, hormis la liste des appareils
 * et le temps regardé par jour (statistiques). Serveur unique : l'état est en mémoire.
 */
@Injectable()
export class VodLiveService {
  private live = new Map<string, Live>(); // clé = `${compte}:${deviceKey}`

  constructor(private prisma: PrismaService) {
    setInterval(() => this.sweep(), 10 * 60_000).unref();
  }

  private sweep() {
    const cut = Date.now() - 6 * 3_600_000;
    for (const [k, v] of this.live) if (v.at < cut && v.pending < 1) this.live.delete(k);
  }

  /** L'application se signale (et dit ce qu'elle joue) : met à jour l'appareil et rend les commandes en attente. */
  async ping(accountId: string, raw: any) {
    const dev = cleanDevice(raw);
    if (!dev) return { commands: [] as RemoteCommand[] };
    const key = `${accountId}:${dev.deviceKey}`;
    const now = Date.now();
    let st = this.live.get(key);
    const sig = `${dev.name}|${dev.kind}|${dev.appVersion}`;
    if (!st || st.sig !== sig || now - st.dbAt > DB_EVERY_MS) {
      const row = await this.prisma.vodDevice.upsert({
        where: { userId_deviceKey: { userId: accountId, deviceKey: dev.deviceKey } },
        create: { userId: accountId, deviceKey: dev.deviceKey, name: dev.name, kind: dev.kind, appVersion: dev.appVersion },
        // Le nom choisi sur le site n'est pas écrasé à chaque lancement : seul le premier nom vient de l'appareil.
        update: { kind: dev.kind, appVersion: dev.appVersion, lastSeenAt: new Date() },
        select: { id: true },
      });
      st = st ?? { deviceId: row.id, accountId, playing: null, at: 0, commands: [], pending: 0, dbAt: 0, sig };
      st.deviceId = row.id; st.dbAt = now; st.sig = sig;
      this.live.set(key, st);
    }

    const next = cleanPlaying(raw?.playing);
    const prev = st.playing;
    const same = !!prev && !!next && prev.torrentId === next.torrentId && prev.fileIndex === next.fileIndex;
    if (same && !next!.paused && !prev!.paused && st.at > 0) st.pending += Math.min((now - st.at) / 1000, MAX_STEP_S);
    if (prev && (!next || !same)) await this.flush(st, prev); // la lecture a changé ou s'est arrêtée
    else if (prev && st.pending >= FLUSH_SECONDS) await this.flush(st, prev);
    st.playing = next; st.at = now;

    const commands = st.commands; st.commands = [];
    return { commands };
  }

  private async flush(st: Live, p: LivePlaying) {
    const seconds = Math.floor(st.pending);
    st.pending -= seconds;
    if (seconds < 1) return;
    try {
      const meta = await this.prisma.torrent.findUnique({ where: { id: p.torrentId }, select: { genres: true, coverImage: true, category: { select: { contentKind: true, parent: { select: { contentKind: true } } } } } });
      const kind = (meta?.category?.contentKind ?? meta?.category?.parent?.contentKind) === 'SERIE' ? 'serie' : 'film';
      await this.prisma.vodWatch.upsert({
        where: { userId_torrentId_deviceId_day: { userId: st.accountId, torrentId: p.torrentId, deviceId: st.deviceId, day: dayKey(Date.now()) } },
        create: { userId: st.accountId, torrentId: p.torrentId, deviceId: st.deviceId, day: dayKey(Date.now()), seconds, title: p.title.slice(0, 160), cover: p.cover ?? meta?.coverImage ?? null, kind, genres: (meta?.genres ?? []).slice(0, 4) },
        update: { seconds: { increment: seconds } },
      });
    } catch { /* statistique facultative : jamais d'échec pour l'application */ }
  }

  /** Les appareils du compte, avec ce qui joue en ce moment. */
  async devices(accountId: string) {
    const rows = await this.prisma.vodDevice.findMany({ where: { userId: accountId }, orderBy: { lastSeenAt: 'desc' }, take: 30 });
    const now = Date.now();
    const byId = new Map<string, Live>();
    for (const v of this.live.values()) if (v.accountId === accountId) byId.set(v.deviceId, v);
    return rows.map((d) => {
      const l = byId.get(d.id);
      const online = !!l && now - l.at < ONLINE_MS;
      return {
        id: d.id, name: d.name, kind: d.kind, appVersion: d.appVersion, online,
        lastSeenAt: l ? new Date(Math.max(l.at, d.lastSeenAt.getTime())) : d.lastSeenAt,
        playing: online && l!.playing ? { ...l!.playing, ageSeconds: Math.round((now - l!.at) / 1000) } : null,
      };
    });
  }

  private async owned(accountId: string, id: string) {
    const d = await this.prisma.vodDevice.findFirst({ where: { id: String(id ?? ''), userId: accountId } });
    if (!d) throw new NotFoundException('Appareil inconnu');
    return d;
  }

  /** Commande depuis le site vers un appareil en ligne ; l'application l'exécute à son prochain message (3 à 12 s). */
  async command(accountId: string, id: string, body: any) {
    const d = await this.owned(accountId, id);
    const cmd = cleanCommand(body, randomUUID());
    if (!cmd) throw new ConflictException('Commande inconnue.');
    const l = this.live.get(`${accountId}:${d.deviceKey}`);
    if (!l || Date.now() - l.at > ONLINE_MS) throw new ConflictException("Cet appareil est hors ligne : ouvre l'application Seeduction dessus.");
    if (cmd.type !== 'start' && !l.playing) throw new ConflictException("Rien n'est en lecture sur cet appareil.");
    if (cmd.type === 'start') {
      const t = await this.prisma.torrent.findFirst({ where: { id: cmd.torrentId, status: 'APPROVED' }, select: { id: true } });
      if (!t) throw new NotFoundException('Titre introuvable');
    }
    l.commands = [...l.commands.filter((c) => c.type !== cmd.type || cmd.type === 'seekBy'), cmd].slice(-8);
    return { ok: true };
  }

  async rename(accountId: string, id: string, name: string) {
    const d = await this.owned(accountId, id);
    const clean = String(name ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 60);
    if (!clean) throw new ConflictException('Donne un nom à cet appareil.');
    await this.prisma.vodDevice.update({ where: { id: d.id }, data: { name: clean } });
    return { ok: true };
  }

  /** Oublier un appareil : il réapparaîtra à sa prochaine ouverture (l'application ne perd pas sa connexion). */
  async forget(accountId: string, id: string) {
    const d = await this.owned(accountId, id);
    this.live.delete(`${accountId}:${d.deviceKey}`);
    await this.prisma.vodDevice.delete({ where: { id: d.id } });
    return { ok: true };
  }

  /** Statistiques personnelles : temps regardé, titres et genres préférés, appareils, partage depuis l'application et notes données. */
  async stats(accountId: string, viewerId: string) {
    const [rows, devices, seeding, ratings] = await Promise.all([
      this.prisma.vodWatch.findMany({ where: { userId: accountId, day: { gte: daysAgo(400) } }, take: 20000 }),
      this.prisma.vodDevice.findMany({ where: { userId: accountId }, select: { id: true, name: true, kind: true } }),
      this.prisma.peer.findMany({ where: { userId: accountId, vod: true, isSeeder: true, lastAnnounceAt: { gt: new Date(Date.now() - 45 * 60_000) } }, select: { uploaded: true, torrentId: true } }),
      this.prisma.vodRating.aggregate({ where: { userId: viewerId }, _count: { _all: true }, _avg: { score: true } }),
    ]);
    const s = summarizeWatch(rows);
    const nameOf = new Map(devices.map((d) => [d.id, d]));
    return {
      ...s,
      devices: s.devices.map((d) => ({ ...d, name: nameOf.get(d.deviceId)?.name ?? 'Appareil retiré', kind: nameOf.get(d.deviceId)?.kind ?? 'phone' })),
      sharing: { titles: new Set(seeding.map((p) => p.torrentId)).size, uploadedBytes: seeding.reduce((n, p) => n + Number(p.uploaded), 0) },
      ratings: { count: ratings._count._all, average: ratings._avg.score ? Math.round(ratings._avg.score * 10) / 10 : null },
    };
  }

  /** Combien d'appareils lisent quelque chose à l'instant (sans dire qui). */
  watchingNow(): number {
    const now = Date.now();
    let n = 0;
    for (const v of this.live.values()) if (v.playing && !v.playing.paused && now - v.at < ONLINE_MS) n++;
    return n;
  }

  /** Heures regardées dans l'application ces 7 derniers jours, tous membres confondus (pour la promo). */
  async hoursThisWeek(): Promise<number> {
    const r = await this.prisma.vodWatch.aggregate({ where: { day: { gte: daysAgo(6) } }, _sum: { seconds: true } });
    return Math.round((r._sum.seconds ?? 0) / 3600);
  }

  // ------------------------------------------------------------------ notes (1 à 5 étoiles)

  async setRating(viewerId: string, v: { key: string; torrentId: string; title: string; cover: string | null; kind: 'film' | 'serie' }, score: number) {
    const key = v.key.slice(0, 200);
    if (!score) { await this.prisma.vodRating.deleteMany({ where: { userId: viewerId, key } }); return; }
    const data = { torrentId: v.torrentId, title: v.title.slice(0, 160), cover: v.cover, kind: v.kind, score };
    await this.prisma.vodRating.upsert({ where: { userId_key: { userId: viewerId, key } }, create: { userId: viewerId, key, ...data }, update: data });
  }

  /** Note moyenne des membres et ma note pour un contenu. */
  async ratingOf(viewerId: string, key: string) {
    const [agg, mine] = await Promise.all([
      this.prisma.vodRating.aggregate({ where: { key: key.slice(0, 200) }, _count: { _all: true }, _avg: { score: true } }),
      this.prisma.vodRating.findUnique({ where: { userId_key: { userId: viewerId, key: key.slice(0, 200) } }, select: { score: true } }),
    ]);
    return { average: agg._avg.score ? Math.round(agg._avg.score * 10) / 10 : null, count: agg._count._all, mine: mine?.score ?? null };
  }

  async myRatings(viewerId: string, limit = 100) {
    return this.prisma.vodRating.findMany({ where: { userId: viewerId }, orderBy: { updatedAt: 'desc' }, take: limit, select: { torrentId: true, title: true, cover: true, kind: true, score: true, updatedAt: true } });
  }

  /** Les contenus les mieux notés par les membres (4 étoiles et plus de moyenne). */
  async topRated(limit = 20): Promise<{ tid: string; avg: number; n: number }[]> {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT (array_agg("torrentId" ORDER BY "updatedAt" DESC))[1] AS tid, AVG(score)::float AS avg, COUNT(*)::int AS n
      FROM "VodRating" GROUP BY key HAVING AVG(score) >= 4 ORDER BY AVG(score) DESC, COUNT(*) DESC LIMIT ${limit}`);
  }
}
