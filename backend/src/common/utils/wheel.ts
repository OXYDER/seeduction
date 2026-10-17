/**
 * Roue de la fortune : règles pures (sans base de données).
 *
 * Un tour gratuit par jour (heure de Montréal). Le lot est tiré au hasard parmi les secteurs de la roue, selon leurs poids ; les secteurs et leurs valeurs
 * se règlent en administration. Chaque jour consécutif joué améliore le lot (bonus de série), et chaque septième jour de suite rapporte un bonus en plus.
 * Aucune mise : ce sont des récompenses offertes par le site, dont la valeur moyenne est calculée (voir `expectedValue`) pour en connaître le coût.
 */
export interface Segment { label: string; points: number; tokens: number; weight: number; color: string }

export interface WheelConfig {
  enabled: boolean;
  minAccountDays: number;
  segments: Segment[];
  streak: {
    /** Bonus par jour de série au-delà du premier (0,05 = +5 % par jour de suite). */
    bonusPerDay: number;
    /** Bonus maximal de série (0,5 = +50 %). */
    maxBonus: number;
    /** Points offerts tous les 7 jours de suite. */
    weeklyBonus: number;
  };
}

const C = ['#e8453c', '#f4a21e', '#2fb86b', '#2d8fe0', '#8a4de0', '#e0489a'];
const seg = (label: string, points: number, tokens: number, weight: number, i: number): Segment => ({ label, points, tokens, weight, color: C[i % C.length] });

/** Seize secteurs : beaucoup de petits lots, quelques gros, des jetons freeleech et un gros lot très rare. L'ordre est celui de la roue (dans le sens des aiguilles d'une montre depuis le haut). */
export const DEFAULT_SEGMENTS: Segment[] = [
  seg('10', 10, 0, 14, 0), seg('50', 50, 0, 7, 1), seg('20', 20, 0, 12, 2), seg('Jeton', 0, 1, 4, 3),
  seg('15', 15, 0, 12, 4), seg('100', 100, 0, 4, 5), seg('25', 25, 0, 10, 0), seg('250', 250, 0, 1.2, 1),
  seg('30', 30, 0, 9, 2), seg('75', 75, 0, 5, 3), seg('40', 40, 0, 8, 4), seg('500', 500, 0, 0.4, 5),
  seg('60', 60, 0, 6, 0), seg('150', 150, 0, 2.5, 1), seg('2 jetons', 0, 2, 1, 2), seg('1000', 1000, 0, 0.1, 3),
];

export const DEFAULT_WHEEL: WheelConfig = {
  enabled: true, minAccountDays: 3, segments: DEFAULT_SEGMENTS,
  streak: { bonusPerDay: 0.05, maxBonus: 0.5, weeklyBonus: 100 },
};

const int = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};
const num = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

/**
 * Réglages valides. Le nombre de secteurs ne change pas (la roue est dessinée pour seize) : on règle la valeur, les jetons, le poids et la couleur de chacun.
 * Un poids à 0 retire un secteur du tirage ; il faut qu'au moins un secteur puisse sortir.
 */
export function normalizeWheel(raw: any, previous: WheelConfig = DEFAULT_WHEEL): WheelConfig {
  const r = raw && typeof raw === 'object' ? raw : {};
  const segments = previous.segments.map((p, i) => {
    const s = Array.isArray(r.segments) && r.segments[i] && typeof r.segments[i] === 'object' ? r.segments[i] : {};
    return {
      label: typeof s.label === 'string' && s.label.trim() ? s.label.trim().slice(0, 12) : p.label,
      points: int(s.points, 0, 1_000_000, p.points),
      tokens: int(s.tokens, 0, 20, p.tokens),
      weight: num(s.weight, 0, 1000, p.weight),
      color: typeof s.color === 'string' && /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : p.color,
    };
  });
  const ok = segments.some((s) => s.weight > 0 && (s.points > 0 || s.tokens > 0));
  const st = r.streak && typeof r.streak === 'object' ? r.streak : {};
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : previous.enabled,
    minAccountDays: int(r.minAccountDays, 0, 3650, previous.minAccountDays),
    segments: ok ? segments : previous.segments,
    streak: {
      bonusPerDay: num(st.bonusPerDay, 0, 0.5, previous.streak.bonusPerDay),
      maxBonus: num(st.maxBonus, 0, 5, previous.streak.maxBonus),
      weeklyBonus: int(st.weeklyBonus, 0, 100_000, previous.streak.weeklyBonus),
    },
  };
}

/** Secteur tiré : `random` est un nombre de [0, 1[ ; les secteurs au poids nul ne sortent jamais. */
export function pickSegment(segments: Segment[], random: number): number {
  const total = segments.reduce((s, x) => s + Math.max(0, x.weight), 0);
  let t = Math.min(Math.max(random, 0), 0.999999999) * total;
  for (let i = 0; i < segments.length; i++) {
    const w = Math.max(0, segments[i].weight);
    if (w > 0 && t < w) return i;
    t -= w;
  }
  return segments.findIndex((s) => s.weight > 0);
}

/** Jour (AAAA-MM-JJ) avant un autre jour. Calcul sur le calendrier : sans effet de l'heure d'été. */
export function dayBefore(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, 12));
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
}

/** Longueur de la série d'aujourd'hui : un jour de plus si le dernier tour était hier, sinon on repart de 1. */
export function nextStreak(lastDay: string | null, lastStreak: number, today: string): number {
  return lastDay !== null && lastDay === dayBefore(today) ? lastStreak + 1 : 1;
}

/** Multiplicateur du lot selon la série (1 le premier jour). */
export function streakMultiplier(streak: number, cfg: WheelConfig): number {
  return 1 + Math.min(cfg.streak.maxBonus, Math.max(0, streak - 1) * cfg.streak.bonusPerDay);
}

export interface Reward { points: number; tokens: number; streakBonus: number; total: number }

/** Lot final : points du secteur augmentés par la série (arrondi à l'entier), jetons tels quels, et bonus de 7 jours de suite. */
export function rewardFor(segment: Segment, streak: number, cfg: WheelConfig): Reward {
  const points = Math.round(segment.points * streakMultiplier(streak, cfg));
  const streakBonus = streak > 0 && streak % 7 === 0 ? cfg.streak.weeklyBonus : 0;
  return { points, tokens: segment.tokens, streakBonus, total: points + streakBonus };
}

/** Valeur moyenne d'un tour, en points (les jetons freeleech sont comptés à `tokenValue` points chacun), pour une série donnée. Sert à connaître le coût de la roue. */
export function expectedValue(cfg: WheelConfig, streak = 1, tokenValue = 300): number {
  const total = cfg.segments.reduce((s, x) => s + Math.max(0, x.weight), 0);
  if (total <= 0) return 0;
  const mult = streakMultiplier(streak, cfg);
  return cfg.segments.reduce((s, x) => s + (Math.max(0, x.weight) / total) * (x.points * mult + x.tokens * tokenValue), 0);
}
