/**
 * Tournoi de la semaine : un classement GRATUIT (aucune mise, aucun droit d'entrée) alimenté par ce que les membres font déjà dans les jeux gratuits (roue, quiz, pronostics, cartes, parties
 * gratuites du jour). Le site offre les prix ; un gros lot progressif s'ajoute et se gagne en finissant premier avec assez de points. Logique pure (testée) : réglages, points, classement, prix.
 */
export type ScoreEvent = 'wheel' | 'quiz' | 'quiz_correct' | 'quiz_perfect' | 'picks' | 'picks_won' | 'cards_open' | 'cards_daily' | 'free_play';
export const EVENTS: ScoreEvent[] = ['wheel', 'quiz', 'quiz_correct', 'quiz_perfect', 'picks', 'picks_won', 'cards_open', 'cards_daily', 'free_play'];

/** Ce que chaque source rapporte au tournoi, en français pour l'affichage. */
export const EVENT_LABEL: Record<ScoreEvent, string> = {
  wheel: 'Tour de la roue de la fortune', quiz: 'Quiz du jour terminé', quiz_correct: 'Bonne réponse au quiz', quiz_perfect: 'Quiz sans faute (bonus)', picks: 'Pronostic fait', picks_won: 'Pronostic gagné',
  cards_open: 'Paquet de cartes ouvert', cards_daily: 'Paquet quotidien réclamé', free_play: 'Partie gratuite du jour',
};

export interface PrizeTier { from: number; to: number; points: number; tokens: number; packs: number }
export interface TournamentConfig {
  enabled: boolean;
  minAccountDays: number;
  weights: Record<ScoreEvent, number>;
  /** Points maximum qu'un membre peut compter dans une semaine. */
  weeklyCap: number;
  /** Points minimum pour figurer au classement (et viser un prix de rang). */
  minPointsToRank: number;
  prizes: PrizeTier[];
  /** Petit prix pour toute personne qui a joué au moins `participation.minPoints` points. */
  participation: { minPoints: number; points: number };
  jackpot: { add: number; minWinnerPoints: number; cap: number };
}

export const DEFAULT_TOURNAMENT: TournamentConfig = {
  enabled: true, minAccountDays: 3,
  weights: { wheel: 5, quiz: 10, quiz_correct: 4, quiz_perfect: 20, picks: 3, picks_won: 10, cards_open: 3, cards_daily: 3, free_play: 4 },
  weeklyCap: 600, minPointsToRank: 20,
  prizes: [{ from: 1, to: 1, points: 300, tokens: 3, packs: 1 }, { from: 2, to: 2, points: 200, tokens: 2, packs: 1 }, { from: 3, to: 3, points: 120, tokens: 1, packs: 0 }, { from: 4, to: 10, points: 40, tokens: 0, packs: 0 }],
  participation: { minPoints: 30, points: 10 },
  jackpot: { add: 100, minWinnerPoints: 150, cap: 2000 },
};

const int = (v: unknown, def: number, min: number, max: number) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def; };

export function normalizeTournament(raw: any): TournamentConfig {
  const d = DEFAULT_TOURNAMENT;
  const weights = { ...d.weights };
  for (const e of EVENTS) weights[e] = int(raw?.weights?.[e], d.weights[e], 0, 500);
  let prizes: PrizeTier[] = Array.isArray(raw?.prizes) ? raw.prizes.slice(0, 12).map((p: any) => ({ from: int(p?.from, 1, 1, 1000), to: int(p?.to, 1, 1, 1000), points: int(p?.points, 0, 0, 100_000), tokens: int(p?.tokens, 0, 0, 50), packs: int(p?.packs, 0, 0, 10) })) : d.prizes;
  prizes = prizes.map((p) => ({ ...p, to: Math.max(p.from, p.to) })).sort((a, b) => a.from - b.from);
  // pas de chevauchement : un rang n'a qu'un prix (le premier de la liste l'emporte)
  const clean: PrizeTier[] = [];
  let next = 1;
  for (const p of prizes) { if (p.to < next) continue; const from = Math.max(p.from, next); clean.push({ ...p, from }); next = p.to + 1; }
  return {
    enabled: raw?.enabled === undefined ? d.enabled : raw.enabled === true,
    minAccountDays: int(raw?.minAccountDays, d.minAccountDays, 0, 365), weights,
    weeklyCap: int(raw?.weeklyCap, d.weeklyCap, 10, 100_000), minPointsToRank: int(raw?.minPointsToRank, d.minPointsToRank, 1, 10_000),
    prizes: clean,
    participation: { minPoints: int(raw?.participation?.minPoints, d.participation.minPoints, 1, 10_000), points: int(raw?.participation?.points, d.participation.points, 0, 10_000) },
    jackpot: { add: int(raw?.jackpot?.add, d.jackpot.add, 0, 100_000), minWinnerPoints: int(raw?.jackpot?.minWinnerPoints, d.jackpot.minWinnerPoints, 1, 100_000), cap: int(raw?.jackpot?.cap, d.jackpot.cap, 0, 1_000_000) },
  };
}

/** Points que rapporte un événement (« bonne réponse » compte une fois par bonne réponse, via `amount`). */
export function pointsFor(event: string, amount: number | undefined, cfg: TournamentConfig): number {
  if (!(EVENTS as string[]).includes(event)) return 0;
  const w = cfg.weights[event as ScoreEvent] ?? 0;
  return event === 'quiz_correct' ? w * Math.max(0, Math.min(50, Math.floor(amount ?? 1))) : w;
}

/** Ajoute des points en respectant le plafond de la semaine : renvoie ce qui est réellement compté. */
export function capped(current: number, add: number, cap: number): number {
  return Math.max(0, Math.min(add, cap - current));
}

export interface Row { userId: string; points: number; lastAt: number }
export interface Ranked extends Row { rank: number }

/** Classement : plus de points d'abord ; à égalité, celui qui a atteint son total le premier gagne (puis l'identifiant, pour un ordre toujours le même). */
export function rank(rows: Row[], minPoints: number): Ranked[] {
  return rows.filter((r) => r.points >= minPoints).sort((a, b) => b.points - a.points || a.lastAt - b.lastAt || (a.userId < b.userId ? -1 : 1)).map((r, i) => ({ ...r, rank: i + 1 }));
}

export const tierFor = (rankNo: number, cfg: TournamentConfig): PrizeTier | null => cfg.prizes.find((p) => rankNo >= p.from && rankNo <= p.to) ?? null;

export interface Award { userId: string; rank: number | null; points: number; prizePoints: number; tokens: number; packs: number; jackpot: number }

/** Les prix d'une semaine terminée : prix de rang, petit prix de participation, et gros lot si le premier a assez de points ; renvoie aussi le gros lot reporté à la semaine suivante. */
export function settle(rows: Row[], cfg: TournamentConfig, carried: number): { awards: Award[]; jackpotPaid: number; nextJackpot: number; ranked: Ranked[] } {
  const ranked = rank(rows, cfg.minPointsToRank);
  const pool = Math.min(cfg.jackpot.cap, carried + cfg.jackpot.add);
  const awards = new Map<string, Award>();
  for (const r of ranked) {
    const t = tierFor(r.rank, cfg);
    if (t) awards.set(r.userId, { userId: r.userId, rank: r.rank, points: r.points, prizePoints: t.points, tokens: t.tokens, packs: t.packs, jackpot: 0 });
  }
  for (const r of rows) {
    if (r.points >= cfg.participation.minPoints && cfg.participation.points > 0 && !awards.has(r.userId)) awards.set(r.userId, { userId: r.userId, rank: ranked.find((x) => x.userId === r.userId)?.rank ?? null, points: r.points, prizePoints: cfg.participation.points, tokens: 0, packs: 0, jackpot: 0 });
  }
  let jackpotPaid = 0;
  const winner = ranked[0];
  if (winner && winner.points >= cfg.jackpot.minWinnerPoints && pool > 0) {
    jackpotPaid = pool;
    const a = awards.get(winner.userId) ?? { userId: winner.userId, rank: 1, points: winner.points, prizePoints: 0, tokens: 0, packs: 0, jackpot: 0 };
    a.jackpot = pool;
    awards.set(winner.userId, a);
  }
  return { awards: [...awards.values()].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9)), jackpotPaid, nextJackpot: jackpotPaid > 0 ? 0 : pool, ranked };
}

/** Semaine (lundi → dimanche) qui contient un jour AAAA-MM-JJ : sa clé est le lundi. */
export function weekKeyOfDay(day: string): string {
  const t = new Date(`${day}T00:00:00Z`);
  const dow = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dow);
  return t.toISOString().slice(0, 10);
}
export const nextWeekKey = (key: string): string => { const t = new Date(`${key}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + 7); return t.toISOString().slice(0, 10); };
export const prevWeekKey = (key: string): string => { const t = new Date(`${key}T00:00:00Z`); t.setUTCDate(t.getUTCDate() - 7); return t.toISOString().slice(0, 10); };
