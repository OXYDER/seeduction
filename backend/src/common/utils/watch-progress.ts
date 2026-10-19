/**
 * « Continuer à regarder » : logique pure (testée) qui décide, à partir des positions de lecture, ce qu'il faut reprendre et quel épisode proposer ensuite.
 */
export interface Played { positionSeconds: number; durationSeconds: number | null }

/** Presque tout vu : dans les 30 dernières secondes, ou au moins 92 % de la durée. */
export function isFinished(p: Played): boolean {
  if (p.durationSeconds == null || p.durationSeconds <= 0) return false;
  return p.positionSeconds >= p.durationSeconds - 30 || p.positionSeconds / p.durationSeconds >= 0.92;
}

/** Assez entamé pour proposer de reprendre (plus de 2 minutes) et pas terminé. */
export function isResumable(p: Played): boolean {
  return p.positionSeconds > 120 && !isFinished(p);
}

/** Entier d'une saison ou d'un épisode stocké en texte (« 01 », « 1 », « S01 »…), ou null. */
export function numOf(v: string | null | undefined): number | null {
  const m = /(\d{1,4})/.exec(String(v ?? ''));
  return m ? Number(m[1]) : null;
}

/** Les écritures possibles d'un numéro en base (« 5 » et « 05 »). */
export const numVariants = (n: number): string[] => [String(n), String(n).padStart(2, '0')];

/** Épisodes à chercher après celui-ci : le suivant de la saison, puis le premier de la saison suivante. */
export function nextEpisodes(season: number, episode: number): { season: number; episode: number }[] {
  return [{ season, episode: episode + 1 }, { season: season + 1, episode: 1 }];
}

/** « Youth.S01E05.MULTI.1080p… » → « Youth » (titre de la série, pour l'affichage). */
export function seriesTitleOf(name: string): string {
  const cut = String(name ?? '').split(/[. _-]S\d{1,3}[. _-]?E\d{1,4}/i)[0] || String(name ?? '');
  return cut.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/** Parmi les releases de l'épisode suivant, celle qui ressemble le plus à ce que le membre regardait (même résolution, même langue), puis la mieux seedée. */
export function pickRelease<T extends { resolution?: string | null; language?: string | null; seeders?: number | null }>(options: T[], watched: { resolution?: string | null; language?: string | null }): T | null {
  if (options.length === 0) return null;
  const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
  const score = (o: T) => (same(o.resolution, watched.resolution) ? 4 : 0) + (same(o.language, watched.language) ? 2 : 0) + ((o.seeders ?? 0) > 0 ? 1 : 0);
  return [...options].sort((a, b) => score(b) - score(a) || (b.seeders ?? 0) - (a.seeders ?? 0))[0];
}
