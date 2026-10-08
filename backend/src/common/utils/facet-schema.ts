/**
 * Filtres propres à chaque catégorie (format audio, genre de jeu, console, dynamic range...). Les valeurs d'un torrent sont
 * rangées dans `Torrent.attrs` ({ clé: [valeurs] }), remplies automatiquement à l'envoi (voir attr-detect.ts) et proposées
 * en filtre sur Parcourir seulement quand au moins un résultat affiché les porte.
 *
 * Les listes de valeurs s'inspirent des filtres de C411 ; l'ordre des tableaux est l'ordre d'affichage.
 */
export interface FacetDef {
  key: string;
  label: string;
  /** Plusieurs valeurs possibles sur un même torrent (genres, formats de fichiers...). */
  multi: boolean;
  options: string[];
}

const def = (key: string, label: string, multi: boolean, options: string[]): FacetDef => ({ key, label, multi, options });

const GENRES_EBOOK = [
  'Action/Aventure', 'Adaptation', 'Adulte', 'Art/Design', 'Aventure', 'Biographie', 'Carnet de bord', 'Chronique sociale', 'Classique', 'Conte', 'Contemporain',
  'Cuisine', 'Développement personnel', 'Documentaire', 'Drame', 'Éducation', 'Enfants', 'Ero-Guro', 'Érotique', 'Ésotérisme', 'Essai', 'Fantastique', 'Fantasy',
  'Formation', 'Guerre', 'Heroic Fantasy', 'Histoire', 'Horreur', 'Humour', 'Humour noir', 'Informatique', 'Jeunesse', "Livre d'art", 'Musique', 'Philosophie',
  'Policier/Thriller', 'Politique', 'Résistance', 'Romance', 'Science', 'Science-Fiction', 'Société', 'Sport', 'Super-héros', 'Théâtre', 'Thriller', 'Uchronie',
  'Underground', 'Voyage', 'Western',
];

export const FACETS: Record<string, FacetDef> = Object.fromEntries([
  // Films & séries (en plus des champs déjà existants : résolution, source, langue, codec, audio, genres...)
  def('hdrFormat', 'Plage dynamique', true, ['SDR', 'HDR10', 'HDR10+', 'Dolby Vision', 'DV+HDR10', 'DV+HDR10+']),
  def('channels', 'Canaux', true, ['7.1', '5.1', '2.0', '1.0']),
  def('audioQuality', 'Qualité audio', true, ['Lossless', 'Lossy']),
  def('serieType', 'Série', false, ['Intégrale', 'Saison', 'Épisode']),

  // Ebook
  def('formatFichier', 'Format fichier', true, ['AZW', 'CB7', 'CBA', 'CBR', 'CBT', 'CBZ', 'DJVU', 'DOC', 'EPUB', 'JPG', 'MOBI', 'PDF', 'PNG', 'PRC', 'Guitar Pro', 'MuseScore', 'MusicXML']),
  def('langueEbook', 'Langue ebook', true, ['Anglais', 'Français', 'Japonais', 'Multi (Français inclus)']),
  def('genreEbook', 'Genre ebook', true, GENRES_EBOOK),
  def('styleLitteraire', 'Style littéraire', true, ['Artbook', 'Light novel', 'Roman graphique']),
  def('demographique', 'Démographique', true, ['Josei', 'Seinen', 'Shojo', 'Shonen']),
  def('formatAudio', 'Format audio', true, ['MP3', 'M4A/AAC', 'M4B', 'FLAC', 'OGG', 'WMA']),
  def('typeAudio', 'Type audio', false, ['Livre audio', 'Cours/Formation', 'Documentaire', 'Pièce de théâtre', 'Radio']),
  def('genreAudioEbook', 'Genre audio ebook', true, ['Action/Aventure', 'Biographie', 'Comédie', 'Documentaire', 'Drame', 'Enfants', 'Fantastique', 'Histoire', 'Horreur', 'Policier/Thriller', 'Romance', 'Science-Fiction', 'Développement personnel']),

  // Audio
  def('formatMusique', 'Format musique', true, [
    'AAC (M4A)', 'AC3', 'AIF', 'ALAC (M4A)', 'BluRay Pure Audio', 'DSD', 'DTS', 'FLAC (16 bit)', 'FLAC (24 bit)', "Monkey's Audio", 'MP3', 'MPC', 'OGG', 'Samples', 'WAV', 'WavPack', 'WMA',
  ]),
  def('qualiteMusique', 'Qualité musique', false, ['BluRay Audio', 'CD', 'SACD', 'Vinyle', 'Web']),
  def('typeMusique', 'Type musique', false, ['Album', 'Bande originale de film/jeu', 'Discographie', 'EP', 'Intégrale/Coffret', 'Live/Concert', 'Mix/Medley', 'Piste audio de film', 'Radio']),
  def('genreMusique', 'Genre musique', true, [
    'Ambient', 'Blues', 'Classique', 'Country', 'Dance/Electro', 'Drum & Bass', 'Dubstep', 'Folk', 'Funk', 'Gospel', 'Hard Rock', 'Hip-Hop/Rap', 'House', 'Jazz', 'K-Pop', 'Latino', 'Métal',
    'Musique de film', 'Musique du monde', 'Pop', 'Punk', 'R&B/Soul', 'Reggae', 'Rock', 'Techno', 'Trance', 'Variété française', 'Variété internationale',
  ]),
  def('formatSamples', 'Format samples', true, ['WAV', 'AIFF', 'MP3', 'REX', 'MIDI', 'Multi-format']),
  def('genreSamples', 'Genre samples', true, [
    'Ambient', 'Bass', 'Cinematic', 'Drum & Bass', 'Drums/Percussion', 'Dubstep', 'EDM', 'FX/SFX', 'Hip-Hop', 'House', 'Jazz', 'Lo-Fi', 'Loops', 'Orchestral', 'Pop', 'R&B', 'Rock', 'Synth', 'Techno', 'Trap', 'Vocals',
  ]),
  def('formatPodcast', 'Format podcast', true, ['MP3', 'M4A/AAC', 'OGG', 'FLAC']),
  def('genrePodcast', 'Genre podcast', true, [
    'Actualités', 'Arts', 'Business', 'Comédie', 'Culture', 'Éducation', 'Fiction', 'Gaming', 'Histoire', 'Musique', 'Politique', 'Santé', 'Science', 'Société', 'Sport', 'Technologie', 'True Crime', 'Voyage',
  ]),

  // Applications
  def('systemeMobile', 'Système mobile', true, ['Android', 'Bada', 'iOS', 'MeeGo', 'RIM', 'Symbian', 'WebOS', 'Windows Mobile', 'Windows RT']),
  def('genreApplications', 'Genre applications', true, [
    'Accessibilité', 'Administration', 'Agenda', 'Album et visionneuse', 'Animation 2D et 3D', 'Antivirus', 'Architecture', 'Audio', 'Bureautique', 'CAO et PAO', 'Compression', 'Cryptage et sécurité',
    'Développement', 'Développement web', 'Éducation et scolarité', 'Firewall', 'Graphisme', 'Gravure', 'Lecteur multimédia', 'Musique', 'Nettoyage et optimisation', 'Photographie', 'Réseau', 'Sauvegarde',
    'Système', "Système d'exploitation", 'Utilitaire', 'Vidéo',
  ]),

  // Jeux
  def('genreJeux', 'Genre jeux', true, [
    'Action', 'Aventure', "Beat'em all", 'City builder', 'Combat', 'Course', 'Crack', 'DLC', 'Éducatif', 'Flipper', 'FPS', 'Gestion', "Hack'n Slash", 'Infiltration', 'Jeu de rôle', 'Ludo-éducatif', 'MMO',
    'Objets cachés', 'Party game', 'Plates-formes', "Point'n'click", 'Puzzle-game', 'Réflexion', 'Roguelike', 'Rythme', "Shoot'em up", 'Simulation', 'Sport', 'Stratégie', 'Survival-horror', 'Tactique',
    'Tower defense', 'TPS', 'Update', 'Visual novel', 'Wargame',
  ]),
  def('consoleMicrosoft', 'Console Microsoft', true, ['Xbox', 'Xbox 360', 'Xbox One', 'Xbox Series X/S']),
  def('consoleNintendo', 'Console Nintendo', true, ['3DS', 'DS', 'GameCube', 'Switch', 'Switch 2', 'Wii', 'WiiU', 'Game Boy / GBA', 'N64', 'NES', 'SNES']),
  def('consoleSony', 'Console Sony', true, ['PlayStation', 'PlayStation 2', 'PlayStation 3', 'PlayStation 4', 'PlayStation 5', 'PSP', 'Vita']),

  // Autres catégories (valeurs proposées par Seeduction, à ajuster)
  def('gpsMarque', 'Marque / logiciel', true, ['Garmin', 'TomTom', 'Sygic', 'iGO', 'Navigon', 'Becker', 'Waze', 'Mappy', 'Android Auto', 'CarPlay', 'Autre']),
  def('nulledType', 'Type de ressource', true, ['Plugin', 'Thème', 'Template', 'Script', 'Module', 'Application']),
  def('cms', 'CMS / plateforme', true, ['WordPress', 'Joomla', 'Drupal', 'PrestaShop', 'Magento', 'OpenCart', 'Shopify', 'Laravel', 'WooCommerce', 'Autre']),
  def('format3d', 'Format 3D', true, ['STL', 'OBJ', '3MF', 'STEP', 'GCODE', 'AMF', 'FBX', 'BLEND']),
  def('techno3d', 'Technologie', true, ['FDM', 'Résine (SLA)']),
].map((f) => [f.key, f]));

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const SERIES_LEAVES = ['serie tv', 'animation serie', 'serie documentaire', 'emission tv'];

/** Filtres applicables à une catégorie : `top` = catégorie principale, `leaf` = sa sous-catégorie (ou la même si elle n'en a pas). */
export function facetKeysFor(top: string, leaf: string): string[] {
  const t = strip(top);
  const l = strip(leaf);
  if (t === 'films videos' || t === 'films & videos' || t.startsWith('films')) return ['hdrFormat', 'channels', 'audioQuality', ...(SERIES_LEAVES.includes(l) ? ['serieType'] : [])];
  if (t === 'ebook') {
    if (l === 'livres audio') return ['formatAudio', 'typeAudio', 'langueEbook', 'genreAudioEbook'];
    if (['bds', 'comics', 'manga'].includes(l)) return ['formatFichier', 'langueEbook', 'genreEbook', 'styleLitteraire', 'demographique'];
    if (l === 'partitions tablatures') return ['formatFichier'];
    return ['formatFichier', 'langueEbook', 'genreEbook'];
  }
  if (t === 'audio') {
    if (l === 'podcast radio') return ['formatPodcast', 'genrePodcast'];
    if (l === 'samples') return ['formatSamples', 'genreSamples'];
    if (l === 'karaoke') return ['formatMusique'];
    return ['formatMusique', 'qualiteMusique', 'typeMusique', 'genreMusique'];
  }
  if (t === 'applications') return [...(l.includes('smartphone') || l.includes('tablette') ? ['systemeMobile'] : []), 'genreApplications'];
  if (t === 'jeux video') {
    const extra = l.includes('microsoft') ? ['consoleMicrosoft'] : l.includes('nintendo') ? ['consoleNintendo'] : l.includes('sony') ? ['consoleSony']
      : l.includes('smartphone') || l.includes('tablette') ? ['systemeMobile'] : l.includes('autre') ? ['consoleMicrosoft', 'consoleNintendo', 'consoleSony'] : [];
    return ['genreJeux', ...extra];
  }
  if (t === 'emulation') return l === 'rom iso' ? ['consoleMicrosoft', 'consoleNintendo', 'consoleSony'] : [];
  if (t === 'gps') return ['gpsMarque'];
  if (t === 'nulled') return ['nulledType', 'cms'];
  if (t === 'imprimante 3d') return ['format3d', 'techno3d'];
  return [];
}

/** Ne garde que les clés connues et leurs valeurs autorisées (et une seule valeur pour un filtre à choix unique). */
export function normalizeAttrs(input: unknown, allowedKeys?: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!input || typeof input !== 'object') return out;
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    const facet = FACETS[key];
    if (!facet || (allowedKeys && !allowedKeys.includes(key))) continue;
    const list = (Array.isArray(raw) ? raw : [raw]).map(String);
    const values = facet.options.filter((o) => list.some((v) => v.toLowerCase() === o.toLowerCase()));
    if (values.length) out[key] = facet.multi ? values : values.slice(0, 1);
  }
  return out;
}
