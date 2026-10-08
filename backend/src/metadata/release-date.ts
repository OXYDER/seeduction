/**
 * Date de SORTIE d'un contenu (film, épisode de série, saison, jeu, album, livre) : jamais la date de mise en ligne sur le site.
 * Valeur « AAAA-MM-JJ » (ou « AAAA-MM » / « AAAA » quand la fiche n'est pas plus précise).
 *
 * - film, jeu, album, livre : la date de la fiche ;
 * - épisode de série : la date de diffusion de CET épisode (`episodeAirDate`) ;
 * - saison complète : la date de début de cette saison ;
 * - série sans saison indiquée : la première diffusion de la série.
 */
export function releaseDateOf(info: any, season?: string | null, episodeAirDate?: string | null): string | null {
  if (!info || typeof info !== 'object') return null;
  const clean = (v: unknown): string | null => {
    const s = typeof v === 'string' ? v.trim().slice(0, 10) : '';
    return /^\d{4}(-\d{2}(-\d{2})?)?$/.test(s) ? s : null;
  };
  if (info.kind === 'tv') {
    const ep = clean(episodeAirDate);
    if (ep) return ep;
    if (season && /^\d+$/.test(season)) {
      const s = (Array.isArray(info.seasonList) ? info.seasonList : []).find((x: any) => Number(x?.number) === Number(season));
      const d = clean(s?.airDate);
      if (d) return d;
    }
    return clean(info.releaseDate);
  }
  return clean(info.releaseDate) ?? clean(info.publishedDate) ?? clean(info.released);
}
