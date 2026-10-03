import { FACETS, facetKeysFor, normalizeAttrs } from './facet-schema';
import { GAME_PLATFORMS, detectPlatformIds } from './game-platforms';

// Les listes de valeurs de chaque filtre (pour matchVocab), tirées du schéma pour rester synchronisées.
const FACETS_OPTIONS: Record<string, string[]> = new Proxy({} as Record<string, string[]>, { get: (_t, key: string) => FACETS[key]?.options ?? [] });

/**
 * Détection automatique des filtres d'une catégorie (voir facet-schema.ts) à partir de ce que le membre a déjà fourni :
 * nom de la release, liste des fichiers du .torrent, NFO / MediaInfo, et genres d'une fiche (TMDB, Deezer, RAWG...).
 * Rien n'est jamais inventé : une valeur absente reste simplement vide et le membre peut la choisir à la main.
 */
export interface DetectInput {
  name: string;
  files: { path: string; size?: number }[];
  nfo?: string | null;
  /** Catégorie principale et sous-catégorie (ou la même si elle n'en a pas). */
  top: string;
  leaf: string;
  /** Genres d'une fiche (texte libre, dans n'importe quelle langue). */
  metaGenres?: string[];
}

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const extOf = (p: string) => (p.includes('.') ? p.split('.').pop()!.toLowerCase() : '');

/** Associe un texte libre aux valeurs d'un vocabulaire (nom de la valeur + synonymes), mot entier seulement. */
function matchVocab(text: string, options: string[], synonyms: Record<string, string[]>): string[] {
  const hay = ` ${strip(text)} `;
  const out: string[] = [];
  for (const option of options) {
    const keys = [strip(option), ...(synonyms[option] ?? []).map(strip)].filter(Boolean);
    if (keys.some((k) => hay.includes(` ${k} `))) out.push(option);
  }
  return out;
}

const GENRE_EBOOK: Record<string, string[]> = {
  Biographie: ['biography', 'memoires', 'autobiographie'], Cuisine: ['recette', 'recettes', 'cookbook', 'patisserie'],
  'Développement personnel': ['developpement personnel', 'self help', 'coaching'], Enfants: ['enfant', 'kids', 'album jeunesse'], Jeunesse: ['jeunesse', 'young adult'],
  Fantasy: ['fantasy'], 'Heroic Fantasy': ['heroic fantasy'], Fantastique: ['fantastique'], Histoire: ['history'], Horreur: ['horror', 'epouvante'], Humour: ['humor'],
  Informatique: ['programmation', 'python', 'javascript', 'sql', 'linux', 'reseau'], 'Policier/Thriller': ['policier', 'polar', 'thriller', 'roman noir', 'enquete'],
  Romance: ['romance', 'roman d amour', 'harlequin'], 'Science-Fiction': ['science fiction', 'sci fi', 'scifi'], Science: ['sciences', 'physique', 'chimie', 'biologie', 'mathematiques'],
  'Super-héros': ['super heros', 'superheros', 'superhero', 'marvel', 'dc comics'], Western: ['western'], Guerre: ['guerre', 'war'], 'Livre d\'art': ['livre d art', 'artbook'],
  Sport: ['sports'], Voyage: ['voyages', 'guide de voyage', 'routard'], Érotique: ['erotique'], Adulte: ['adult', 'hentai'],
};
const GENRE_AUDIO_EBOOK: Record<string, string[]> = {
  'Policier/Thriller': ['policier', 'polar', 'thriller', 'roman noir'], 'Science-Fiction': ['science fiction', 'sci fi', 'scifi'], Horreur: ['horror', 'epouvante'],
  Enfants: ['enfant', 'jeunesse', 'kids'], Histoire: ['history'], 'Développement personnel': ['developpement personnel', 'coaching'],
};
const GENRE_MUSIC: Record<string, string[]> = {
  Rock: ['rock n roll', 'alternative', 'indie rock'], 'Hip-Hop/Rap': ['hip hop', 'rap', 'hiphop', 'rap hip hop'], 'Dance/Electro': ['dance', 'electro', 'electronic', 'edm', 'electronica'],
  'Variété française': ['variete francaise', 'chanson francaise', 'chanson', 'french pop'], 'Variété internationale': ['variete internationale', 'international pop'],
  'R&B/Soul': ['r b', 'rnb', 'soul', 'soul funk'], Métal: ['metal', 'heavy metal', 'death metal', 'black metal'], 'Musique de film': ['films jeux video', 'soundtrack', 'ost', 'bande originale'],
  Classique: ['classical', 'symphonie', 'opera'], 'Musique du monde': ['world', 'afro', 'musique africaine', 'musique asiatique'], 'K-Pop': ['k pop', 'kpop'], Latino: ['reggaeton', 'salsa'],
  Reggae: ['ska'], 'Drum & Bass': ['drum bass', 'dnb', 'drum n bass'],
};
const GENRE_SAMPLES: Record<string, string[]> = {
  'Drums/Percussion': ['drums', 'percussion', 'drum kit', 'drumkit'], 'FX/SFX': ['fx', 'sfx', 'sound effects'], 'Hip-Hop': ['hip hop', 'hiphop'], 'Lo-Fi': ['lo fi', 'lofi'],
  Loops: ['loop', 'loops'], Vocals: ['vocal', 'vocals', 'acapella'], Cinematic: ['cinematic', 'trailer'], Orchestral: ['orchestra', 'orchestral', 'strings'], EDM: ['edm', 'future bass'],
  'Drum & Bass': ['drum bass', 'dnb'], Synth: ['synth', 'synthwave'],
};
const GENRE_PODCAST: Record<string, string[]> = {
  Actualités: ['actualite', 'news', 'info'], Technologie: ['tech', 'technology', 'informatique'], Comédie: ['comedie', 'humour', 'comedy'], 'True Crime': ['true crime', 'faits divers', 'affaires criminelles'],
  Éducation: ['education', 'cours'], Santé: ['sante', 'health'], Histoire: ['history'], Science: ['sciences'], Gaming: ['jeux video', 'jeu video', 'video games'],
};
const GENRE_APPS: Record<string, string[]> = {
  Antivirus: ['antivirus', 'malwarebytes', 'kaspersky', 'bitdefender', 'avast', 'norton', 'eset'], Firewall: ['firewall', 'pare feu'],
  'Cryptage et sécurité': ['vpn', 'password', 'keepass', 'veracrypt', 'cryptage', 'encryption'], Bureautique: ['office', 'word', 'excel', 'powerpoint', 'libreoffice', 'acrobat', 'pdf', 'onenote', 'outlook'],
  Graphisme: ['photoshop', 'illustrator', 'affinity', 'gimp', 'coreldraw', 'inkscape', 'canva'], Photographie: ['lightroom', 'capture one', 'photo', 'topaz'],
  Vidéo: ['premiere', 'davinci', 'resolve', 'vegas', 'filmora', 'camtasia', 'handbrake', 'video editor'], 'Animation 2D et 3D': ['blender', 'maya', 'cinema 4d', '3ds max', 'after effects', 'toon boom', 'zbrush'],
  Audio: ['ableton', 'fl studio', 'cubase', 'reaper', 'audacity', 'logic pro', 'pro tools', 'vst', 'kontakt', 'izotope'], Musique: ['musique', 'music', 'itunes', 'spotify'],
  Développement: ['visual studio', 'jetbrains', 'intellij', 'pycharm', 'android studio', 'eclipse', 'xcode', 'sdk', 'compiler'], 'Développement web': ['dreamweaver', 'webstorm', 'wordpress', 'xampp', 'filezilla'],
  "Système d'exploitation": ['windows 10', 'windows 11', 'windows 7', 'ubuntu', 'linux mint', 'debian', 'fedora', 'macos', 'os x', 'iso windows'], Compression: ['winrar', '7 zip', '7zip', 'winzip', 'peazip'],
  Gravure: ['nero', 'imgburn', 'burner', 'gravure'], Sauvegarde: ['acronis', 'macrium', 'backup', 'sauvegarde', 'veeam'], 'Nettoyage et optimisation': ['ccleaner', 'cleaner', 'optimizer', 'optimisation', 'defrag'],
  'CAO et PAO': ['autocad', 'solidworks', 'fusion 360', 'indesign', 'quarkxpress', 'catia', 'inventor', 'revit', 'affinity publisher', 'cao', 'pao'], Architecture: ['sketchup', 'archicad', 'lumion', 'vray'],
  'Lecteur multimédia': ['vlc', 'plex', 'kodi', 'potplayer', 'media player', 'jellyfin'], Réseau: ['wireshark', 'putty', 'network', 'reseau', 'ftp', 'torrent client'],
  'Éducation et scolarité': ['education', 'scolaire', 'apprendre', 'langue', 'duolingo', 'rosetta'], Administration: ['comptabilite', 'facturation', 'paie', 'gestion', 'erp'], Agenda: ['agenda', 'calendar', 'calendrier'],
  Accessibilité: ['accessibilite', 'screen reader', 'nvda'], 'Album et visionneuse': ['visionneuse', 'viewer', 'irfanview', 'xnview', 'acdsee'], Utilitaire: ['utility', 'utilities', 'utilitaire', 'tool', 'tools', 'toolkit'],
};
const GENRE_GAMES: Record<string, string[]> = {
  Simulation: ['simulator', 'simulation'], Gestion: ['tycoon', 'manager', 'management'], Course: ['racing', 'rally', 'motogp', 'formula', 'forza', 'need for speed'], 'Jeu de rôle': ['rpg', 'role playing'],
  Roguelike: ['roguelike', 'rogue like', 'roguelite', 'rogue lite'], 'Visual novel': ['visual novel'], 'Tower defense': ['tower defense', 'tower defence'], 'City builder': ['city builder', 'city building'],
  Stratégie: ['strategy', 'rts', '4x'], 'Survival-horror': ['survival horror'], 'Plates-formes': ['platformer', 'platform'], Combat: ['fighting', 'fighter'], Sport: ['sports', 'football', 'fifa', 'nba', 'nhl', 'pga'],
  FPS: ['shooter', 'fps', 'first person shooter'], TPS: ['third person shooter', 'tps'], MMO: ['massively multiplayer', 'mmorpg', 'mmo'], Éducatif: ['educational'], 'Puzzle-game': ['puzzle'],
  Rythme: ['rhythm', 'music game'], Infiltration: ['stealth'], "Shoot'em up": ['shmup', 'shoot em up'], "Beat'em all": ['beat em up', 'brawler'], "Hack'n Slash": ['hack and slash', 'hack n slash'],
  DLC: ['dlc'], Update: ['update', 'patch'], Crack: ['crack', 'cracked', 'crackfix'],
};

const MOBILE: { value: string; name: RegExp; ext?: string[] }[] = [
  { value: 'Android', name: /\bandroid\b/i, ext: ['apk', 'xapk', 'apks', 'obb'] },
  { value: 'iOS', name: /\bios\b|\biphone\b|\bipad\b/i, ext: ['ipa'] },
  { value: 'Symbian', name: /symbian/i, ext: ['sis', 'sisx'] },
  { value: 'Windows Mobile', name: /windows[ ._-]?mobile|windows[ ._-]?phone/i, ext: ['xap'] },
  { value: 'Windows RT', name: /windows[ ._-]?rt\b/i },
  { value: 'RIM', name: /blackberry|\brim\b|\bbb10\b/i, ext: ['bar'] },
  { value: 'Bada', name: /\bbada\b/i },
  { value: 'MeeGo', name: /meego|maemo/i },
  { value: 'WebOS', name: /\bwebos\b/i },
];

const FILE_FORMATS: Record<string, string> = {
  azw: 'AZW', azw3: 'AZW', cb7: 'CB7', cba: 'CBA', cbr: 'CBR', cbt: 'CBT', cbz: 'CBZ', djvu: 'DJVU', djv: 'DJVU', doc: 'DOC', docx: 'DOC', epub: 'EPUB', jpg: 'JPG', jpeg: 'JPG', mobi: 'MOBI',
  pdf: 'PDF', png: 'PNG', prc: 'PRC', gp: 'Guitar Pro', gp3: 'Guitar Pro', gp4: 'Guitar Pro', gp5: 'Guitar Pro', gpx: 'Guitar Pro', mscz: 'MuseScore', mscx: 'MuseScore', musicxml: 'MusicXML', mxl: 'MusicXML',
};
const AUDIO_EXT = new Set(['mp3', 'm4a', 'm4b', 'aac', 'flac', 'ogg', 'oga', 'opus', 'wma', 'wav', 'aif', 'aiff', 'ape', 'wv', 'mpc', 'dsf', 'dff', 'dts', 'ac3', 'alac']);

const languagesOf = (name: string, nfo: string): string[] => {
  const text = `${name} ${nfo}`;
  // Codes de deux lettres : seulement entre points, tirets ou crochets (jamais le mot français « en »).
  const code = (c: string) => new RegExp(`[.\\[(_-](?:${c})(?=[.\\])_-])`, 'i').test(name);
  const word = (w: string) => new RegExp(`(?:^|[\\s._\\-\\[\\](){}])(?:${w})(?=$|[\\s._\\-\\[\\](){}])`, 'i').test(text);
  const fr = word('french|francais|français|vf|vff|vfq|truefrench|fre|fra') || code('fr');
  const en = word('english|anglais|eng') || code('en');
  const jp = word('japanese|japonais|jpn|jap') || code('jp|ja');
  if (word('multi|multilang|multilingue|multilingual') || [fr, en, jp].filter(Boolean).length >= 2) return fr || word('multi') ? ['Multi (Français inclus)'] : [en && 'Anglais', jp && 'Japonais'].filter(Boolean) as string[];
  return [fr && 'Français', en && 'Anglais', jp && 'Japonais'].filter(Boolean) as string[];
};

/** Détecte toutes les valeurs de filtres de la catégorie ; renvoie seulement celles qui ont été trouvées. */
export function detectAttrs(input: DetectInput): Record<string, string[]> {
  const allowed = facetKeysFor(input.top, input.leaf);
  if (allowed.length === 0) return {};
  const files = (input.files ?? []).slice(0, 400);
  const nfo = (input.nfo ?? '').slice(0, 100_000);
  const paths = files.map((f) => f.path);
  const text = [input.name, ...paths.slice(0, 120)].join(' ');
  const all = `${text}\n${nfo}`;
  const exts = new Map<string, number>();
  for (const p of paths) { const e = extOf(p); if (e) exts.set(e, (exts.get(e) ?? 0) + 1); }
  const extList = [...exts.keys()];
  const found: Record<string, string[]> = {};
  const set = (key: string, values: string[]) => { if (allowed.includes(key) && values.length) found[key] = [...new Set(values)]; };
  const genres = (input.metaGenres ?? []).join(' ; ');

  // ---- Films & séries
  const hasVideoFile = extList.some((e) => ['mkv', 'mp4', 'avi', 'm2ts', 'ts', 'mov', 'wmv', 'mpg', 'm4v', 'webm', 'iso'].includes(e));
  if (allowed.includes('hdrFormat')) {
    const dv = /\b(dv|dovi|dolby[ ._-]?vision)\b/i.test(all);
    const hdr10p = /hdr10(\+|plus|p)(?![a-z])|SMPTE ST 2094/i.test(all);
    const hdr10 = /\bhdr10\b(?!\+)|\bhdr\b|SMPTE ST 2086|HDR10 compatible/i.test(all);
    if (dv && hdr10p) set('hdrFormat', ['DV+HDR10+']);
    else if (dv && hdr10) set('hdrFormat', ['DV+HDR10']);
    else if (dv) set('hdrFormat', ['Dolby Vision']);
    else if (hdr10p) set('hdrFormat', ['HDR10+']);
    else if (hdr10) set('hdrFormat', ['HDR10']);
    else if (hasVideoFile || /\b(2160|1080|720|480)p\b|\b(x26[45]|h\.?26[45]|hevc|avc)\b/i.test(all)) set('hdrFormat', ['SDR']);
  }
  if (allowed.includes('channels')) {
    const ch = new Set<string>();
    for (const m of all.matchAll(/(?<![0-9])(7[. ]1|5[. ]1|2[. ]0|1[. ]0)(?![0-9])/g)) ch.add(m[1].replace(' ', '.'));
    for (const m of nfo.matchAll(/Channel\(s\)\s*:\s*(\d+)\s*channels?/gi)) {
      const n = Number(m[1]);
      ch.add(n >= 8 ? '7.1' : n >= 6 ? '5.1' : n === 2 ? '2.0' : '1.0');
    }
    set('channels', ['7.1', '5.1', '2.0', '1.0'].filter((c) => ch.has(c)));
  }
  if (allowed.includes('audioQuality')) {
    const lossless = /truehd|dts[ ._-]?hd[ ._-]?ma|dts[ ._-]?hd|\bflac\b|\blpcm\b|\bpcm\b|\balac\b|\bmlp\b|Compression mode\s*:\s*Lossless/i.test(all);
    const lossy = /\baac\b|\bac-?3\b|e-?ac-?3|\bddp?\b|\bdd\+|\bdts\b(?![ ._-]?hd)|\bmp3\b|\bopus\b|vorbis|Compression mode\s*:\s*Lossy/i.test(all);
    set('audioQuality', [lossless && 'Lossless', lossy && 'Lossy'].filter(Boolean) as string[]);
  }
  if (allowed.includes('serieType')) {
    if (/\b(int[eé]grale|complete[ ._-]series|s[eé]rie[ ._-]compl[eè]te)\b/i.test(input.name)) set('serieType', ['Intégrale']);
    else if (/\bS\d{1,2}[ ._-]?E\d{1,3}\b/i.test(input.name)) set('serieType', ['Épisode']);
    else if (/\bS\d{1,2}\b|\b(saison|season)[ ._-]?\d{1,2}\b/i.test(input.name)) set('serieType', ['Saison']);
    else {
      const eps = new Set(paths.map((p) => p.match(/\bS\d{1,2}[ ._-]?E(\d{1,3})/i)?.[1]).filter(Boolean));
      if (eps.size === 1) set('serieType', ['Épisode']);
      else if (eps.size > 1) set('serieType', ['Saison']);
    }
  }

  // ---- Ebook
  if (allowed.includes('formatFichier')) {
    const formats = [...new Set(extList.map((e) => FILE_FORMATS[e]).filter(Boolean))];
    // Les images d'une bande dessinée en dossier ne comptent pas quand un vrai format de livre est présent.
    const real = formats.filter((f) => f !== 'JPG' && f !== 'PNG');
    set('formatFichier', real.length ? real : formats);
  }
  if (allowed.includes('langueEbook')) set('langueEbook', languagesOf(input.name, nfo));
  if (allowed.includes('genreEbook')) set('genreEbook', matchVocab(`${input.name} ${genres}`, FACETS_OPTIONS.genreEbook, GENRE_EBOOK));
  if (allowed.includes('styleLitteraire')) set('styleLitteraire', matchVocab(all, FACETS_OPTIONS.styleLitteraire, { 'Light novel': ['light novels', 'ln'], Artbook: ['art book', 'artbooks'], 'Roman graphique': ['graphic novel'] }));
  if (allowed.includes('demographique')) set('demographique', matchVocab(all, FACETS_OPTIONS.demographique, {}));
  if (allowed.includes('formatAudio') || allowed.includes('formatPodcast')) {
    const map: Record<string, string> = { mp3: 'MP3', m4a: 'M4A/AAC', aac: 'M4A/AAC', m4b: 'M4B', flac: 'FLAC', ogg: 'OGG', oga: 'OGG', opus: 'OGG', wma: 'WMA' };
    const f = [...new Set(extList.map((e) => map[e]).filter(Boolean))];
    set('formatAudio', f);
    set('formatPodcast', f.filter((v) => v !== 'M4B' && v !== 'WMA'));
  }
  if (allowed.includes('typeAudio')) {
    const t = matchVocab(all, FACETS_OPTIONS.typeAudio.filter((o) => o !== 'Livre audio'), { 'Cours/Formation': ['cours', 'formation', 'course', 'lecon', 'lecons'], 'Pièce de théâtre': ['piece de theatre', 'theatre'], Radio: ['emission radio', 'radio'] });
    set('typeAudio', t.length ? t.slice(0, 1) : ['Livre audio']);
  }
  if (allowed.includes('genreAudioEbook')) set('genreAudioEbook', matchVocab(`${input.name} ${genres}`, FACETS_OPTIONS.genreAudioEbook, GENRE_AUDIO_EBOOK));

  // ---- Audio
  if (allowed.includes('formatMusique')) {
    const out: string[] = [];
    const has = (...e: string[]) => e.some((x) => exts.has(x));
    if (has('flac')) out.push(/(?<![0-9])24[ ._-]?bits?\b|24[ ._-]?(44|48|88|96|176|192)(?![0-9])|Bit depth\s*:\s*24/i.test(all) ? 'FLAC (24 bit)' : 'FLAC (16 bit)');
    if (has('mp3')) out.push('MP3');
    if (has('m4a', 'alac')) out.push(/\balac\b|Apple Lossless/i.test(all) ? 'ALAC (M4A)' : 'AAC (M4A)');
    else if (has('aac')) out.push('AAC (M4A)');
    if (has('wav')) out.push('WAV');
    if (has('aif', 'aiff')) out.push('AIF');
    if (has('ogg', 'oga', 'opus')) out.push('OGG');
    if (has('wma')) out.push('WMA');
    if (has('ape')) out.push("Monkey's Audio");
    if (has('wv')) out.push('WavPack');
    if (has('mpc')) out.push('MPC');
    if (has('dsf', 'dff')) out.push('DSD');
    if (has('dts')) out.push('DTS');
    if (has('ac3')) out.push('AC3');
    if (has('iso') && /pure[ ._-]?audio|bd[ ._-]?audio/i.test(all)) out.push('BluRay Pure Audio');
    set('formatMusique', out);
  }
  if (allowed.includes('qualiteMusique')) {
    const q = /\bsacd\b/i.test(all) ? 'SACD' : /vinyl|vinyle|\blp\b|vinylrip/i.test(all) ? 'Vinyle' : /blu-?ray[ ._-]?audio|bd[ ._-]?audio|pure[ ._-]?audio/i.test(all) ? 'BluRay Audio'
      : /\bweb\b|bandcamp|qobuz|tidal|itunes|deezer|spotify|amazon[ ._-]?music/i.test(all) ? 'Web' : /\bcd\b|cdda|cd-?rip|\bcdr\b|\bcdflac\b/i.test(all) ? 'CD' : '';
    if (q) set('qualiteMusique', [q]);
  }
  if (allowed.includes('typeMusique')) {
    const audioFiles = paths.filter((p) => AUDIO_EXT.has(extOf(p))).length;
    const t = /discograph/i.test(all) ? 'Discographie' : /\b(ost|soundtrack|bande originale|original (motion picture )?score|original game soundtrack)\b/i.test(all) ? 'Bande originale de film/jeu'
      : /\b(live|concert|en concert|unplugged)\b/i.test(input.name) ? 'Live/Concert' : /\b(mix|medley|dj[ ._-]?mix|mixtape|megamix)\b/i.test(input.name) ? 'Mix/Medley'
      : /(?:^|[\s._\-\[(])EP(?=$|[\s._\-\])])/.test(input.name) ? 'EP' : /\b(coffret|box[ ._-]?set|int[eé]grale|complete[ ._-](collection|works)|anthology)\b/i.test(input.name) ? 'Intégrale/Coffret'
      : /\bradio\b/i.test(input.name) ? 'Radio' : audioFiles >= 3 ? 'Album' : '';
    if (t) set('typeMusique', [t]);
  }
  // Le genre musical ne se devine PAS du nom (« Daft Punk » n'est pas du punk) : fiche (Deezer...) ou ligne « Genre » du NFO seulement.
  if (allowed.includes('genreMusique')) set('genreMusique', matchVocab(`${genres} ${nfo.match(/^\s*genres?\s*[:.]+\s*(.+)$/im)?.[1] ?? ''}`, FACETS_OPTIONS.genreMusique, GENRE_MUSIC));
  if (allowed.includes('formatSamples')) {
    const map: Record<string, string> = { wav: 'WAV', aif: 'AIFF', aiff: 'AIFF', mp3: 'MP3', rex: 'REX', rx2: 'REX', mid: 'MIDI', midi: 'MIDI' };
    const f = [...new Set(extList.map((e) => map[e]).filter(Boolean))];
    set('formatSamples', f.length > 1 ? ['Multi-format'] : f);
  }
  if (allowed.includes('genreSamples')) set('genreSamples', matchVocab(text, FACETS_OPTIONS.genreSamples, GENRE_SAMPLES));
  if (allowed.includes('genrePodcast')) set('genrePodcast', matchVocab(`${genres} ${input.name}`, FACETS_OPTIONS.genrePodcast, GENRE_PODCAST));

  // ---- Applications et jeux
  if (allowed.includes('systemeMobile')) {
    set('systemeMobile', MOBILE.filter((m) => m.name.test(all) || m.ext?.some((e) => exts.has(e))).map((m) => m.value));
  }
  if (allowed.includes('genreApplications')) set('genreApplications', matchVocab(`${input.name} ${genres}`, FACETS_OPTIONS.genreApplications, GENRE_APPS).slice(0, 3));
  if (allowed.includes('genreJeux')) set('genreJeux', matchVocab(`${genres} ${input.name}`, FACETS_OPTIONS.genreJeux, GENRE_GAMES));
  // Consoles : même reconnaissance que le sélecteur de plateforme de l'envoi (voir game-platforms.ts).
  const platformIds = detectPlatformIds(all, extList);
  for (const key of ['consoleMicrosoft', 'consoleNintendo', 'consoleSony']) {
    if (!allowed.includes(key)) continue;
    set(key, GAME_PLATFORMS.filter((p) => p.facetKey === key && platformIds.includes(p.id)).map((p) => p.facetValue as string));
  }

  // ---- Autres catégories
  if (allowed.includes('gpsMarque')) {
    const v = matchVocab(all, FACETS_OPTIONS.gpsMarque.filter((o) => o !== 'Autre'), { 'Android Auto': ['androidauto'], CarPlay: ['car play', 'apple carplay'] });
    set('gpsMarque', v);
  }
  if (allowed.includes('nulledType')) set('nulledType', matchVocab(all, FACETS_OPTIONS.nulledType, { Thème: ['theme', 'themes'], Plugin: ['plugins', 'addon', 'add on', 'extension'], Template: ['templates'], Script: ['scripts', 'php script'], Module: ['modules'], Application: ['app', 'application'] }));
  if (allowed.includes('cms')) set('cms', matchVocab(all, FACETS_OPTIONS.cms.filter((o) => o !== 'Autre'), { PrestaShop: ['presta shop'], WooCommerce: ['woo commerce', 'woo'], WordPress: ['wp'] }));
  if (allowed.includes('format3d')) {
    const map: Record<string, string> = { stl: 'STL', obj: 'OBJ', '3mf': '3MF', step: 'STEP', stp: 'STEP', gcode: 'GCODE', amf: 'AMF', fbx: 'FBX', blend: 'BLEND' };
    set('format3d', [...new Set(extList.map((e) => map[e]).filter(Boolean))]);
  }
  if (allowed.includes('techno3d')) {
    const resin = /\b(resin|resine|r[eé]sine|sla|msla|lychee|chitubox|photon)\b/i.test(all);
    const fdm = /\b(fdm|filament|pla|petg|cura|prusaslicer|bambu)\b/i.test(all) || exts.has('gcode');
    set('techno3d', [fdm && 'FDM', resin && 'Résine (SLA)'].filter(Boolean) as string[]);
  }

  return normalizeAttrs(found, allowed);
}

