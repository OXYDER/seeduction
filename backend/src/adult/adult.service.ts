import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

/**
 * Contenu pour adultes : les catégories marquées « adulte » par le staff (et leurs sous-catégories)
 * restent invisibles pour tout membre qui n'a pas activé l'option dans son compte — et pour les visiteurs
 * sans compte (API publique, flux RSS).
 */
@Injectable()
export class AdultService {
  private cache: { at: number; ids: string[] } | null = null;
  private readonly ttlMs = 30_000;

  constructor(private prisma: PrismaService) {}

  /** Identifiants des catégories adultes (catégories marquées + sous-catégories de celles-ci). */
  async adultCategoryIds(): Promise<string[]> {
    if (this.cache && Date.now() - this.cache.at < this.ttlMs) return this.cache.ids;
    const rows = await this.prisma.category.findMany({
      where: { OR: [{ adult: true }, { parent: { adult: true } }] },
      select: { id: true },
    });
    const ids = rows.map((r) => r.id);
    this.cache = { at: Date.now(), ids };
    return ids;
  }

  invalidate() {
    this.cache = null;
  }

  /** Catégories à masquer pour ce visiteur : aucune s'il a activé le contenu adulte, sinon toutes les catégories adultes. */
  async hiddenFor(userId?: string | null): Promise<string[]> {
    const adult = await this.adultCategoryIds();
    if (adult.length === 0 || !userId) return adult;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { showAdult: true } });
    return user?.showAdult ? [] : adult;
  }
}

@Global()
@Module({
  providers: [AdultService, PrismaService],
  exports: [AdultService],
})
export class AdultModule {}
