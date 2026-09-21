export interface Coverage {
  season: number;
  /** Numéros d'épisodes couverts ; null = saison complète (pack) sans détail d'épisodes. */
  episodes: number[] | null;
}

const NOT_ALNUM_BEFORE = '(?<![a-z0-9])';

/**
 * Déduit quelles saisons/épisodes d'une série un torrent contient, à partir des
 * noms de fichiers (S01E02, S01E02E03, S01E02-04, 1x02) puis, à défaut, du nom
 * du torrent (pack "S01", "S01-S03", "Saison 2").
 */
export function parseCoverage(name: string, files: { path: string }[]): Coverage[] {
  const perSeason = new Map<number, Set<number>>();
  const add = (season: number, from: number, to?: number) => {
    const set = perSeason.get(season) ?? new Set<number>();
    const last = to !== undefined && to >= from && to - from < 60 ? to : from;
    for (let e = from; e <= last; e++) set.add(e);
    perSeason.set(season, set);
  };

  const sxe = new RegExp(`${NOT_ALNUM_BEFORE}s(\\d{1,2})[ ._-]*e(\\d{1,3})(?:[ ._]*(?:-|e)[ ._]*e?(\\d{1,3}))?(?!\\d)`, 'gi');
  const nxm = new RegExp(`${NOT_ALNUM_BEFORE}(\\d{1,2})x(\\d{2,3})(?!\\d)`, 'gi');
  for (const f of files) {
    for (const m of f.path.matchAll(sxe)) add(Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : undefined);
    for (const m of f.path.matchAll(nxm)) add(Number(m[1]), Number(m[2]));
  }

  if (perSeason.size > 0) {
    return [...perSeason.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([season, eps]) => ({ season, episodes: [...eps].sort((a, b) => a - b) }));
  }

  const seasons = new Set<number>();
  const range = name.match(new RegExp(`${NOT_ALNUM_BEFORE}s(\\d{1,2})[ ._]*-[ ._]*s?(\\d{1,2})(?![a-z0-9])`, 'i'));
  if (range && Number(range[2]) >= Number(range[1]) && Number(range[2]) - Number(range[1]) < 40) {
    for (let s = Number(range[1]); s <= Number(range[2]); s++) seasons.add(s);
  }
  for (const m of name.matchAll(new RegExp(`${NOT_ALNUM_BEFORE}s(\\d{1,2})(?![a-z0-9])`, 'gi'))) seasons.add(Number(m[1]));
  for (const m of name.matchAll(/(?:saison|season)[ ._-]*(\d{1,2})/gi)) seasons.add(Number(m[1]));

  return [...seasons].sort((a, b) => a - b).map((season) => ({ season, episodes: null }));
}
