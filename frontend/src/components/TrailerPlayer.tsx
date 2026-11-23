/** Une bande-annonce de fiche : YouTube (films, séries, animés) ou vidéo hébergée par Steam (jeux). */
export interface Trailer { site?: string; key?: string; url?: string; poster?: string | null; name?: string }

export const hasTrailer = (t?: Trailer | null): t is Trailer => !!t && (!!t.key || !!t.url);

/** Vignette de la bande-annonce (pour la galerie) : image de la vidéo YouTube ou affiche fournie par Steam. */
export const trailerPoster = (t: Trailer): string | null => (t.key ? `https://i.ytimg.com/vi/${encodeURIComponent(t.key)}/hqdefault.jpg` : t.poster ?? null);

export default function TrailerPlayer({ trailer }: { trailer: Trailer }) {
  if (trailer.key) {
    return (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailer.key)}?autoplay=1&rel=0`}
        title="Bande-annonce"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    );
  }
  return <video src={trailer.url} poster={trailer.poster ?? undefined} controls autoPlay playsInline preload="metadata" />;
}
