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

/**
 * Arborescence calquée sur celle de c411.org (Torznab). La première sous-catégorie de chaque liste est la catégorie
 * « générale » : elle reçoit les torrents restés directement dans la catégorie principale. Les noms doivent être uniques
 * sur tout le site, d'où certains préfixes (« Jeux Linux » / « Logiciels Linux »…).
 */
export const RECOMMENDED_CATEGORIES: RecommendedCategory[] = [
  {
    name: 'Films & Vidéos', kind: 'FILM',
    children: c('Film', 'Série TV', 'Animation', 'Animation Série', 'Documentaire', 'Série Documentaire', 'Émission TV', 'Spectacle', 'Concert', 'Sport', 'Vidéo-clips', 'Collection'),
  },
  {
    name: 'Ebook', kind: 'LIVRE',
    children: c('Livres', 'BDs', 'Comics', 'Manga', 'Presse', 'Livres audio', 'Partitions & Tablatures', 'Revues & Manuels techniques'),
  },
  {
    name: 'Audio', kind: 'MUSIQUE',
    children: c('Musique', 'Karaoké', 'Podcast Radio', 'Samples'),
  },
  {
    name: 'Applications', kind: 'LOGICIEL',
    children: c('Logiciels Windows', 'Logiciels MacOS', 'Logiciels Linux', 'Logiciels Smartphone', 'Logiciels Tablette', 'Formation', 'Autres logiciels'),
  },
  {
    name: 'Jeux Vidéo', kind: 'JEU',
    children: c('Jeux Windows', 'Jeux MacOS', 'Jeux Linux', 'Jeux Microsoft', 'Jeux Nintendo', 'Jeux Sony', 'Jeux Smartphone', 'Jeux Tablette', 'Jeux VR', 'Jeux Autre'),
  },
  {
    name: 'Émulation', kind: 'JEU',
    children: c('Émulateur', 'ROM/ISO'),
  },
  {
    name: 'GPS', kind: 'LOGICIEL',
    children: c('GPS Applications', 'GPS Cartes', 'GPS Divers'),
  },
  {
    name: 'Nulled', kind: 'LOGICIEL',
    children: c('Scripts PHP & CMS', 'Wordpress', 'Nulled Mobile', 'Nulled Divers'),
  },
  {
    name: 'Imprimante 3D',
    children: c('Objets 3D', 'Personnages 3D', 'Packs 3D'),
  },
  {
    name: 'XXX', kind: 'XXX', adult: true,
    children: c('XXX Films', 'XXX Hentai', 'XXX Images', 'XXX Jeux', 'XXX Ebooks', 'XXX VR'),
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
