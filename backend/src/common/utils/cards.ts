/**
 * Cartes à collectionner : catalogue et règles pures (sans base de données).
 *
 * Les paquets se gagnent (un paquet par jour, plus des récompenses obtenues en jouant aux autres jeux) : ils ne s'achètent jamais avec des points, pour que cela
 * reste une collection et non un jeu de hasard payant. Chaque paquet contient quelques cartes ; la dernière est toujours au moins « rare », et une carte légendaire est
 * garantie après un certain nombre de paquets sans en avoir eu. Les doublons deviennent des éclats, qui servent à fabriquer les cartes manquantes. Compléter une série
 * (puis tout l'album) rapporte une fois des points.
 */
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
export type SetId = 'hockey' | 'cinema' | 'musique' | 'seeduction';

export type Art = { kind: 'team'; abbrev: string } | { kind: 'emoji'; emoji: string; hue: number };
export interface CardDef { id: string; set: SetId; name: string; rarity: Rarity; art: Art }
export interface SetDef { id: SetId; name: string; icon: string }

export const SETS: SetDef[] = [
  { id: 'hockey', name: 'Équipes de la LNH', icon: '🏒' },
  { id: 'cinema', name: 'Cinéma', icon: '🎬' },
  { id: 'musique', name: 'Musique', icon: '🎵' },
  { id: 'seeduction', name: 'Seeduction', icon: '⚜️' },
];

const team = (abbrev: string, name: string, rarity: Rarity): CardDef => ({ id: `hockey-${abbrev}`, set: 'hockey', name, rarity, art: { kind: 'team', abbrev } });
const emoji = (set: SetId, slug: string, name: string, rarity: Rarity, icon: string, hue: number): CardDef => ({ id: `${set}-${slug}`, set, name, rarity, art: { kind: 'emoji', emoji: icon, hue } });

export const CATALOG: CardDef[] = [
  // Équipes de la LNH : le Canadien est légendaire, les « Six équipes originales » sont épiques
  team('MTL', 'Canadiens de Montréal', 'legendary'),
  team('BOS', 'Bruins de Boston', 'epic'), team('CHI', 'Blackhawks de Chicago', 'epic'), team('DET', 'Red Wings de Detroit', 'epic'), team('NYR', 'Rangers de New York', 'epic'), team('TOR', 'Maple Leafs de Toronto', 'epic'),
  team('EDM', 'Oilers d\'Edmonton', 'rare'), team('COL', 'Avalanche du Colorado', 'rare'), team('FLA', 'Panthers de la Floride', 'rare'), team('VGK', 'Golden Knights de Vegas', 'rare'), team('TBL', 'Lightning de Tampa Bay', 'rare'),
  team('DAL', 'Stars de Dallas', 'rare'), team('CAR', 'Hurricanes de la Caroline', 'rare'), team('PIT', 'Penguins de Pittsburgh', 'rare'), team('LAK', 'Kings de Los Angeles', 'rare'), team('WPG', 'Jets de Winnipeg', 'rare'),
  team('ANA', 'Ducks d\'Anaheim', 'common'), team('BUF', 'Sabres de Buffalo', 'common'), team('CGY', 'Flames de Calgary', 'common'), team('CBJ', 'Blue Jackets de Columbus', 'common'), team('MIN', 'Wild du Minnesota', 'common'),
  team('NSH', 'Predators de Nashville', 'common'), team('NJD', 'Devils du New Jersey', 'common'), team('NYI', 'Islanders de New York', 'common'), team('OTT', 'Sénateurs d\'Ottawa', 'common'), team('PHI', 'Flyers de Philadelphie', 'common'),
  team('SJS', 'Sharks de San Jose', 'common'), team('SEA', 'Kraken de Seattle', 'common'), team('STL', 'Blues de St. Louis', 'common'), team('UTA', 'Mammoth de l\'Utah', 'common'), team('VAN', 'Canucks de Vancouver', 'common'),
  team('WSH', 'Capitals de Washington', 'common'),
  // Cinéma
  emoji('cinema', 'clap', 'Clap de tournage', 'common', '🎬', 210), emoji('cinema', 'popcorn', 'Pop-corn', 'common', '🍿', 40), emoji('cinema', 'pellicule', 'Pellicule', 'common', '🎞️', 260), emoji('cinema', 'camera', 'Caméra', 'common', '🎥', 190),
  emoji('cinema', 'drame', 'Drame', 'rare', '🎭', 300), emoji('cinema', 'epouvante', 'Épouvante', 'rare', '😱', 280), emoji('cinema', 'scifi', 'Science-fiction', 'rare', '🚀', 220), emoji('cinema', 'western', 'Western', 'rare', '🤠', 30), emoji('cinema', 'comedie', 'Comédie musicale', 'rare', '💃', 330),
  emoji('cinema', 'superheros', 'Super-héros', 'epic', '🦸', 350), emoji('cinema', 'fantastique', 'Fantastique', 'epic', '🐉', 150),
  emoji('cinema', 'oscar', 'Statuette d\'or', 'legendary', '🏆', 48),
  // Musique
  emoji('musique', 'guitare', 'Guitare', 'common', '🎸', 15), emoji('musique', 'batterie', 'Batterie', 'common', '🥁', 25), emoji('musique', 'piano', 'Piano', 'common', '🎹', 235),
  emoji('musique', 'saxophone', 'Saxophone', 'rare', '🎷', 45), emoji('musique', 'violon', 'Violon', 'rare', '🎻', 20),
  emoji('musique', 'micro', 'Micro', 'epic', '🎤', 320), emoji('musique', 'casque', 'Casque', 'epic', '🎧', 200),
  emoji('musique', 'disque', 'Disque d\'or', 'legendary', '💿', 50),
  // Seeduction
  emoji('seeduction', 'graine', 'Graine', 'common', '🌱', 120), emoji('seeduction', 'tracker', 'Tracker', 'common', '📡', 200), emoji('seeduction', 'torrent', 'Torrent', 'common', '🧲', 5),
  emoji('seeduction', 'fleur', 'Fleur de lys', 'rare', '⚜️', 48), emoji('seeduction', 'semeur', 'Semeur', 'rare', '🌳', 135), emoji('seeduction', 'satellite', 'Satellite', 'rare', '🛰️', 230),
  emoji('seeduction', 'coffre', 'Coffre des archives', 'epic', '🔒', 270), emoji('seeduction', 'fondateur', 'Membre fondateur', 'epic', '🌟', 45),
  emoji('seeduction', 'roi', 'Roi du ratio', 'legendary', '👑', 52),
];

export const cardById = (id: string): CardDef | undefined => CATALOG.find((c) => c.id === id);
export const cardsOf = (set: SetId): CardDef[] => CATALOG.filter((c) => c.set === set);

export interface CardsConfig {
  enabled: boolean;
  minAccountDays: number;
  /** Cartes par paquet (la dernière est au moins « rare »). */
  cardsPerPack: number;
  /** Paquets offerts par jour. */
  dailyPacks: number;
  /** Nombre de paquets au bout duquel une carte légendaire est garantie. */
  pityPacks: number;
  /** Points offerts, une seule fois, pour chaque série complétée et pour l'album entier. */
  setRewards: Record<SetId, number>;
  albumReward: number;
}

export const DEFAULT_CARDS: CardsConfig = {
  enabled: true, minAccountDays: 3, cardsPerPack: 3, dailyPacks: 1, pityPacks: 30,
  setRewards: { hockey: 400, cinema: 150, musique: 100, seeduction: 150 }, albumReward: 1000,
};

/** Chances (sur 1 000) de chaque rareté : cartes ordinaires d'un paquet, et dernière carte (au moins rare). */
export const ODDS: Record<'normal' | 'last', Record<Rarity, number>> = {
  normal: { common: 700, rare: 220, epic: 65, legendary: 15 },
  last: { common: 0, rare: 750, epic: 205, legendary: 45 },
};
/** Éclats rendus pour un doublon, et éclats nécessaires pour fabriquer une carte manquante. */
export const SHARDS: Record<Rarity, number> = { common: 5, rare: 15, epic: 40, legendary: 100 };
export const CRAFT_COST: Record<Rarity, number> = { common: 25, rare: 75, epic: 200, legendary: 500 };
export const RARITY_LABEL: Record<Rarity, string> = { common: 'Commune', rare: 'Rare', epic: 'Épique', legendary: 'Légendaire' };

const int = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

export function normalizeCards(raw: any, previous: CardsConfig = DEFAULT_CARDS): CardsConfig {
  const r = raw && typeof raw === 'object' ? raw : {};
  const sr = r.setRewards && typeof r.setRewards === 'object' ? r.setRewards : {};
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : previous.enabled,
    minAccountDays: int(r.minAccountDays, 0, 3650, previous.minAccountDays),
    cardsPerPack: int(r.cardsPerPack, 2, 6, previous.cardsPerPack),
    dailyPacks: int(r.dailyPacks, 0, 5, previous.dailyPacks),
    pityPacks: int(r.pityPacks, 5, 500, previous.pityPacks),
    setRewards: Object.fromEntries(SETS.map((s) => [s.id, int(sr[s.id], 0, 100_000, previous.setRewards[s.id])])) as Record<SetId, number>,
    albumReward: int(r.albumReward, 0, 1_000_000, previous.albumReward),
  };
}

/** Rareté tirée : `r` est un entier de [0, 1000[ ; les raretés à 0 ne sortent jamais. */
export function pickRarity(odds: Record<Rarity, number>, r: number): Rarity {
  let t = r;
  for (const k of RARITIES) {
    if (odds[k] > 0 && t < odds[k]) return k;
    t -= odds[k];
  }
  return RARITIES.filter((k) => odds[k] > 0).pop() as Rarity;
}

export interface Drawn { card: CardDef; rarity: Rarity }

/**
 * Tire un paquet. `rng(n)` renvoie un entier de [0, n[. Toutes les cartes sont tirées avec remise (on peut avoir des doublons). `pity` est le nombre de paquets déjà
 * ouverts sans carte légendaire : quand il atteint le seuil, la dernière carte du paquet est une légendaire. Renvoie les cartes et le nouveau compteur.
 */
export function drawPack(rng: (max: number) => number, cfg: CardsConfig, pity: number): { cards: CardDef[]; pity: number } {
  const cards: CardDef[] = [];
  for (let i = 0; i < cfg.cardsPerPack; i++) {
    const last = i === cfg.cardsPerPack - 1;
    let rarity: Rarity;
    if (last && pity + 1 >= cfg.pityPacks) rarity = 'legendary';
    else rarity = pickRarity(last ? ODDS.last : ODDS.normal, rng(1000));
    const pool = CATALOG.filter((c) => c.rarity === rarity);
    cards.push(pool[rng(pool.length)]);
  }
  return { cards, pity: cards.some((c) => c.rarity === 'legendary') ? 0 : pity + 1 };
}

/** Séries complétées par un ensemble de cartes possédées. */
export function completedSets(owned: Set<string>): SetId[] {
  return SETS.filter((s) => cardsOf(s.id).every((c) => owned.has(c.id))).map((s) => s.id);
}
export const albumComplete = (owned: Set<string>): boolean => CATALOG.every((c) => owned.has(c.id));
