/**
 * Arborescence de catégories recommandée pour un tracker francophone / québécois.
 * Installable en un clic depuis Administration > Catégories torrents : seules les catégories
 * absentes sont créées (rien n'est renommé ni supprimé). Les noms sont uniques sur tout le site,
 * d'où des sous-catégories aux noms explicites (« Films HD », « Séries HD »…).
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
      { name: 'Films HD' },
      { name: 'Films 4K UHD' },
      { name: 'Films Remux / Blu-ray' },
      { name: 'Films SD / DVDRip' },
      { name: 'Films 3D' },
      { name: 'Films québécois' },
      { name: 'Films français' },
      { name: "Films d'animation" },
      { name: 'Documentaires' },
    ],
  },
  {
    name: 'Séries TV', kind: 'SERIE',
    children: [
      { name: 'Séries HD' },
      { name: 'Séries 4K UHD' },
      { name: 'Séries SD' },
      { name: 'Séries québécoises' },
      { name: 'Séries françaises' },
      { name: "Séries d'animation" },
      { name: 'Émissions et téléréalité' },
      { name: 'Documentaires TV' },
      { name: 'Talk-shows et variétés' },
    ],
  },
  {
    name: 'Animes', kind: 'SERIE',
    children: [
      { name: 'Animes VOSTFR' },
      { name: 'Animes VF' },
      { name: 'Animes films', kind: 'FILM' },
      { name: 'Animes OAV et spéciaux' },
    ],
  },
  {
    name: 'Jeunesse', kind: 'SERIE',
    children: [
      { name: 'Séries jeunesse' },
      { name: 'Films jeunesse', kind: 'FILM' },
    ],
  },
  {
    name: 'Spectacles et humour',
    children: [
      { name: 'Humour québécois' },
      { name: 'Humour français' },
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
      { name: 'Musique MP3' },
      { name: 'Musique FLAC / sans perte' },
      { name: 'Musique québécoise' },
      { name: 'Musique française' },
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
      { name: 'Livres québécois' },
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
      { name: 'Images et fonds d\'écran' },
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
