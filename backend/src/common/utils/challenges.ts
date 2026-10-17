/**
 * Défis quotidiens et hebdomadaires : catalogue et règles pures (sans base de données).
 *
 * Chaque jour, tous les membres ont les mêmes trois défis (un facile, un moyen, un difficile) ; chaque semaine, trois défis plus longs. Ils portent sur les activités
 * gratuites (roue, quiz, pronostics, cartes, parties gratuites du jour) : aucun ne demande de miser des points. Réussir un défi rapporte quelques points tout de suite ;
 * réussir les trois d'une période rapporte un bonus et des paquets de cartes.
 */
import { seededRandom } from './quiz';
import { ChallengeEventName } from './challenge-bus';

export type Tier = 'easy' | 'medium' | 'hard';
export type Scope = 'daily' | 'weekly';
/** `distinct` : nombre de jeux différents essayés dans la période (déduit des activités). */
export type Metric = ChallengeEventName | 'distinct';

export interface ChallengeDef { id: string; scope: Scope; tier: Tier; icon: string; title: string; desc: string; event: Metric; target: number; points: number; packs?: number }

const d = (id: string, tier: Tier, icon: string, title: string, desc: string, event: Metric, target: number, points: number): ChallengeDef => ({ id, scope: 'daily', tier, icon, title, desc, event, target, points });
const w = (id: string, tier: Tier, icon: string, title: string, desc: string, event: Metric, target: number, points: number, packs?: number): ChallengeDef => ({ id, scope: 'weekly', tier, icon, title, desc, event, target, points, packs });

export const CHALLENGES: ChallengeDef[] = [
  // quotidiens : faciles
  d('d-wheel', 'easy', '🎡', 'Tourne la roue', 'Fais ton tour gratuit de la roue de la fortune.', 'wheel', 1, 5),
  d('d-pack', 'easy', '🎴', 'Paquet du jour', 'Réclame ton paquet de cartes gratuit.', 'cards_daily', 1, 5),
  d('d-quiz', 'easy', '🧠', 'Quiz du jour', 'Termine le quiz quotidien.', 'quiz', 1, 8),
  d('d-free', 'easy', '🎁', 'Partie gratuite', 'Joue une partie gratuite du jour (machines à sous, Plus haut ou plus bas, blackjack ou dés).', 'free_play', 1, 5),
  // quotidiens : moyens
  d('d-correct3', 'medium', '✅', 'Trois bonnes réponses', 'Réponds juste à 3 questions du quiz.', 'quiz_correct', 3, 10),
  d('d-picks3', 'medium', '🎯', 'Trois pronostics', 'Fais 3 pronostics sur des matchs de la LNH.', 'picks', 3, 10),
  d('d-open', 'medium', '📦', 'Ouvre un paquet', 'Ouvre un paquet de cartes.', 'cards_open', 1, 10),
  d('d-free2', 'medium', '🎉', 'Deux parties gratuites', 'Joue 2 parties gratuites du jour.', 'free_play', 2, 12),
  // quotidiens : difficiles
  d('d-perfect', 'hard', '🏆', 'Quiz sans faute', 'Réussis le quiz quotidien sans faute.', 'quiz_perfect', 1, 25),
  d('d-won2', 'hard', '🏒', 'Deux pronostics gagnés', 'Réussis 2 pronostics sur la LNH.', 'picks_won', 2, 20),
  d('d-four', 'hard', '🌈', 'Quatre jeux différents', 'Essaie 4 jeux différents (activités gratuites) dans la journée.', 'distinct', 4, 20),
  d('d-picks6', 'hard', '📋', 'Six pronostics', 'Fais 6 pronostics sur des matchs de la LNH.', 'picks', 6, 18),
  // hebdomadaires
  w('w-wheel5', 'easy', '🎡', 'Roue cinq jours', 'Tourne la roue de la fortune 5 jours cette semaine.', 'wheel', 5, 25),
  w('w-quiz4', 'easy', '🧠', 'Quiz quatre jours', 'Termine le quiz quotidien 4 jours cette semaine.', 'quiz', 4, 30),
  w('w-free6', 'easy', '🎁', 'Six parties gratuites', 'Joue 6 parties gratuites du jour cette semaine.', 'free_play', 6, 30),
  w('w-won6', 'medium', '🏒', 'Six pronostics gagnés', 'Réussis 6 pronostics sur la LNH cette semaine.', 'picks_won', 6, 45),
  w('w-open4', 'medium', '📦', 'Quatre paquets ouverts', 'Ouvre 4 paquets de cartes cette semaine.', 'cards_open', 4, 40),
  w('w-games5', 'medium', '🌈', 'Cinq jeux différents', 'Essaie 5 jeux différents (activités gratuites) cette semaine.', 'distinct', 5, 40),
  w('w-perfect', 'hard', '🏆', 'Un quiz sans faute', 'Réussis un quiz sans faute cette semaine.', 'quiz_perfect', 1, 60, 1),
  w('w-correct20', 'hard', '🎓', 'Vingt bonnes réponses', 'Réponds juste à 20 questions du quiz cette semaine.', 'quiz_correct', 20, 60),
  w('w-won12', 'hard', '🥇', 'Douze pronostics gagnés', 'Réussis 12 pronostics sur la LNH cette semaine.', 'picks_won', 12, 70, 1),
];

export const TIERS: Tier[] = ['easy', 'medium', 'hard'];
export const TIER_LABEL: Record<Tier, string> = { easy: 'Facile', medium: 'Moyen', hard: 'Difficile' };

export const challengeById = (id: string): ChallengeDef | undefined => CHALLENGES.find((c) => c.id === id);

/** Les trois défis d'une période (un par niveau), les mêmes pour tous les membres : choisis au hasard avec la date comme graine. `period` est le jour (quotidien) ou le lundi (hebdomadaire). */
export function pick(scope: Scope, period: string): ChallengeDef[] {
  return TIERS.map((tier) => {
    const pool = CHALLENGES.filter((c) => c.scope === scope && c.tier === tier);
    return pool[Math.floor(seededRandom(`${scope}:${period}:${tier}`)() * pool.length)];
  });
}

export interface ChallengesConfig {
  enabled: boolean;
  minAccountDays: number;
  /** Échelle des points offerts, en pourcentage (100 = valeurs du catalogue ; 0 = aucun point, seulement des paquets). */
  rewardScale: number;
  /** Bonus quand les trois défis d'une période sont réussis. */
  dailyBonus: { points: number; packs: number };
  weeklyBonus: { points: number; packs: number };
}

export const DEFAULT_CHALLENGES: ChallengesConfig = {
  enabled: true, minAccountDays: 3, rewardScale: 100, dailyBonus: { points: 15, packs: 1 }, weeklyBonus: { points: 60, packs: 2 },
};

const int = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

export function normalizeChallenges(raw: any, previous: ChallengesConfig = DEFAULT_CHALLENGES): ChallengesConfig {
  const r = raw && typeof raw === 'object' ? raw : {};
  const bonus = (v: any, p: { points: number; packs: number }) => ({ points: int(v?.points, 0, 100_000, p.points), packs: int(v?.packs, 0, 10, p.packs) });
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : previous.enabled,
    minAccountDays: int(r.minAccountDays, 0, 3650, previous.minAccountDays),
    rewardScale: int(r.rewardScale, 0, 500, previous.rewardScale),
    dailyBonus: bonus(r.dailyBonus, previous.dailyBonus),
    weeklyBonus: bonus(r.weeklyBonus, previous.weeklyBonus),
  };
}

/** Points réellement offerts pour une valeur du catalogue (arrondi à l'entier le plus proche). */
export const scaled = (points: number, cfg: ChallengesConfig): number => Math.round((points * cfg.rewardScale) / 100);

/** L'événement reçu fait-il avancer ce défi ? Les défis « jeux différents » avancent à chaque activité d'un jeu. */
export function advancedBy(def: ChallengeDef, event: ChallengeEventName, game?: string): boolean {
  return def.event === 'distinct' ? !!game : def.event === event;
}

const parse = (day: string) => { const [y, m, dd] = day.split('-').map(Number); return Date.UTC(y, m - 1, dd, 12); };

/** Jours de suite où le bonus quotidien a été obtenu, en comptant jusqu'à aujourd'hui (ou hier si aujourd'hui n'est pas encore fini). `days` : jours avec bonus, dans n'importe quel ordre. */
export function bonusStreak(days: string[], today: string): number {
  const set = new Set(days);
  const DAY = 86400_000;
  let t = parse(today);
  if (!set.has(today)) t -= DAY;
  let n = 0;
  for (;;) {
    const iso = new Date(t).toISOString().slice(0, 10);
    if (!set.has(iso)) break;
    n++; t -= DAY;
  }
  return n;
}
