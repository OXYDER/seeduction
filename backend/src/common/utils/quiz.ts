/**
 * Quiz quotidien : règles pures (sans base de données).
 *
 * Chaque jour (heure de Montréal), tous les membres reçoivent les mêmes questions. Chaque bonne réponse rapporte des points, plus un bonus de rapidité ;
 * un sans-faute rapporte un bonus de plus. Les jours de suite améliorent le total, et on ne repart jamais les mains vides : un quiz raté donne un prix de consolation.
 * Rien n'est misé : ce sont des cadeaux du site.
 */
import { dayBefore } from './wheel';

export interface QuizConfig {
  enabled: boolean;
  minAccountDays: number;
  questionsPerDay: number;
  secondsPerQuestion: number;
  pointsPerCorrect: number;
  /** Bonus maximal de rapidité : répondre tout de suite rapporte ce bonus en plus, répondre au dernier moment n'en rapporte aucun. */
  speedBonusMax: number;
  perfectBonus: number;
  /** Points offerts quand aucune réponse n'est bonne. */
  consolation: number;
  streak: { bonusPerDay: number; maxBonus: number };
  /** Points offerts aux trois meilleurs de la veille (1er, 2e, 3e). */
  podium: [number, number, number];
  /** Points offerts à un membre dont la question proposée est acceptée par le staff. */
  suggestionReward: number;
}

export const DEFAULT_QUIZ: QuizConfig = {
  enabled: true, minAccountDays: 3, questionsPerDay: 5, secondsPerQuestion: 20,
  pointsPerCorrect: 10, speedBonusMax: 5, perfectBonus: 50, consolation: 10,
  streak: { bonusPerDay: 0.05, maxBonus: 0.5 },
  podium: [50, 30, 20],
  suggestionReward: 20,
};

/** Réponse enregistrée : `choice` est l'indice de la réponse choisie dans la liste d'origine (null si le temps est écoulé). */
export interface AnswerRec { q: string; choice: number | null; ms: number; correct: boolean; points: number }

const int = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};
const num = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

export function normalizeQuiz(raw: any, previous: QuizConfig = DEFAULT_QUIZ): QuizConfig {
  const r = raw && typeof raw === 'object' ? raw : {};
  const st = r.streak && typeof r.streak === 'object' ? r.streak : {};
  const pod = Array.isArray(r.podium) ? r.podium : [];
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : previous.enabled,
    minAccountDays: int(r.minAccountDays, 0, 3650, previous.minAccountDays),
    questionsPerDay: int(r.questionsPerDay, 3, 15, previous.questionsPerDay),
    secondsPerQuestion: int(r.secondsPerQuestion, 8, 120, previous.secondsPerQuestion),
    pointsPerCorrect: int(r.pointsPerCorrect, 0, 1000, previous.pointsPerCorrect),
    speedBonusMax: int(r.speedBonusMax, 0, 1000, previous.speedBonusMax),
    perfectBonus: int(r.perfectBonus, 0, 10_000, previous.perfectBonus),
    consolation: int(r.consolation, 0, 1000, previous.consolation),
    streak: { bonusPerDay: num(st.bonusPerDay, 0, 0.5, previous.streak.bonusPerDay), maxBonus: num(st.maxBonus, 0, 5, previous.streak.maxBonus) },
    podium: [0, 1, 2].map((i) => int(pod[i], 0, 100_000, previous.podium[i])) as [number, number, number],
    suggestionReward: int(r.suggestionReward, 0, 10_000, previous.suggestionReward),
  };
}

/** Points d'une réponse : rien si elle est fausse ; sinon les points de base plus un bonus de rapidité qui diminue avec le temps pris. */
export function pointsFor(correct: boolean, ms: number, cfg: QuizConfig): number {
  if (!correct) return 0;
  const window = cfg.secondsPerQuestion * 1000;
  const speed = Math.max(0, 1 - Math.max(0, ms) / window);
  return cfg.pointsPerCorrect + Math.round(cfg.speedBonusMax * speed);
}

/** Multiplicateur du total selon les jours de suite (1 le premier jour). */
export function streakMultiplier(streak: number, cfg: QuizConfig): number {
  return 1 + Math.min(cfg.streak.maxBonus, Math.max(0, streak - 1) * cfg.streak.bonusPerDay);
}

export interface QuizReward { correct: number; base: number; perfect: number; multiplier: number; total: number; bonus: number; consolation: boolean }

/** Récompense finale d'un quiz : points des réponses + bonus sans-faute, augmentés par la série ; un prix de consolation si aucune réponse n'est bonne. */
export function rewardFor(answers: AnswerRec[], questions: number, streak: number, cfg: QuizConfig): QuizReward {
  const correct = answers.filter((a) => a.correct).length;
  const base = answers.reduce((s, a) => s + a.points, 0);
  const perfect = questions > 0 && correct === questions ? cfg.perfectBonus : 0;
  const multiplier = streakMultiplier(streak, cfg);
  const raw = base + perfect;
  const total = raw > 0 ? Math.round(raw * multiplier) : cfg.consolation;
  return { correct, base, perfect, multiplier, total, bonus: total - base, consolation: raw === 0 };
}

/** Série du jour : un jour de plus si le dernier quiz joué était hier, sinon on repart de 1. */
export function nextQuizStreak(lastDay: string | null, lastStreak: number, today: string): number {
  return lastDay !== null && lastDay === dayBefore(today) ? lastStreak + 1 : 1;
}

/** Générateur pseudo-aléatoire déterministe (mulberry32) à partir d'une graine texte. */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mélange (Fisher-Yates) d'une copie de la liste avec un générateur de [0, 1[. */
export function shuffle<T>(items: T[], random: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Questions du jour : on évite celles posées récemment tant qu'il en reste assez dans la banque. */
export function pickDailyIds(poolIds: string[], recentIds: Set<string>, count: number, random: () => number): string[] {
  const fresh = poolIds.filter((id) => !recentIds.has(id));
  return shuffle(fresh.length >= count ? fresh : poolIds, random).slice(0, count);
}

/** Les quatre réponses d'une question dans un ordre propre à chaque partie (l'indice `i` est celui de la liste d'origine). */
export function choicesFor(choices: string[], seed: string): { i: number; text: string }[] {
  return shuffle(choices.map((text, i) => ({ i, text })), seededRandom(seed));
}

export interface QuestionInput { category: string; text: string; choices: string[]; answer: number; explain: string | null }

/** Valide une question saisie en administration ; renvoie la question propre ou le message d'erreur. */
export function validateQuestion(raw: any): { ok: true; value: QuestionInput } | { ok: false; error: string } {
  const r = raw && typeof raw === 'object' ? raw : {};
  const category = typeof r.category === 'string' ? r.category.trim() : '';
  const text = typeof r.text === 'string' ? r.text.trim() : '';
  const choices = Array.isArray(r.choices) ? r.choices.map((c: unknown) => (typeof c === 'string' ? c.trim() : '')) : [];
  const answer = Number(r.answer);
  const explain = typeof r.explain === 'string' && r.explain.trim() ? r.explain.trim() : null;
  if (category.length < 2 || category.length > 30) return { ok: false, error: 'La catégorie doit avoir de 2 à 30 caractères' };
  if (text.length < 5 || text.length > 300) return { ok: false, error: 'La question doit avoir de 5 à 300 caractères' };
  if (choices.length !== 4 || choices.some((c: string) => c.length < 1 || c.length > 80)) return { ok: false, error: 'Il faut exactement quatre réponses de 1 à 80 caractères' };
  if (new Set(choices.map((c: string) => c.toLowerCase())).size !== 4) return { ok: false, error: 'Les quatre réponses doivent être différentes' };
  if (!Number.isInteger(answer) || answer < 0 || answer > 3) return { ok: false, error: 'Indique laquelle des quatre réponses est la bonne' };
  if (explain && explain.length > 300) return { ok: false, error: 'L\'explication ne doit pas dépasser 300 caractères' };
  return { ok: true, value: { category, text, choices, answer, explain } };
}
