/**
 * Plateformes de jeux proposées à l'envoi (Windows, Switch, PS5, Xbox 360...) : chacune sait dans quelle sous-catégorie ranger le jeu,
 * quel filtre de console remplir, comment la reconnaître dans un nom ou des fichiers, et comment RAWG la nomme.
 */
export interface GamePlatform {
  id: string;
  label: string;
  group: 'PC' | 'Nintendo' | 'Sony' | 'Microsoft' | 'Mobile' | 'VR';
  /** Sous-catégorie de « Jeux Vidéo » où ranger le jeu. */
  category: string;
  /** Filtre à remplir (voir facet-schema.ts) et sa valeur. */
  facetKey?: 'consoleMicrosoft' | 'consoleNintendo' | 'consoleSony' | 'systemeMobile';
  facetValue?: string;
  /** Noms de la plateforme chez RAWG (comparaison exacte, sans casse). */
  rawg: string[];
  name?: RegExp;
  ext?: string[];
}

export const GAME_PLATFORMS: GamePlatform[] = [
  { id: 'windows', label: 'Windows', group: 'PC', category: 'Jeux Windows', rawg: ['pc'], name: /\b(windows|win(32|64)?|gog|steamrip|fitgirl|dodi|repack|codex|skidrow|plaza|setup)\b|(?:^|[\s._-])pc(?=$|[\s._-])/i, ext: ['exe', 'msi'] },
  { id: 'macos', label: 'macOS', group: 'PC', category: 'Jeux MacOS', rawg: ['macos'], name: /\b(mac(os)?|os[ ._-]?x|apple[ ._-]?silicon)\b/i, ext: ['dmg'] },
  { id: 'linux', label: 'Linux', group: 'PC', category: 'Jeux Linux', rawg: ['linux'], name: /\blinux\b|appimage/i, ext: ['appimage'] },

  { id: 'switch2', label: 'Switch 2', group: 'Nintendo', category: 'Jeux Nintendo', facetKey: 'consoleNintendo', facetValue: 'Switch 2', rawg: ['nintendo switch 2'], name: /\bswitch[ ._-]?2\b/i },
  { id: 'switch', label: 'Switch', group: 'Nintendo', category: 'Jeux Nintendo', facetKey: 'consoleNintendo', facetValue: 'Switch', rawg: ['nintendo switch'], name: /\b(nintendo[ ._-]?)?switch\b(?![ ._-]?2)|\b(nsp|xci|nsz|xcz)\b/i, ext: ['nsp', 'xci', 'nsz', 'xcz'] },
  { id: 'wiiu', label: 'Wii U', group: 'Nintendo', category: 'Jeux Nintendo', facetKey: 'consoleNintendo', facetValue: 'WiiU', rawg: ['wii u'], name: /wii[ ._-]?u\b/i, ext: ['wux', 'wud', 'rpx'] },
  { id: 'wii', label: 'Wii', group: 'Nintendo', category: 'Jeux Nintendo', facetKey: 'consoleNintendo', facetValue: 'Wii', rawg: ['wii'], name: /\bwii\b/i, ext: ['wbfs'] },
  { id: '3ds', label: '3DS', group: 'Nintendo', category: 'Jeux Nintendo', facetKey: 'consoleNintendo', facetValue: '3DS', rawg: ['nintendo 3ds'], name: /\b3ds\b/i, ext: ['3ds', 'cia', 'cci'] },
  { id: 'ds', label: 'DS', group: 'Nintendo', category: 'Jeux Nintendo', facetKey: 'consoleNintendo', facetValue: 'DS', rawg: ['nintendo ds'], name: /\bnds\b|nintendo[ ._-]?ds\b/i, ext: ['nds'] },
  { id: 'gamecube', label: 'GameCube', group: 'Nintendo', category: 'Jeux Nintendo', facetKey: 'consoleNintendo', facetValue: 'GameCube', rawg: ['gamecube'], name: /game[ ._-]?cube|\bngc\b/i, ext: ['gcm', 'gcz'] },
  { id: 'gba', label: 'Game Boy / GBA', group: 'Nintendo', category: 'Jeux Nintendo', facetKey: 'consoleNintendo', facetValue: 'Game Boy / GBA', rawg: ['game boy advance', 'game boy color', 'game boy'], name: /game[ ._-]?boy|\bgba\b|\bgbc\b/i, ext: ['gba', 'gbc', 'gb'] },
  { id: 'n64', label: 'N64', group: 'Nintendo', category: 'Jeux Nintendo', facetKey: 'consoleNintendo', facetValue: 'N64', rawg: ['nintendo 64'], name: /\bn64\b|nintendo[ ._-]?64/i, ext: ['z64', 'n64', 'v64'] },
  { id: 'snes', label: 'SNES', group: 'Nintendo', category: 'Jeux Nintendo', facetKey: 'consoleNintendo', facetValue: 'SNES', rawg: ['snes'], name: /\bsnes\b|super[ ._-]?nintendo/i, ext: ['sfc', 'smc'] },
  { id: 'nes', label: 'NES', group: 'Nintendo', category: 'Jeux Nintendo', facetKey: 'consoleNintendo', facetValue: 'NES', rawg: ['nes'], name: /\bnes\b/i, ext: ['nes'] },

  { id: 'ps5', label: 'PS5', group: 'Sony', category: 'Jeux Sony', facetKey: 'consoleSony', facetValue: 'PlayStation 5', rawg: ['playstation 5'], name: /\bps5\b|playstation[ ._-]?5/i },
  { id: 'ps4', label: 'PS4', group: 'Sony', category: 'Jeux Sony', facetKey: 'consoleSony', facetValue: 'PlayStation 4', rawg: ['playstation 4'], name: /\bps4\b|playstation[ ._-]?4/i },
  { id: 'ps3', label: 'PS3', group: 'Sony', category: 'Jeux Sony', facetKey: 'consoleSony', facetValue: 'PlayStation 3', rawg: ['playstation 3'], name: /\bps3\b|playstation[ ._-]?3/i },
  { id: 'ps2', label: 'PS2', group: 'Sony', category: 'Jeux Sony', facetKey: 'consoleSony', facetValue: 'PlayStation 2', rawg: ['playstation 2'], name: /\bps2\b|playstation[ ._-]?2/i },
  { id: 'ps1', label: 'PlayStation', group: 'Sony', category: 'Jeux Sony', facetKey: 'consoleSony', facetValue: 'PlayStation', rawg: ['playstation'], name: /\bpsx\b|\bps1\b|playstation(?![ ._-]?[2-5])/i },
  { id: 'psp', label: 'PSP', group: 'Sony', category: 'Jeux Sony', facetKey: 'consoleSony', facetValue: 'PSP', rawg: ['psp'], name: /\bpsp\b/i, ext: ['cso'] },
  { id: 'vita', label: 'Vita', group: 'Sony', category: 'Jeux Sony', facetKey: 'consoleSony', facetValue: 'Vita', rawg: ['ps vita'], name: /\bps[ ._-]?vita\b|\bvita\b/i, ext: ['vpk'] },

  { id: 'xboxseries', label: 'Xbox Series X/S', group: 'Microsoft', category: 'Jeux Microsoft', facetKey: 'consoleMicrosoft', facetValue: 'Xbox Series X/S', rawg: ['xbox series s/x', 'xbox series x', 'xbox series s'], name: /xbox[ ._-]?series|\bxsx\b|\bxbsx\b/i },
  { id: 'xboxone', label: 'Xbox One', group: 'Microsoft', category: 'Jeux Microsoft', facetKey: 'consoleMicrosoft', facetValue: 'Xbox One', rawg: ['xbox one'], name: /xbox[ ._-]?one|\bxb1\b/i },
  { id: 'xbox360', label: 'Xbox 360', group: 'Microsoft', category: 'Jeux Microsoft', facetKey: 'consoleMicrosoft', facetValue: 'Xbox 360', rawg: ['xbox 360'], name: /xbox[ ._-]?360|\bx360\b|\bxbla\b/i, ext: ['xex'] },
  { id: 'xbox', label: 'Xbox', group: 'Microsoft', category: 'Jeux Microsoft', facetKey: 'consoleMicrosoft', facetValue: 'Xbox', rawg: ['xbox'], name: /\bxbox\b(?![ ._-]?(360|one|series))/i },

  { id: 'android', label: 'Android', group: 'Mobile', category: 'Jeux Smartphone', facetKey: 'systemeMobile', facetValue: 'Android', rawg: ['android'], name: /\bandroid\b/i, ext: ['apk', 'xapk', 'apks', 'obb'] },
  { id: 'ios', label: 'iOS', group: 'Mobile', category: 'Jeux Smartphone', facetKey: 'systemeMobile', facetValue: 'iOS', rawg: ['ios'], name: /\bios\b|\biphone\b|\bipad\b/i, ext: ['ipa'] },
];

const lower = (s: string) => s.trim().toLowerCase();

/** Plateformes reconnues dans un nom / des extensions ; une plateforme plus précise écarte la plus générale (Switch 2 > Switch, Wii U > Wii...). */
export function detectPlatformIds(text: string, exts: string[]): string[] {
  const hits = GAME_PLATFORMS.filter((p) => p.name?.test(text) || p.ext?.some((e) => exts.includes(e))).map((p) => p.id);
  const drop = new Set<string>();
  if (hits.includes('switch2')) drop.add('switch');
  if (hits.includes('wiiu')) drop.add('wii');
  if (hits.includes('3ds')) drop.add('ds');
  if (hits.includes('xboxseries') || hits.includes('xboxone') || hits.includes('xbox360')) drop.add('xbox');
  if (hits.some((h) => ['ps5', 'ps4', 'ps3', 'ps2'].includes(h))) drop.add('ps1');
  // Un .exe / « repack » n'est du PC que si aucune console n'est nommée.
  if (hits.some((h) => !['windows', 'macos', 'linux'].includes(h))) drop.add('windows');
  return hits.filter((h) => !drop.has(h));
}

/** « PC, PlayStation 5, Nintendo Switch » (RAWG) → ids de plateformes. */
export function platformIdsFromRawg(list: string): string[] {
  const names = list.split(/[,;]+/).map(lower).filter(Boolean);
  return GAME_PLATFORMS.filter((p) => p.rawg.some((r) => names.includes(r))).map((p) => p.id);
}

/** Valeur d'une ligne étiquetée d'un NFO (« Plateforme(s) : GameCube », « Genre(s) : Action, Adventure »...). */
export function nfoLine(nfo: string | null | undefined, labels: string): string | null {
  if (!nfo) return null;
  const m = new RegExp(`^\\s*(?:${labels})\\s*(?:\\([sx]\\))?\\s*[:.\\-]+\\s*(.+)$`, 'im').exec(nfo);
  return m ? m[1].trim() : null;
}

/**
 * Plateformes d'une release de jeu. Ordre de confiance : la ligne « Plateforme(s) : » du NFO, puis le nom et les fichiers du torrent.
 * Le texte libre d'un NFO n'est PAS lu (il parle souvent d'autres plateformes : « pour Wii... », « remake de la version PlayStation »).
 */
export function detectGamePlatforms(name: string, paths: string[], nfo?: string | null): string[] {
  const exts = paths.map((p) => (p.includes('.') ? p.split('.').pop()!.toLowerCase() : '')).filter(Boolean);
  const labeled = nfoLine(nfo, 'plateformes?|platforms?|plate-?forme|consoles?|syst[eè]mes?');
  if (labeled) {
    const ids = detectPlatformIds(labeled, []);
    if (ids.length) return ids;
  }
  return detectPlatformIds([name, ...paths.slice(0, 120)].join(' '), exts);
}
