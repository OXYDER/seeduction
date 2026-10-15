// Scores de la LNH (Canadiens de Montréal) : mise en forme des données de l'API publique de la LNH (api-web.nhle.com). Logique pure, sans réseau, pour pouvoir la tester.

export type GameState = 'FUT' | 'PRE' | 'LIVE' | 'FINAL' | 'PPD';

export interface TeamSide { abbrev: string; name: string; score: number | null; sog: number | null }

export interface Game {
  id: number;
  date: string;
  startUtc: string;
  state: GameState;
  /** Type de match : pré-saison, saison régulière, séries. */
  kind: 'PRESAISON' | 'SAISON' | 'SERIES' | 'AUTRE';
  home: TeamSide;
  away: TeamSide;
  venue: string | null;
  tv: string[];
  /** En cours : période (« 2e période ») et temps restant. */
  period: string | null;
  clock: { remaining: string; running: boolean; intermission: boolean } | null;
  /** Terminé : « Final », « Final (prolongation) », « Final (tirs de barrage) ». */
  outcome: string | null;
  /** Pour l'équipe suivie : true = victoire, false = défaite (y compris en prolongation), null = pas terminé. */
  won: boolean | null;
  /** « domicile » ou « visiteur » pour l'équipe suivie. */
  side: 'home' | 'away';
}

const KIND: Record<number, Game['kind']> = { 1: 'PRESAISON', 2: 'SAISON', 3: 'SERIES' };

export function periodLabel(n: number | undefined, type?: string): string | null {
  if (!n) return null;
  if (type === 'SO') return 'Tirs de barrage';
  if (type === 'OT' || n > 3) return n > 4 && type === 'OT' ? `${n - 3}e prolongation` : 'Prolongation';
  return n === 1 ? '1re période' : `${n}e période`;
}

export function outcomeLabel(lastPeriodType?: string): string {
  if (lastPeriodType === 'SO') return 'Final (tirs de barrage)';
  if (lastPeriodType === 'OT') return 'Final (prolongation)';
  return 'Final';
}

function stateOf(raw: any): GameState {
  if (raw?.gameScheduleState === 'PPD' || raw?.gameScheduleState === 'CNCL') return 'PPD';
  switch (raw?.gameState) {
    case 'LIVE': case 'CRIT': return 'LIVE';
    case 'FINAL': case 'OFF': return 'FINAL';
    case 'PRE': return 'PRE';
    default: return 'FUT';
  }
}

const num = (v: any): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const nameOf = (t: any): string => String(t?.commonName?.default ?? t?.name?.default ?? t?.abbrev ?? '?');

function side(t: any): TeamSide {
  return { abbrev: String(t?.abbrev ?? '?'), name: nameOf(t), score: num(t?.score), sog: num(t?.sog) };
}

/** Un match de l'API (calendrier du club ou tableau des scores : les deux formats sont acceptés) vu depuis l'équipe `team`. */
export function normalizeGame(raw: any, team = 'MTL'): Game {
  const home = side(raw.homeTeam), away = side(raw.awayTeam);
  const state = stateOf(raw);
  const mine = home.abbrev === team ? 'home' : 'away';
  const myScore = mine === 'home' ? home.score : away.score;
  const theirScore = mine === 'home' ? away.score : home.score;
  const live = state === 'LIVE';
  const pd = raw.periodDescriptor;
  const c = raw.clock;
  return {
    id: Number(raw.id), date: String(raw.gameDate ?? '').slice(0, 10), startUtc: String(raw.startTimeUTC ?? ''), state,
    kind: KIND[Number(raw.gameType)] ?? 'AUTRE', home, away,
    venue: raw.venue?.default ?? (typeof raw.venue === 'string' ? raw.venue : null),
    tv: [...new Set((raw.tvBroadcasts ?? []).filter((b: any) => b.countryCode === 'CA').map((b: any) => String(b.network)))] as string[],
    period: live || state === 'PRE' ? periodLabel(pd?.number ?? raw.period, pd?.periodType) : null,
    clock: live && c ? { remaining: String(c.timeRemaining ?? ''), running: !!c.running, intermission: !!c.inIntermission } : null,
    outcome: state === 'FINAL' ? outcomeLabel(raw.gameOutcome?.lastPeriodType ?? pd?.periodType) : null,
    won: state === 'FINAL' && myScore !== null && theirScore !== null ? myScore > theirScore : null,
    side: mine,
  };
}

export interface Summary {
  live: Game | null;
  /** Le match d'aujourd'hui (à venir, en cours, ou terminé il y a peu) : celui qu'on affiche dans l'en-tête. */
  featured: Game | null;
  last: Game[];
  next: Game[];
}

const HOUR = 3600_000;

/** Choisit quoi afficher : le match en cours, sinon celui qui va commencer / vient de finir (à moins de 12 h), plus les 5 derniers résultats et les 3 prochains matchs. */
export function summarize(games: Game[], now: Date): Summary {
  const sorted = [...games].sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  const t = now.getTime();
  const live = sorted.find((g) => g.state === 'LIVE') ?? null;
  const finals = sorted.filter((g) => g.state === 'FINAL');
  const upcoming = sorted.filter((g) => g.state === 'FUT' || g.state === 'PRE');
  const lastFinal = finals[finals.length - 1] ?? null;
  const nextGame = upcoming[0] ?? null;
  let featured: Game | null = live;
  if (!featured && nextGame && new Date(nextGame.startUtc).getTime() - t < 12 * HOUR) featured = nextGame;
  if (!featured && lastFinal && t - new Date(lastFinal.startUtc).getTime() < 14 * HOUR) featured = lastFinal;
  return { live, featured, last: finals.slice(-5).reverse(), next: upcoming.slice(0, 3) };
}

/** Faut-il interroger les scores en direct ? Oui de 30 minutes avant la mise au jeu jusqu'à 5 heures après. */
export function inLiveWindow(games: Game[], now: Date): boolean {
  const t = now.getTime();
  return games.some((g) => {
    if (g.state === 'PPD') return false;
    const start = new Date(g.startUtc).getTime();
    return t >= start - 0.5 * HOUR && t <= start + 5 * HOUR;
  });
}
