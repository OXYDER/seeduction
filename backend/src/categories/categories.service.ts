import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
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

function slugify(name: string) {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

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
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { torrents: true } } },
    });
  }

  create(name: string) {
    return this.prisma.category.create({ data: { name, slug: slugify(name) } });
  }

  update(id: string, name: string) {
    return this.prisma.category.update({ where: { id }, data: { name, slug: slugify(name) } });
  }

  async delete(id: string) {
    const count = await this.prisma.torrent.count({ where: { categoryId: id } });
    if (count > 0) {
      throw new BadRequestException(`Impossible : ${count} torrent(s) utilisent encore cette catégorie`);
    }
    return this.prisma.category.delete({ where: { id } });
  }
}
