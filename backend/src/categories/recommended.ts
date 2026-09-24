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

export const RECOMMENDED_CATEGORIES: RecommendedCategory[] = [
  {
    name: 'Films', kind: 'FILM',
    children: [
      { name: "Films d'animation" },
      { name: 'Films jeunesse' },
      { name: 'Documentaires' },
      { name: 'Courts métrages' },
    ],
  },
  {
    name: 'Séries TV', kind: 'SERIE',
    children: [
      { name: "Séries d'animation" },
      { name: 'Séries jeunesse' },
      { name: 'Documentaires TV' },
      { name: 'Émissions et téléréalité' },
      { name: 'Talk-shows et variétés' },
    ],
  },
  {
    name: 'Animes', kind: 'SERIE',
    children: [
      { name: 'Animes films', kind: 'FILM' },
      { name: 'Animes OAV et spéciaux' },
    ],
  },
  {
    name: 'Spectacles et humour',
    children: [
      { name: 'Humour' },
      { name: 'Concerts et festivals', kind: 'MUSIQUE' },
      { name: 'Théâtre et spectacles' },
    ],
  },
  {
    name: 'Sports',
    children: [
      { name: 'Hockey' },
      { name: 'Football / Soccer' },
      { name: 'Basketball' },
      { name: 'Baseball' },
      { name: 'Football américain' },
      { name: 'Formule 1 et sports moteurs' },
      { name: 'UFC et sports de combat' },
      { name: 'Autres sports' },
    ],
  },
  {
    name: 'Musique', kind: 'MUSIQUE',
    children: [
      { name: 'Bandes originales' },
      { name: 'Discographies' },
      { name: 'Compilations et singles' },
      { name: 'Clips et vidéos musicales' },
    ],
  },
  {
    name: 'Jeux', kind: 'JEU',
    children: [
      { name: 'Jeux PC' },
      { name: 'Jeux PlayStation' },
      { name: 'Jeux Xbox' },
      { name: 'Jeux Nintendo' },
      { name: 'Jeux mobiles' },
      { name: 'Rétro et émulation' },
      { name: 'Mises à jour et DLC' },
    ],
  },
  {
    name: 'Applications', kind: 'LOGICIEL',
    children: [
      { name: 'Logiciels Windows' },
      { name: 'Logiciels macOS' },
      { name: 'Logiciels Linux' },
      { name: 'Applications Android' },
      { name: 'Applications iOS' },
      { name: 'Création et multimédia' },
      { name: 'Utilitaires et sécurité' },
      { name: 'Outils de développement' },
    ],
  },
  {
    name: 'Livres', kind: 'LIVRE',
    children: [
      { name: 'Livres numériques' },
      { name: 'Livres audio' },
      { name: 'Bandes dessinées et comics' },
      { name: 'Mangas' },
      { name: 'Magazines et journaux' },
      { name: 'Manuels et références' },
    ],
  },
  {
    name: 'Formations et cours', kind: 'DOCUMENT',
    children: [
      { name: 'Formations vidéo' },
      { name: 'Cours de langues' },
      { name: 'Tutoriels' },
    ],
  },
  {
    name: 'Autres',
    children: [
      { name: "Images et fonds d'écran" },
      { name: 'Podcasts et radio' },
      { name: 'Divers' },
    ],
  },
  {
    name: 'XXX', kind: 'XXX', adult: true,
    children: [
      { name: 'XXX Films' },
      { name: 'XXX Scènes' },
      { name: 'XXX Séries web' },
      { name: 'XXX Amateur' },
      { name: 'XXX Hentai et animation' },
      { name: 'XXX Photos et magazines' },
      { name: 'XXX Jeux' },
    ],
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
