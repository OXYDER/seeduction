/**
 * Journal central des points : sources, regroupements et détection des gains inhabituels (logique pure, sans base de données).
 *
 * Un déclencheur PostgreSQL note chaque changement du solde de points d'un membre (créé ou retiré), regroupé par membre, source et heure : le journal reste petit
 * et ne peut rien manquer, même si un nouveau code oublie de le prévenir. La source vient d'une étiquette posée par le jeu (voir `setSource`) ; sans étiquette, c'est « autre ».
 */
export type SourceKind = 'free' | 'house' | 'seed' | 'other';
export interface SourceMeta { id: string; label: string; kind: SourceKind }

/**
 * `free` : points offerts par le site sans mise (c'est ce qui « crée » des points) ; `house` : jeux contre la maison (le solde net des membres est le résultat inverse de
 * la maison) ; `seed` : points gagnés en partageant des torrents ; `other` : dons, échanges, boutique, équipe...
 */
export const SOURCES: SourceMeta[] = [
  { id: 'wheel', label: 'Roue de la fortune', kind: 'free' }, { id: 'quiz', label: 'Quiz quotidien', kind: 'free' }, { id: 'picks', label: 'Pronostics LNH', kind: 'free' },
  { id: 'cards', label: 'Cartes à collectionner', kind: 'free' }, { id: 'challenges', label: 'Défis', kind: 'free' }, { id: 'cashback', label: 'Remise de fidélité', kind: 'free' },
  { id: 'goal', label: 'Buts du Canadien', kind: 'free' },
  { id: 'slots', label: 'Machines à sous', kind: 'house' }, { id: 'hilo', label: 'Plus haut ou plus bas', kind: 'house' }, { id: 'blackjack', label: 'Blackjack', kind: 'house' },
  { id: 'dice', label: 'Dés', kind: 'house' }, { id: 'moj', label: 'Mise-O-jeu', kind: 'house' },
  { id: 'seed', label: 'Partage de torrents', kind: 'seed' },
  { id: 'echange', label: 'Échanges et boutique', kind: 'other' }, { id: 'autre', label: 'Autres (dons, requêtes, équipe...)', kind: 'other' },
];
const BY_ID = new Map(SOURCES.map((s) => [s.id, s]));
export const sourceMeta = (id: string): SourceMeta => BY_ID.get(id) ?? { id, label: id, kind: 'other' };

/** Identifiants valides d'étiquette (lettres minuscules, 2 à 16 caractères) : tout le reste est ramené à « autre ». */
export const cleanSource = (s: string): string => (/^[a-z]{2,16}$/.test(s) ? s : 'autre');

/** Pose l'étiquette de source pour les changements de points de la transaction en cours (transaction interactive ou liste de requêtes). */
export function setSource(db: { $executeRaw: (strings: TemplateStringsArray, ...values: any[]) => any }, source: string) {
  return db.$executeRaw`SELECT set_config('app.pts_source', ${cleanSource(source)}, true)`;
}

export interface LedgerRow { userId?: string; source: string; hour: Date; credit: number; debit: number; count?: number }
export interface Flow { credit: number; debit: number; count: number }

const EMPTY = (): Flow => ({ credit: 0, debit: 0, count: 0 });

/** Jour (AAAA-MM-JJ, heure de Montréal) qui contient une heure du journal. */
export function dayKey(hour: Date, timeZone = 'America/Toronto'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(hour);
}

/** Totaux par source. */
export function totalsBySource(rows: LedgerRow[]): Map<string, Flow> {
  const out = new Map<string, Flow>();
  for (const r of rows) {
    const f = out.get(r.source) ?? EMPTY();
    f.credit += r.credit; f.debit += r.debit; f.count += r.count ?? 0;
    out.set(r.source, f);
  }
  return out;
}

/** Totaux par jour puis par source, du plus ancien au plus récent. */
export function byDay(rows: LedgerRow[]): { day: string; sources: Map<string, Flow> }[] {
  const days = new Map<string, Map<string, Flow>>();
  for (const r of rows) {
    const d = dayKey(r.hour);
    const m = days.get(d) ?? new Map<string, Flow>();
    const f = m.get(r.source) ?? EMPTY();
    f.credit += r.credit; f.debit += r.debit; f.count += r.count ?? 0;
    m.set(r.source, f); days.set(d, m);
  }
  return [...days.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, sources]) => ({ day, sources }));
}

/** Points « créés » par les sources gratuites : tout ce qu'elles ont crédité moins ce qu'elles ont repris (il n'y en a presque jamais). */
export function createdFree(totals: Map<string, Flow>): number {
  let n = 0;
  for (const [id, f] of totals) if (sourceMeta(id).kind === 'free') n += f.credit - f.debit;
  return n;
}

/** Résultat des jeux contre la maison : positif = la maison a gagné des points aux membres. */
export function houseResult(totals: Map<string, Flow>): number {
  let n = 0;
  for (const [id, f] of totals) if (sourceMeta(id).kind === 'house') n += f.debit - f.credit;
  return n;
}

export interface Earner { userId: string; net: number; bySource: Record<string, number> }

/**
 * Les membres qui ont gagné le plus de points avec les sources gratuites et les jeux (jamais le partage de torrents, les dons ni les échanges, qui peuvent être
 * légitimement très élevés). `rows` doit contenir une ligne par membre et par source.
 */
export function topEarners(rows: (LedgerRow & { userId: string })[], limit = 10): Earner[] {
  const kinds = new Set<SourceKind>(['free', 'house']);
  const by = new Map<string, Earner>();
  for (const r of rows) {
    if (!kinds.has(sourceMeta(r.source).kind)) continue;
    const e = by.get(r.userId) ?? { userId: r.userId, net: 0, bySource: {} };
    const net = r.credit - r.debit;
    e.net += net; e.bySource[r.source] = (e.bySource[r.source] ?? 0) + net;
    by.set(r.userId, e);
  }
  return [...by.values()].filter((e) => e.net > 0).sort((a, b) => b.net - a.net).slice(0, limit);
}

/** Ceux qui dépassent le seuil de gains sur la période (0 ou moins : aucune alerte). */
export const flagged = (earners: Earner[], threshold: number): Earner[] => (threshold > 0 ? earners.filter((e) => e.net >= threshold) : []);

export interface EconomyConfig { alertThreshold: number }
export const DEFAULT_ECONOMY: EconomyConfig = { alertThreshold: 1500 };
export function normalizeEconomy(raw: any, previous: EconomyConfig = DEFAULT_ECONOMY): EconomyConfig {
  const n = Math.floor(Number((raw ?? {}).alertThreshold));
  return { alertThreshold: Number.isFinite(n) && n >= 0 && n <= 10_000_000 ? n : previous.alertThreshold };
}
