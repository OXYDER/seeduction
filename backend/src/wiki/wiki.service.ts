import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { WIKI_SEED } from './wiki-seed';

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
   * Peuple le wiki avec le contenu de départ (voir wiki-seed.ts) : tout au premier démarrage, puis à chaque démarrage
   * seulement les articles du fichier qui n'existent pas encore (repérés par leur slug) — c'est ce qui fait apparaître
   * automatiquement la documentation d'une nouvelle fonctionnalité après un déploiement, sans jamais écraser un
   * article déjà là (donc les retouches du staff sont conservées). Pour retirer définitivement un article du seed,
   * le supprimer aussi de wiki-seed.ts, sinon il revient au prochain démarrage.
   */
  async onModuleInit() {
    for (let i = 0; i < WIKI_SEED.length; i++) {
      const cat = WIKI_SEED[i];
      let category = await this.prisma.wikiCategory.findUnique({ where: { slug: cat.slug } });
      if (!category) {
        category = await this.prisma.wikiCategory.create({ data: { name: cat.name, slug: cat.slug, icon: cat.icon, order: i } });
      }
      const existing = new Set((await this.prisma.wikiArticle.findMany({ where: { categoryId: category.id }, select: { slug: true } })).map((a) => a.slug));
      const missing = cat.articles.map((a, j) => ({ a, j })).filter(({ a }) => !existing.has(a.slug));
      for (const { a, j } of missing) {
        // Même slug ailleurs (article déplacé vers une autre catégorie par le staff) : on ne le recrée pas.
        if (await this.prisma.wikiArticle.findUnique({ where: { slug: a.slug }, select: { id: true } })) continue;
        await this.prisma.wikiArticle.create({
          data: { categoryId: category.id, title: a.title, slug: a.slug, content: a.content, keywords: a.keywords, isFaq: !!a.isFaq, order: j },
        });
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
