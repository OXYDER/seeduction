import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

export interface FreeleechEventInfo { id: string; title: string; message: string | null; startsAt: Date; endsAt: Date }
export interface FreeleechState { until: Date | null; event: FreeleechEventInfo | null; upcoming: FreeleechEventInfo[] }

/** Réglages modifiables à chaud (stockés en base), avec un petit cache pour ne pas interroger la base à chaque announce. */
@Injectable()
export class SettingsService {
  private cache = new Map<string, { value: any; at: number }>();
  private readonly ttlMs = 10_000;

  constructor(private prisma: PrismaService) {}

  async get<T = any>(key: string): Promise<T | null> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.value as T | null;
    const row = await this.prisma.siteSetting.findUnique({ where: { key } });
    const value = (row?.value ?? null) as T | null;
    this.cache.set(key, { value, at: Date.now() });
    return value;
  }

  async set(key: string, value: any) {
    await this.prisma.siteSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
    this.cache.delete(key);
    this.freeleechCache = null;
  }

  private freeleechCache: { at: number; value: FreeleechState } | null = null;

  /**
   * État du freeleech global : soit lancé à la main (réglage « freeleechUntil »), soit un événement
   * programmé dont la période est en cours. `upcoming` liste les prochains événements.
   */
  async freeleechState(): Promise<FreeleechState> {
    if (this.freeleechCache && Date.now() - this.freeleechCache.at < this.ttlMs) return this.freeleechCache.value;
    const now = new Date();
    const [manualRaw, active, upcoming] = await Promise.all([
      this.get<string>('freeleechUntil'),
      this.prisma.freeleechEvent.findMany({ where: { startsAt: { lte: now }, endsAt: { gt: now } }, orderBy: { endsAt: 'desc' } }),
      this.prisma.freeleechEvent.findMany({ where: { startsAt: { gt: now } }, orderBy: { startsAt: 'asc' }, take: 5 }),
    ]);
    const manual = manualRaw && new Date(manualRaw).getTime() > now.getTime() ? new Date(manualRaw) : null;
    const ends = [manual, active[0]?.endsAt ?? null].filter((d): d is Date => !!d);
    const value: FreeleechState = {
      until: ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null,
      event: active[0] ?? null,
      upcoming,
    };
    this.freeleechCache = { at: Date.now(), value };
    return value;
  }

  /**
   * Calendrier complet : tous les événements freeleech programmés qui touchent la période demandée (passés, en cours et à venir), pour la page « Calendrier freeleech ».
   * `from` et `to` sont des dates ISO ; sans elles, du début du mois courant à 12 mois plus loin.
   */
  async freeleechCalendar(fromIso?: string, toIso?: string) {
    const now = new Date();
    const from = fromIso && !Number.isNaN(Date.parse(fromIso)) ? new Date(fromIso) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = toIso && !Number.isNaN(Date.parse(toIso)) ? new Date(toIso) : new Date(from.getFullYear(), from.getMonth() + 12, 1);
    // Au plus deux ans de calendrier d'un coup.
    const cappedTo = new Date(Math.min(to.getTime(), from.getTime() + 740 * 86_400_000));
    const events = await this.prisma.freeleechEvent.findMany({
      where: { startsAt: { lt: cappedTo }, endsAt: { gt: from } },
      orderBy: { startsAt: 'asc' },
      take: 400,
      select: { id: true, title: true, message: true, startsAt: true, endsAt: true },
    });
    const state = await this.freeleechState();
    return { from, to: cappedTo, now, events, until: state.until, activeEventId: state.event?.id ?? null };
  }

  invalidateFreeleech() {
    this.freeleechCache = null;
    this.cache.delete('freeleechUntil');
  }

  /** Double upload global en cours (récompense du pot commun) : l'upload de tout le monde compte en double. */
  async doubleUploadActive(): Promise<boolean> {
    const raw = await this.get<any>('potDoubleUpload');
    const windows: { startsAt: string; endsAt: string }[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const now = Date.now();
    return windows.some((w) => new Date(w.startsAt).getTime() <= now && new Date(w.endsAt).getTime() > now);
  }

  /** Fin du freeleech global (manuel ou événement en cours), ou null s'il n'y en a pas d'actif. */
  async freeleechUntil(): Promise<Date | null> {
    return (await this.freeleechState()).until;
  }
}

@Global()
@Module({
  providers: [SettingsService, PrismaService],
  exports: [SettingsService],
})
export class SettingsModule {}
