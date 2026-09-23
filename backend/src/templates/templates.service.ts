import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { extractVariables, fillVariables, pruneEmptyLines, renderAllFormats } from '../common/utils/bbcode';

// Modèles d'origine (avant le thème doré) : servent uniquement à reconnaître un
// modèle par défaut resté intact, pour le mettre à jour sans écraser ceux qu'un admin a modifiés.
const LEGACY_FILM_SERIE = `[center][size=6][b]{titre}[/b][/size][/center]

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

const LEGACY_MUSIQUE = `[center][size=6][b]{titre}[/b][/size][/center]

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

const LEGACY_GENERIC = `[center][size=6][b]{titre}[/b][/size][/center]

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

const LEGACY_PERSONNALISE = `[b]{titre}[/b]\n\n{description}`;

// Thème par défaut : titres et sections en or, intitulés en or atténué, valeurs
// en texte normal, blocs centrés dont les lignes restent alignées entre elles.
// Les lignes dont la valeur est vide sont retirées à la génération (pruneEmptyLines).
const TITLE = '[size=6][b][color=#e0b84a]{titre}[/color][/b][/size]';
const H = (name: string) => `[b][color=#e0b84a]${name}[/color][/b]`;
const L = (label: string, variable: string) => `[color=#a89253]${label} :[/color] {${variable}}`;

const V1_FILM_SERIE = [
  TITLE,
  '',
  H('Informations'),
  '[block]',
  L('Année', 'année'),
  L('Catégorie', 'catégorie'),
  L('Genre', 'genre'),
  L('Taille', 'taille'),
  L('Fichiers', 'nb_fichiers'),
  L('Langue', 'langue'),
  '[/block]',
  '',
  H('Spécifications'),
  '[block]',
  L('Vidéo', 'vidéo'),
  L('Audio', 'audio'),
  L('Source', 'source'),
  L('Format', 'format'),
  L('Sous-titres', 'sous_titres'),
  '[/block]',
  '',
  H('Synopsis'),
  '{description}',
  '',
  H('Contenu'),
  '[block]',
  '{fichiers}',
  '[/block]',
  '',
  H('Notes'),
  '{notes}',
].join('\n');

const V1_MUSIQUE = [
  TITLE,
  '',
  H('Informations'),
  '[block]',
  L('Artiste', 'artiste'),
  L('Année', 'année'),
  L('Genre', 'genre'),
  L('Catégorie', 'catégorie'),
  L('Taille', 'taille'),
  L('Fichiers', 'nb_fichiers'),
  L('Format', 'format'),
  '[/block]',
  '',
  H('Tracklist'),
  '[block]',
  '{fichiers}',
  '[/block]',
  '',
  H('Description'),
  '{description}',
].join('\n');

const V1_GENERIC = [
  TITLE,
  '',
  H('Informations'),
  '[block]',
  L('Catégorie', 'catégorie'),
  L('Taille', 'taille'),
  L('Fichiers', 'nb_fichiers'),
  L('Format', 'format'),
  L('Auteur', 'auteur'),
  '[/block]',
  '',
  H('Contenu'),
  '[block]',
  '{fichiers}',
  '[/block]',
  '',
  H('Description'),
  '{description}',
  '',
  H('Notes'),
  '{notes}',
].join('\n');

const FILM_SERIE_TEMPLATE = [
  TITLE,
  '',
  H('Informations'),
  '[block]',
  L('Titre original', 'titre_original'),
  L('Année', 'année'),
  L('Genre', 'genre'),
  L('Durée', 'durée'),
  L('Note', 'note'),
  L('Catégorie', 'catégorie'),
  L('Taille', 'taille'),
  L('Fichiers', 'nb_fichiers'),
  L('Langue', 'langue'),
  '[/block]',
  '',
  H('Équipe'),
  '[block]',
  L('Réalisation', 'réalisateur'),
  L('Acteurs', 'acteurs'),
  L('Studio', 'studio'),
  '[/block]',
  '',
  H('Spécifications'),
  '[block]',
  L('Vidéo', 'vidéo'),
  L('Audio', 'audio'),
  L('Source', 'source'),
  L('Format', 'format'),
  L('Sous-titres', 'sous_titres'),
  '[/block]',
  '',
  H('Synopsis'),
  '{description}',
  '',
  H('Contenu'),
  '{fichiers}',
  '',
  H('Notes'),
  '{notes}',
].join('\n');

const MUSIQUE_TEMPLATE = [
  TITLE,
  '',
  H('Informations'),
  '[block]',
  L('Artiste', 'artiste'),
  L('Label', 'label'),
  L('Année', 'année'),
  L('Genre', 'genre'),
  L('Durée', 'durée'),
  L('Catégorie', 'catégorie'),
  L('Taille', 'taille'),
  L('Fichiers', 'nb_fichiers'),
  L('Format', 'format'),
  '[/block]',
  '',
  H('Tracklist'),
  '{fichiers}',
  '',
  H('Description'),
  '{description}',
].join('\n');

const GENERIC_TEMPLATE = [
  TITLE,
  '',
  H('Informations'),
  '[block]',
  L('Année', 'année'),
  L('Genre', 'genre'),
  L('Auteur', 'auteur'),
  L('Développeur', 'développeur'),
  L('Éditeur', 'éditeur'),
  L('Plateformes', 'plateformes'),
  L('Pages', 'pages'),
  L('Note', 'note'),
  L('Catégorie', 'catégorie'),
  L('Taille', 'taille'),
  L('Fichiers', 'nb_fichiers'),
  L('Format', 'format'),
  '[/block]',
  '',
  H('Contenu'),
  '{fichiers}',
  '',
  H('Description'),
  '{description}',
  '',
  H('Notes'),
  '{notes}',
].join('\n');

const PERSONNALISE_TEMPLATE = `${TITLE}\n\n{description}`;

const DEFAULT_TEMPLATES: { name: string; kind: string; content: string; legacy: string[] }[] = [
  { name: 'Film (par défaut)', kind: 'FILM', content: FILM_SERIE_TEMPLATE, legacy: [LEGACY_FILM_SERIE, V1_FILM_SERIE] },
  { name: 'Série (par défaut)', kind: 'SERIE', content: FILM_SERIE_TEMPLATE, legacy: [LEGACY_FILM_SERIE, V1_FILM_SERIE] },
  { name: 'XXX (par défaut)', kind: 'XXX', content: FILM_SERIE_TEMPLATE, legacy: [] },
  { name: 'Musique (par défaut)', kind: 'MUSIQUE', content: MUSIQUE_TEMPLATE, legacy: [LEGACY_MUSIQUE, V1_MUSIQUE] },
  { name: 'Jeu (par défaut)', kind: 'JEU', content: GENERIC_TEMPLATE, legacy: [LEGACY_GENERIC, V1_GENERIC] },
  { name: 'Logiciel (par défaut)', kind: 'LOGICIEL', content: GENERIC_TEMPLATE, legacy: [LEGACY_GENERIC, V1_GENERIC] },
  { name: 'Livre (par défaut)', kind: 'LIVRE', content: GENERIC_TEMPLATE, legacy: [LEGACY_GENERIC, V1_GENERIC] },
  { name: 'Document (par défaut)', kind: 'DOCUMENT', content: GENERIC_TEMPLATE, legacy: [LEGACY_GENERIC, V1_GENERIC] },
  { name: 'Archive (par défaut)', kind: 'ARCHIVE', content: GENERIC_TEMPLATE, legacy: [LEGACY_GENERIC, V1_GENERIC] },
  { name: 'Personnalisé (vierge)', kind: 'PERSONNALISE', content: PERSONNALISE_TEMPLATE, legacy: [LEGACY_PERSONNALISE] },
];

@Injectable()
export class TemplatesService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    const count = await this.prisma.descriptionTemplate.count({ where: { isGlobal: true } });
    if (count === 0) {
      await this.prisma.descriptionTemplate.createMany({
        data: DEFAULT_TEMPLATES.map(({ legacy, ...t }) => ({ ...t, kind: t.kind as any, isGlobal: true })),
      });
      return;
    }
    // Met à jour vers le nouveau thème les modèles par défaut restés strictement intacts
    // (ceux qu'un admin a modifiés ne sont jamais touchés).
    for (const t of DEFAULT_TEMPLATES) {
      await this.prisma.descriptionTemplate.updateMany({
        where: { isGlobal: true, name: t.name, content: { in: t.legacy } },
        data: { content: t.content },
      });
    }
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
    const filled = fillVariables(pruneEmptyLines(content, params.values), params.values);
    const missingVariables = extractVariables(content).filter((v) => !params.values[v]?.trim());
    return { ...renderAllFormats(filled), missingVariables };
  }
}
