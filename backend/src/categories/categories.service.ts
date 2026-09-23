import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

const DEFAULT_CATEGORIES = [
  { name: 'Films', slug: 'films', contentKind: 'FILM' as const },
  { name: 'Séries TV', slug: 'series-tv', contentKind: 'SERIE' as const },
  { name: 'Musique', slug: 'musique', contentKind: 'MUSIQUE' as const },
  { name: 'Jeux', slug: 'jeux', contentKind: 'JEU' as const },
  { name: 'Applications', slug: 'applications', contentKind: 'LOGICIEL' as const },
  { name: 'Animes', slug: 'animes', contentKind: 'SERIE' as const },
  { name: 'Livres', slug: 'livres', contentKind: 'LIVRE' as const },
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
    // contentKind est renvoyé tel quel (non hérité) : une sous-catégorie sans
    // valeur propre doit rester "vide" pour l'admin (édition) — c'est au
    // consommateur (page Envoyer) de retomber sur celui de la catégorie
    // parente si besoin, voir lib/categoryKind.ts côté frontend.
    return this.prisma.category.findMany({
      where: { parentId: null },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { torrents: true } },
        children: {
          orderBy: { name: 'asc' },
          include: { _count: { select: { torrents: true } } },
        },
      },
    });
  }

  create(name: string, parentId?: string, contentKind?: string | null, imageUrl?: string | null) {
    return this.prisma.category.create({
      data: { name, slug: slugify(name), parentId: parentId || null, contentKind: (contentKind as any) || null, imageUrl: imageUrl || null },
    });
  }

  async update(id: string, data: { name?: string; parentId?: string | null; contentKind?: string | null; imageUrl?: string | null }) {
    const payload: any = {};
    if (data.name !== undefined) {
      payload.name = data.name;
      payload.slug = slugify(data.name);
    }
    if (data.contentKind !== undefined) payload.contentKind = data.contentKind || null;
    if (data.imageUrl !== undefined) payload.imageUrl = data.imageUrl || null;
    if (data.parentId !== undefined) {
      const newParentId = data.parentId || null;
      if (newParentId === id) throw new BadRequestException('Une catégorie ne peut pas être son propre parent');
      if (newParentId) {
        const hasChildren = await this.prisma.category.count({ where: { parentId: id } });
        if (hasChildren > 0) {
          throw new BadRequestException('Cette catégorie a des sous-catégories : elle ne peut pas devenir elle-même une sous-catégorie');
        }
        const parent = await this.prisma.category.findUnique({ where: { id: newParentId } });
        if (!parent) throw new BadRequestException('Catégorie parente introuvable');
        if (parent.parentId) throw new BadRequestException('Impossible de créer plus de deux niveaux de catégories');
      }
      payload.parentId = newParentId;
    }
    return this.prisma.category.update({ where: { id }, data: payload });
  }

  async delete(id: string) {
    const [torrentCount, childCount] = await Promise.all([
      this.prisma.torrent.count({ where: { categoryId: id } }),
      this.prisma.category.count({ where: { parentId: id } }),
    ]);
    if (torrentCount > 0) {
      throw new BadRequestException(`Impossible : ${torrentCount} torrent(s) utilisent encore cette catégorie`);
    }
    if (childCount > 0) {
      throw new BadRequestException(`Impossible : ${childCount} sous-catégorie(s) à supprimer d'abord`);
    }
    return this.prisma.category.delete({ where: { id } });
  }
}
