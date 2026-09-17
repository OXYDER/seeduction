import { randomBytes, createHash } from 'crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

export const API_SCOPES = ['torrents:read', 'stats:read', 'user:read'] as const;
export type ApiScope = (typeof API_SCOPES)[number];

@Injectable()
export class ApiKeysService {
  constructor(private prisma: PrismaService) {}

  private hash(rawKey: string) {
    return createHash('sha256').update(rawKey).digest('hex');
  }

  async create(userId: string, label: string, scopes: string[]) {
    if (!label?.trim()) throw new BadRequestException('Label requis');
    const invalid = scopes.filter((s) => !(API_SCOPES as readonly string[]).includes(s));
    if (invalid.length > 0) throw new BadRequestException(`Portée(s) invalide(s) : ${invalid.join(', ')}`);
    if (scopes.length === 0) throw new BadRequestException('Choisis au moins une portée');

    const rawKey = `sd_${randomBytes(24).toString('hex')}`;
    const created = await this.prisma.apiKey.create({
      data: { userId, label: label.trim(), scopes, keyHash: this.hash(rawKey), keyPrefix: rawKey.slice(0, 10) },
    });
    // La clé en clair n'est renvoyée qu'ici, une seule fois — jamais persistée.
    return { ...created, rawKey };
  }

  list(userId: string) {
    return this.prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, label: true, keyPrefix: true, scopes: true, lastUsedAt: true, revoked: true, createdAt: true },
    });
  }

  async revoke(userId: string, id: string) {
    const key = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!key) throw new NotFoundException('Clé introuvable');
    if (key.userId !== userId) throw new ForbiddenException("Ce n'est pas ta clé");
    return this.prisma.apiKey.update({ where: { id }, data: { revoked: true } });
  }

  async validate(rawKey: string) {
    const apiKey = await this.prisma.apiKey.findUnique({ where: { keyHash: this.hash(rawKey) } });
    if (!apiKey || apiKey.revoked) return null;
    this.prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    return apiKey;
  }
}
