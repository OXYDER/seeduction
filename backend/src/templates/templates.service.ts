import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { extractVariables, fillVariables, renderAllFormats } from '../common/utils/bbcode';

const FILM_SERIE_TEMPLATE = `[center][size=6][b]{titre}[/b][/size][/center]

[b]Informations[/b]
• Année : {année}
• Catégorie : {catégorie}
• Taille : {taille}
• Langue : {langue}

[b]Spécifications[/b]
• Vidéo : {vidéo}
• Audio : {audio}
• Source : {source}
• Sous-titres : {sous_titres}

[b]Contenu[/b]
{fichiers}

[b]Description[/b]
{description}

[b]Notes[/b]
{notes}`;

const MUSIQUE_TEMPLATE = `[center][size=6][b]{titre}[/b][/size][/center]

[b]Informations[/b]
• Artiste : {artiste}
• Album : {titre}
• Année : {année}
• Genre : {genre}
• Catégorie : {catégorie}
• Taille : {taille}

[b]Tracklist[/b]
{fichiers}

[b]Description[/b]
{description}`;

const GENERIC_TEMPLATE = `[center][size=6][b]{titre}[/b][/size][/center]

[b]Informations[/b]
• Catégorie : {catégorie}
• Taille : {taille}
• Auteur : {auteur}

[b]Contenu[/b]
{fichiers}

[b]Description[/b]
{description}

[b]Notes[/b]
{notes}`;

const DEFAULT_TEMPLATES: { name: string; kind: string; content: string }[] = [
  { name: 'Film (par défaut)', kind: 'FILM', content: FILM_SERIE_TEMPLATE },
  { name: 'Série (par défaut)', kind: 'SERIE', content: FILM_SERIE_TEMPLATE },
  { name: 'Musique (par défaut)', kind: 'MUSIQUE', content: MUSIQUE_TEMPLATE },
  { name: 'Jeu (par défaut)', kind: 'JEU', content: GENERIC_TEMPLATE },
  { name: 'Logiciel (par défaut)', kind: 'LOGICIEL', content: GENERIC_TEMPLATE },
  { name: 'Livre (par défaut)', kind: 'LIVRE', content: GENERIC_TEMPLATE },
  { name: 'Document (par défaut)', kind: 'DOCUMENT', content: GENERIC_TEMPLATE },
  { name: 'Archive (par défaut)', kind: 'ARCHIVE', content: GENERIC_TEMPLATE },
  { name: 'Personnalisé (vierge)', kind: 'PERSONNALISE', content: `[b]{titre}[/b]\n\n{description}` },
];

@Injectable()
export class TemplatesService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    const count = await this.prisma.descriptionTemplate.count({ where: { isGlobal: true } });
    if (count > 0) return;
    await this.prisma.descriptionTemplate.createMany({
      data: DEFAULT_TEMPLATES.map((t) => ({ ...t, kind: t.kind as any, isGlobal: true })),
    });
  }

  /** Templates admin (globaux) + templates personnels de l'utilisateur connecté. */
  list(userId?: string) {
    return this.prisma.descriptionTemplate.findMany({
      where: userId ? { OR: [{ isGlobal: true }, { ownerId: userId }] } : { isGlobal: true },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const template = await this.prisma.descriptionTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Template introuvable');
    return template;
  }

  /** Variables `{xxx}` détectées dans le template, pour construire le formulaire dynamique côté client. */
  async variablesOf(id: string) {
    const template = await this.findOne(id);
    return { variables: extractVariables(template.content) };
  }

  create(userId: string, isStaff: boolean, data: { name: string; kind: string; content: string; global?: boolean }) {
    return this.prisma.descriptionTemplate.create({
      data: {
        name: data.name,
        kind: data.kind as any,
        content: data.content,
        isGlobal: isStaff && !!data.global,
        ownerId: isStaff && data.global ? null : userId,
      },
    });
  }

  async update(id: string, userId: string, isStaff: boolean, data: { name?: string; content?: string }) {
    const template = await this.findOne(id);
    if (!isStaff && template.ownerId !== userId) throw new ForbiddenException("Ce n'est pas ton template");
    if (template.isGlobal && !isStaff) throw new ForbiddenException('Seul le staff peut modifier un template global');
    return this.prisma.descriptionTemplate.update({ where: { id }, data });
  }

  async delete(id: string, userId: string, isStaff: boolean) {
    const template = await this.findOne(id);
    if (!isStaff && template.ownerId !== userId) throw new ForbiddenException("Ce n'est pas ton template");
    return this.prisma.descriptionTemplate.delete({ where: { id } });
  }

  /**
   * Étape 5-8 du générateur : remplit le template et rend les 4 formats
   * d'export. Génère toujours (mode express autorisé), mais signale les
   * variables restées vides pour que le client puisse les mettre en évidence.
   *
   * Accepte soit un templateId (contenu enregistré), soit un `content` brut
   * pour le mode expert (édition à la volée avant toute sauvegarde).
   */
  async generate(params: { templateId?: string; content?: string; values: Record<string, string> }) {
    const content = params.content ?? (params.templateId ? (await this.findOne(params.templateId)).content : '');
    if (!content) throw new BadRequestException('Aucun template ni contenu fourni');
    const filled = fillVariables(content, params.values);
    const missingVariables = extractVariables(content).filter((v) => !params.values[v]?.trim());
    return { ...renderAllFormats(filled), missingVariables };
  }
}
