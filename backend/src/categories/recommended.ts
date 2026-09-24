/**
 * Arborescence de catégories recommandée pour un tracker francophone / québécois.
 * Installable en un clic depuis Administration > Catégories torrents : seules les catégories
 * absentes sont créées (rien n'est renommé ni supprimé). Les sous-catégories décrivent le TYPE de contenu ;
 * la qualité (4K, 1080p…), la source, la langue et l'origine (Québec, France…) sont des filtres, pas des catégories.
 * Les noms sont uniques sur tout le site.
 */
export interface RecommendedCategory {
  name: string;
  /** Type de contenu (recherche automatique de fiches) : FILM, SERIE, MUSIQUE, JEU, LOGICIEL, LIVRE, DOCUMENT, XXX... */
  kind?: string;
  adult?: boolean;
  children: { name: string; kind?: string }[];
}

const c = (...names: string[]) => names.map((name) => ({ name }));

/** La première sous-catégorie de chaque liste est la catégorie « générale » : elle reçoit les torrents restés dans la catégorie principale. */
export const RECOMMENDED_CATEGORIES: RecommendedCategory[] = [
  {
    name: 'Films', kind: 'FILM',
    children: c(
      'Longs métrages', "Films d'animation", 'Films jeunesse et famille', 'Documentaires', 'Courts métrages',
      'Films québécois et canadiens', 'Films français et européens', 'Films asiatiques', 'Films indépendants et d’auteur',
      'Films classiques et cinéma muet', 'Films d’horreur', 'Films de science-fiction et fantastique', 'Films 3D',
      'Collections et sagas', 'Films religieux et spirituels', 'Autres films',
    ),
  },
  {
    name: 'Séries TV', kind: 'SERIE',
    children: c(
      'Séries télé', "Séries d'animation", 'Séries jeunesse', 'Documentaires TV', 'Émissions et téléréalité',
      'Talk-shows et variétés', 'Séries québécoises', 'Séries françaises et européennes', 'Séries asiatiques et K-Drama',
      'Téléromans et feuilletons', 'Mini-séries et téléfilms', 'Actualités et magazines télé', 'Cuisine, maison et style de vie',
      'Séries de sport et docu-sportifs', 'Autres séries',
    ),
  },
  {
    name: 'Animes', kind: 'SERIE',
    children: [
      { name: 'Animes séries' },
      { name: 'Animes films', kind: 'FILM' },
      { name: 'Animes OAV et spéciaux' },
      { name: 'Animes VF et VOSTFR (packs complets)' },
      { name: 'Donghua (animation chinoise)' },
      { name: 'Autres animes' },
    ],
  },
  {
    name: 'Spectacles et humour',
    children: [
      { name: 'Humour et one-man-shows' },
      { name: 'Gala Juste pour rire et festivals d’humour' },
      { name: 'Concerts et festivals', kind: 'MUSIQUE' },
      { name: 'Théâtre et spectacles' },
      { name: 'Opéra, ballet et danse' },
      { name: 'Cirque et spectacles vivants' },
      { name: 'Magie et variétés' },
      { name: 'Conférences et TED' },
      { name: 'Autres spectacles' },
    ],
  },
  {
    name: 'Sports',
    children: c(
      'Hockey', 'Football / Soccer', 'Basketball', 'Baseball', 'Football américain', 'Formule 1 et sports moteurs',
      'UFC et sports de combat', 'Boxe et lutte (WWE, AEW)', 'Tennis et golf', 'Cyclisme et athlétisme',
      'Sports d’hiver et olympiques', 'Rugby et cricket', 'Sports extrêmes et plein air', 'Documentaires sportifs',
      'Autres sports',
    ),
  },
  {
    name: 'Musique', kind: 'MUSIQUE',
    children: c(
      'Albums', 'Discographies', 'Compilations et singles', 'Bandes originales', 'Clips et vidéos musicales',
      'Musique québécoise', 'Musique française', 'Rock et métal', 'Pop et variétés', 'Hip-hop et R&B',
      'Électronique et dance', 'Jazz et blues', 'Classique et opéra', 'Country et folk', 'Musique du monde et latine',
      'Musique pour enfants', 'Mix et sets DJ', 'Partitions et karaoké', 'Autres musiques',
    ),
  },
  {
    name: 'Jeux', kind: 'JEU',
    children: c(
      'Jeux PC', 'Jeux PlayStation', 'Jeux Xbox', 'Jeux Nintendo', 'Jeux mobiles', 'Rétro et émulation',
      'Mises à jour et DLC', 'Jeux de réalité virtuelle', 'Jeux indépendants', 'Jeux Mac et Linux',
      'Bandes originales de jeux', 'Guides, cheats et mods', 'Autres jeux',
    ),
  },
  {
    name: 'Applications', kind: 'LOGICIEL',
    children: c(
      'Logiciels Windows', 'Logiciels macOS', 'Logiciels Linux', 'Applications Android', 'Applications iOS',
      'Création et multimédia', 'Utilitaires et sécurité', 'Outils de développement', 'Bureautique et productivité',
      'Systèmes d’exploitation', 'Montage vidéo et audio', 'Photo et graphisme', 'Modélisation 3D et CAO',
      'Pilotes et firmwares', 'Plugins et banques de sons', 'Autres applications',
    ),
  },
  {
    name: 'Livres', kind: 'LIVRE',
    children: c(
      'Livres numériques', 'Livres audio', 'Bandes dessinées et comics', 'Mangas', 'Magazines et journaux',
      'Manuels et références', 'Romans et littérature', 'Livres jeunesse', 'Cuisine et santé',
      'Histoire, sciences et documentaires', 'Livres québécois', 'Encyclopédies et dictionnaires', 'Autres livres',
    ),
  },
  {
    name: 'Formations et cours', kind: 'DOCUMENT',
    children: c(
      'Formations vidéo', 'Cours de langues', 'Tutoriels', 'Informatique et programmation', 'Design et création',
      'Affaires et finance', 'Musique et instruments', 'Cuisine et bricolage', 'Autres formations',
    ),
  },
  {
    name: 'Autres',
    children: c(
      'Divers', "Images et fonds d'écran", 'Podcasts et radio', 'Polices et ressources graphiques', 'Cartes et GPS',
      'Sous-titres', 'Modèles 3D et impression 3D',
    ),
  },
  {
    name: 'XXX', kind: 'XXX', adult: true,
    children: c(
      'XXX Films', 'XXX Scènes', 'XXX Séries web', 'XXX Amateur', 'XXX Hentai et animation', 'XXX Photos et magazines',
      'XXX Jeux', 'XXX Vidéos VR', 'XXX Compilations', 'XXX Autres',
    ),
  },
];

/**
 * Sous-catégories d'une première version de l'arborescence recommandée, qui mélangeaient qualité / origine / langue
 * avec les types de contenu. Ce sont des filtres : elles sont fusionnées dans leur catégorie principale, et la valeur
 * correspondante est reportée sur les torrents (sans jamais écraser un champ déjà rempli).
 */
export const LEGACY_FACET_CATEGORIES: { name: string; parent: string; set?: Partial<Record<'resolution' | 'source' | 'origin' | 'language' | 'audio', string>> }[] = [
  { name: 'Films HD', parent: 'Films' },
  { name: 'Films 4K UHD', parent: 'Films', set: { resolution: '4K/2160p' } },
  { name: 'Films Remux / Blu-ray', parent: 'Films', set: { source: 'BluRay' } },
  { name: 'Films SD / DVDRip', parent: 'Films', set: { resolution: '480p' } },
  { name: 'Films 3D', parent: 'Films' },
  { name: 'Films québécois', parent: 'Films', set: { origin: 'Québec' } },
  { name: 'Films français', parent: 'Films', set: { origin: 'France' } },
  { name: 'Séries HD', parent: 'Séries TV' },
  { name: 'Séries 4K UHD', parent: 'Séries TV', set: { resolution: '4K/2160p' } },
  { name: 'Séries SD', parent: 'Séries TV', set: { resolution: '480p' } },
  { name: 'Séries québécoises', parent: 'Séries TV', set: { origin: 'Québec' } },
  { name: 'Séries françaises', parent: 'Séries TV', set: { origin: 'France' } },
  { name: 'Animes VOSTFR', parent: 'Animes', set: { language: 'VOSTFR' } },
  { name: 'Animes VF', parent: 'Animes', set: { language: 'VF' } },
  { name: 'Humour québécois', parent: 'Spectacles et humour', set: { origin: 'Québec' } },
  { name: 'Humour français', parent: 'Spectacles et humour', set: { origin: 'France' } },
  { name: 'Musique MP3', parent: 'Musique', set: { audio: 'MP3' } },
  { name: 'Musique FLAC / sans perte', parent: 'Musique', set: { audio: 'FLAC' } },
  { name: 'Musique québécoise', parent: 'Musique', set: { origin: 'Québec' } },
  { name: 'Musique française', parent: 'Musique', set: { origin: 'France' } },
  { name: 'Livres québécois', parent: 'Livres', set: { origin: 'Québec' } },
];
