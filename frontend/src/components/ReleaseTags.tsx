import { minutesFr, shortDateFr } from '../lib/frText';

/**
 * Caractéristiques techniques d'un torrent, en étiquettes lisibles (« Langue : VFQ »), sous le nom et le hash de sa page :
 * la date d'ajout d'abord, la langue juste après, puis saison / épisode, année, durée, résolution, source, codec vidéo, format, et le codec audio en dernier.
 */
export default function ReleaseTags({ torrent: t }: { torrent: any }) {
  const season = t.season as string | null | undefined;
  const episode = t.episode as string | null | undefined;
  const seasonNumber = season && /^\d+$/.test(season) ? `Saison ${Number(season)}` : season || null;
  const episodeNumber = episode && /^\d+$/.test(episode) ? `Épisode ${Number(episode)}` : season && episode ? episode : null; // « Saison complète »

  const tags: [string, string, string | number | null | undefined][] = [
    ['dt', 'Ajouté le', shortDateFr(t.createdAt)],
    ['lang', 'Langue', t.language],
    ['ep', 'Saison', seasonNumber],
    ['ep', 'Épisode', episodeNumber],
    ['yr', 'Année', t.year],
    ['yr', 'Durée', minutesFr(t.durationMinutes)],
    ...((t.genres ?? []) as string[]).map((g): [string, string, string] => ['gen', 'Genre', g]),
    ['res', 'Résolution', t.resolution],
    ['src', 'Source', t.source],
    ['src', 'Dynamique', t.hdr ? 'HDR' : null],
    ['cod', 'Vidéo', t.codec],
    ['fmt', 'Format', t.containerFormat],
    ['yr', 'Images/s', t.fps ? `${t.fps} fps` : null],
    ['org', 'Type', t.videoType && t.videoType !== '2D' ? t.videoType : null],
    ['aud', 'Audio', t.audio],
  ];
  const shown = tags.filter(([, , v]) => v);
  if (shown.length === 0) return null;
  return (
    <div className="rt-tags" aria-label="Caractéristiques du torrent">
      {shown.map(([tone, label, value]) => (
        <span key={`${label}-${value}`} className={`rt-tag ${tone}`}><i>{label}</i><b>{value}</b></span>
      ))}
    </div>
  );
}
