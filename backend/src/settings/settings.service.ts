import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

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
  }

  /** Fin du freeleech global (date ISO), ou null s'il n'y en a pas d'actif. */
  async freeleechUntil(): Promise<Date | null> {
    const raw = await this.get<string>('freeleechUntil');
    if (!raw) return null;
    const until = new Date(raw);
    return until.getTime() > Date.now() ? until : null;
  }
}

@Global()
@Module({
  providers: [SettingsService, PrismaService],
  exports: [SettingsService],
})
export class SettingsModule {}
