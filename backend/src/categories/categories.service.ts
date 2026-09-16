import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

const DEFAULT_CATEGORIES = [
  { name: 'Films', slug: 'films' },
  { name: 'Séries TV', slug: 'series-tv' },
  { name: 'Musique', slug: 'musique' },
  { name: 'Jeux', slug: 'jeux' },
  { name: 'Applications', slug: 'applications' },
  { name: 'Animes', slug: 'animes' },
  { name: 'Livres', slug: 'livres' },
  { name: 'XXX', slug: 'xxx' },
];

@Injectable()
export class CategoriesService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  /** Crée les catégories par défaut si la table est vide (idempotent, sûr à chaque redémarrage). */
  async onModuleInit() {
    const count = await this.prisma.category.count();
    if (count > 0) return;
    await this.prisma.category.createMany({ data: DEFAULT_CATEGORIES, skipDuplicates: true });
  }

  list() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }
}
