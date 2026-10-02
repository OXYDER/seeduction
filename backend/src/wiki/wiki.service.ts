import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { WIKI_SEED } from './wiki-seed';

const hashOf = (a: { title: string; content: string; keywords: string | null }) =>
  createHash('sha1').update(JSON.stringify([a.title, a.content, a.keywords ?? ''])).digest('hex');

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const CATEGORY_SELECT = { id: true, name: true, slug: true, icon: true, order: true };
const ARTICLE_LIST_SELECT = { id: true, categoryId: true, title: true, slug: true, isFaq: true, order: true, updatedAt: true };

@Injectable()
export class WikiService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  /**
   * Garde le wiki aligné sur le fichier de départ (voir wiki-seed.ts) à chaque démarrage, sans jamais écraser le travail du staff :
   * • un article du fichier qui n'existe pas encore est créé (c'est ce qui fait apparaître la documentation d'une nouvelle fonctionnalité) ;
   * • un article du fichier dont le texte a changé est mis à jour, mais seulement s'il n'a pas été retouché depuis (empreinte `seedHash`) ;
   * • un article qui en remplace d'anciens (`supersedes`) les retire, s'ils n'ont pas été retouchés non plus.
   * Pour retirer définitivement un article du seed, le supprimer aussi de wiki-seed.ts, sinon il revient au prochain démarrage.
   */
  async onModuleInit() {
    const untouched = (a: { title: string; content: string; keywords: string | null; seedHash: string | null; createdAt: Date; updatedAt: Date }) =>
      a.seedHash ? a.seedHash === hashOf(a) : Math.abs(a.updatedAt.getTime() - a.createdAt.getTime()) < 2000; // anciens articles : pas d'empreinte, on se fie aux dates

    for (const cat of WIKI_SEED) {
      for (const art of cat.articles) {
        for (const oldSlug of art.supersedes ?? []) {
          const old = await this.prisma.wikiArticle.findUnique({ where: { slug: oldSlug } });
          if (old && untouched(old)) await this.prisma.wikiArticle.delete({ where: { id: old.id } });
        }
      }
    }

    for (let i = 0; i < WIKI_SEED.length; i++) {
      const cat = WIKI_SEED[i];
      let category = await this.prisma.wikiCategory.findUnique({ where: { slug: cat.slug } });
      if (!category) category = await this.prisma.wikiCategory.create({ data: { name: cat.name, slug: cat.slug, icon: cat.icon, order: i } });

      for (let j = 0; j < cat.articles.length; j++) {
        const art = cat.articles[j];
        const seedHash = hashOf({ title: art.title, content: art.content, keywords: art.keywords ?? null });
        const existing = await this.prisma.wikiArticle.findUnique({ where: { slug: art.slug } });
        if (!existing) {
          await this.prisma.wikiArticle.create({
            data: { categoryId: category.id, title: art.title, slug: art.slug, content: art.content, keywords: art.keywords ?? null, isFaq: !!art.isFaq, order: j, seedHash },
          });
        } else if (untouched(existing) && existing.seedHash !== seedHash) {
          await this.prisma.wikiArticle.update({
            where: { id: existing.id },
            data: { title: art.title, content: art.content, keywords: art.keywords ?? null, isFaq: !!art.isFaq, seedHash },
          });
        }
      }
    }
  }

  /** Arborescence complète (catégories + leurs articles, sans le contenu) pour la navigation. */
  async tree() {
    return this.prisma.wikiCategory.findMany({
      orderBy: { order: 'asc' },
      select: { ...CATEGORY_SELECT, articles: { orderBy: { order: 'asc' }, select: ARTICLE_LIST_SELECT } },
    });
  }

  faq() {
    return this.prisma.wikiArticle.findMany({
      where: { isFaq: true },
      orderBy: [{ category: { order: 'asc' } }, { order: 'asc' }],
      include: { category: { select: CATEGORY_SELECT } },
    });
  }

  async search(q: string) {
    const term = (q || '').trim();
    if (term.length < 2) return [];
    return this.prisma.wikiArticle.findMany({
      where: {
        OR: [
          { title: { contains: term, mode: 'insensitive' } },
          { content: { contains: term, mode: 'insensitive' } },
          { keywords: { contains: term, mode: 'insensitive' } },
        ],
      },
      orderBy: { title: 'asc' },
      take: 30,
      select: { ...ARTICLE_LIST_SELECT, content: true, category: { select: CATEGORY_SELECT } },
    });
  }

  async findBySlug(slug: string) {
    const article = await this.prisma.wikiArticle.findUnique({
      where: { slug },
      include: { category: { select: CATEGORY_SELECT } },
    });
    if (!article) throw new NotFoundException('Article introuvable');
    return article;
  }

  // --- Administration (staff) ---------------------------------------------

  createCategory(data: { name: string; icon?: string; order?: number }) {
    if (!data.name?.trim()) throw new BadRequestException('Nom requis');
    return this.prisma.wikiCategory.create({
      data: { name: data.name.trim(), slug: slugify(data.name), icon: data.icon || null, order: data.order ?? 0 },
    });
  }

  async updateCategory(id: string, data: { name?: string; icon?: string; order?: number }) {
    const payload: any = {};
    if (data.name?.trim()) { payload.name = data.name.trim(); payload.slug = slugify(data.name); }
    if (data.icon !== undefined) payload.icon = data.icon || null;
    if (typeof data.order === 'number') payload.order = data.order;
    if (Object.keys(payload).length === 0) throw new BadRequestException('Aucune modification');
    return this.prisma.wikiCategory.update({ where: { id }, data: payload });
  }

  deleteCategory(id: string) {
    return this.prisma.wikiCategory.delete({ where: { id } });
  }

  createArticle(data: { categoryId: string; title: string; content: string; keywords?: string; isFaq?: boolean; order?: number }) {
    if (!data.title?.trim() || !data.content?.trim() || !data.categoryId) throw new BadRequestException('Catégorie, titre et contenu requis');
    return this.prisma.wikiArticle.create({
      data: {
        categoryId: data.categoryId,
        title: data.title.trim(),
        slug: slugify(data.title),
        content: data.content,
        keywords: data.keywords || null,
        isFaq: !!data.isFaq,
        order: data.order ?? 0,
      },
    });
  }

  async updateArticle(id: string, data: { categoryId?: string; title?: string; content?: string; keywords?: string; isFaq?: boolean; order?: number }) {
    const payload: any = {};
    if (data.categoryId) payload.categoryId = data.categoryId;
    if (data.title?.trim()) { payload.title = data.title.trim(); payload.slug = slugify(data.title); }
    if (data.content?.trim()) payload.content = data.content;
    if (data.keywords !== undefined) payload.keywords = data.keywords || null;
    if (typeof data.isFaq === 'boolean') payload.isFaq = data.isFaq;
    if (typeof data.order === 'number') payload.order = data.order;
    if (Object.keys(payload).length === 0) throw new BadRequestException('Aucune modification');
    return this.prisma.wikiArticle.update({ where: { id }, data: payload });
  }

  deleteArticle(id: string) {
    return this.prisma.wikiArticle.delete({ where: { id } });
  }
}
