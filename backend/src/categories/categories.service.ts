import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AdultService } from '../adult/adult.service';
import { SettingsService } from '../settings/settings.service';
import { LEGACY_FACET_CATEGORIES, RECOMMENDED_CATEGORIES } from './recommended';

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
  constructor(private prisma: PrismaService, private adult: AdultService, private settings: SettingsService) {}

  /** Crée les catégories par défaut si la table est vide (idempotent, sûr à chaque redémarrage). */
  async onModuleInit() {
    const count = await this.prisma.category.count();
    if (count === 0) {
      await this.prisma.category.createMany({ data: DEFAULT_CATEGORIES.map((c) => (c.slug === 'xxx' ? { ...c, adult: true } : c)), skipDuplicates: true });
    }
    // Une seule fois : la catégorie XXX existante devient « contenu adulte » (le staff peut ensuite changer ce réglage).
    if (!(await this.settings.get('xxxMarkedAdult'))) {
      await this.prisma.category.updateMany({ where: { slug: 'xxx' }, data: { adult: true } });
      await this.settings.set('xxxMarkedAdult', true);
      this.adult.invalidate();
    }
  }

  /**
   * Ajoute l'arborescence recommandée (FR / QC) : seules les catégories absentes sont créées.
   * Une catégorie est considérée présente si son nom OU son identifiant d'adresse existe déjà.
   */
  /**
   * Fusionne dans leur catégorie principale les anciennes sous-catégories « qualité / origine / langue » (Films HD,
   * Films québécois...) : les torrents sont déplacés, la valeur correspondante est reportée dans leur filtre
   * (résolution, source, origine, langue, audio) si elle est vide, puis la sous-catégorie est supprimée.
   */
  async simplifyLegacy() {
    let removed = 0;
    let moved = 0;
    for (const legacy of LEGACY_FACET_CATEGORIES) {
      const category = await this.prisma.category.findFirst({
        where: { name: { equals: legacy.name, mode: 'insensitive' }, parent: { name: { equals: legacy.parent, mode: 'insensitive' } } },
        select: { id: true, parentId: true },
      });
      if (!category?.parentId) continue;
      for (const [field, value] of Object.entries(legacy.set ?? {})) {
        await this.prisma.torrent.updateMany({ where: { categoryId: category.id, [field]: null }, data: { [field]: value } });
      }
      const result = await this.prisma.torrent.updateMany({ where: { categoryId: category.id }, data: { categoryId: category.parentId } });
      moved += result.count;
      await this.prisma.category.delete({ where: { id: category.id } }).catch(() => undefined);
      removed++;
    }
    this.adult.invalidate();
    return { removed, moved };
  }

  async installRecommended() {
    let created = 0;
    let skipped = 0;
    const exists = async (name: string) =>
      !!(await this.prisma.category.findFirst({ where: { OR: [{ name: { equals: name, mode: 'insensitive' } }, { slug: slugify(name) }] }, select: { id: true } }));

    for (const top of RECOMMENDED_CATEGORIES) {
      let parent = await this.prisma.category.findFirst({ where: { OR: [{ name: { equals: top.name, mode: 'insensitive' } }, { slug: slugify(top.name) }] } });
      if (!parent) {
        parent = await this.prisma.category.create({ data: { name: top.name, slug: slugify(top.name), contentKind: (top.kind as any) ?? null, adult: !!top.adult } });
        created++;
      } else {
        skipped++;
        // Une catégorie existante sans type de contenu reçoit celui recommandé (la recherche automatique en dépend).
        if (!parent.contentKind && top.kind) await this.prisma.category.update({ where: { id: parent.id }, data: { contentKind: top.kind as any } });
      }
      for (const child of top.children) {
        if (await exists(child.name)) { skipped++; continue; }
        await this.prisma.category.create({ data: { name: child.name, slug: slugify(child.name), parentId: parent.id, contentKind: (child.kind as any) ?? null } });
        created++;
      }
    }
    this.adult.invalidate();
    return { created, skipped };
  }

  async list(viewer?: { userId: string; role: string }, includeAdult = false) {
    // Le staff peut demander toutes les catégories (pour les gérer) ; sinon les catégories adultes sont masquées.
    const staff = ['MODERATOR', 'ADMIN', 'OWNER'].includes(viewer?.role ?? '');
    const hidden = includeAdult && staff ? [] : await this.adult.hiddenFor(viewer?.userId);
    // contentKind est renvoyé tel quel (non hérité) : une sous-catégorie sans
    // valeur propre doit rester "vide" pour l'admin (édition) — c'est au
    // consommateur (page Envoyer) de retomber sur celui de la catégorie
    // parente si besoin, voir lib/categoryKind.ts côté frontend.
    return this.prisma.category.findMany({
      where: { parentId: null, ...(hidden.length ? { id: { notIn: hidden } } : {}) },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { torrents: true } },
        children: {
          where: hidden.length ? { id: { notIn: hidden } } : undefined,
          orderBy: { name: 'asc' },
          include: { _count: { select: { torrents: true } } },
        },
      },
    });
  }

  create(name: string, parentId?: string, contentKind?: string | null, imageUrl?: string | null, adult = false) {
    this.adult.invalidate();
    return this.prisma.category.create({
      data: { name, slug: slugify(name), parentId: parentId || null, contentKind: (contentKind as any) || null, imageUrl: imageUrl || null, adult: !!adult },
    });
  }

  async update(id: string, data: { name?: string; parentId?: string | null; contentKind?: string | null; imageUrl?: string | null; adult?: boolean }) {
    this.adult.invalidate();
    const payload: any = {};
    if (typeof data.adult === 'boolean') payload.adult = data.adult;
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
